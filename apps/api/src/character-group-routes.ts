import { AppError, createId, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { readRoleplayModelIdForPlan } from './model-registry-config';
import { readEffectivePlan } from './plans';
import type { Env, Variables } from './types';

interface GroupEnvironment {
  Bindings: Env;
  Variables: Variables;
}

const groupInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  avatarFileId: z.uuid().nullable().default(null),
  routingMode: z.enum(['CONTEXTUAL', 'MANUAL']).default('CONTEXTUAL'),
  characterIds: z.array(z.uuid()).min(1).max(12),
});

const groupPatchSchema = groupInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0);

interface GroupRow {
  readonly id: string;
  readonly name: string;
  readonly avatarFileId: string | null;
  readonly routingMode: 'CONTEXTUAL' | 'MANUAL';
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface MemberRow {
  readonly characterId: string;
  readonly position: number;
  readonly name: string;
  readonly tagline: string;
  readonly avatarFileId: string | null;
  readonly avatarFocalX: number;
  readonly avatarFocalY: number;
}

interface StartMemberRow extends MemberRow {
  readonly characterVersionId: string;
  readonly firstMessage: string;
  readonly ownerId: string;
  readonly publishState: string;
  readonly visibility: string;
}

const groupProjection = `g.id, g.name, g.avatar_file_id AS avatarFileId,
  g.routing_mode AS routingMode, g.created_at AS createdAt, g.updated_at AS updatedAt`;

export const characterGroupRoutes = new Hono<GroupEnvironment>();

characterGroupRoutes.get('/', async (context) => {
  const principal = context.get('principal');
  const groups = await context.env.DB.prepare(
    `SELECT ${groupProjection} FROM character_groups g
     WHERE g.owner_id = ? AND g.deleted_at IS NULL
     ORDER BY g.updated_at DESC, g.id DESC LIMIT 100`,
  )
    .bind(principal.userId)
    .all<GroupRow>();
  return context.json({
    items: await Promise.all(
      groups.results.map(async (group) => ({
        ...group,
        members: await readGroupMembers(context.env.DB, group.id),
      })),
    ),
  });
});

characterGroupRoutes.get('/:groupId', async (context) => {
  const principal = context.get('principal');
  const group = await requireOwnedGroup(
    context.env.DB,
    principal.userId,
    context.req.param('groupId'),
  );
  return context.json({ ...group, members: await readGroupMembers(context.env.DB, group.id) });
});

characterGroupRoutes.post('/', async (context) => {
  const principal = context.get('principal');
  const input = groupInputSchema.parse(await context.req.json());
  await Promise.all([
    requireOwnedAvatar(context.env.DB, principal.userId, input.avatarFileId),
    requireAvailableMembers(context.env.DB, principal.userId, input.characterIds),
  ]);
  const id = createId();
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO character_groups
         (id, owner_id, name, avatar_file_id, routing_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      principal.userId,
      input.name,
      input.avatarFileId,
      input.routingMode,
      timestamp,
      timestamp,
    ),
    ...input.characterIds.map((characterId, position) =>
      context.env.DB.prepare(
        `INSERT INTO character_group_members
           (group_id, character_id, position, added_at) VALUES (?, ?, ?, ?)`,
      ).bind(id, characterId, position, timestamp),
    ),
  ]);
  const group = await requireOwnedGroup(context.env.DB, principal.userId, id);
  return context.json({ ...group, members: await readGroupMembers(context.env.DB, group.id) }, 201);
});

characterGroupRoutes.patch('/:groupId', async (context) => {
  const principal = context.get('principal');
  const id = context.req.param('groupId');
  const current = await requireOwnedGroup(context.env.DB, principal.userId, id);
  const input = groupPatchSchema.parse(await context.req.json());
  const avatarFileId = input.avatarFileId === undefined ? current.avatarFileId : input.avatarFileId;
  const characterIds =
    input.characterIds ??
    (await readGroupMembers(context.env.DB, id)).map(({ characterId }) => characterId);
  await Promise.all([
    requireOwnedAvatar(context.env.DB, principal.userId, avatarFileId),
    requireAvailableMembers(context.env.DB, principal.userId, characterIds),
  ]);
  const timestamp = nowMs();
  const statements = [
    context.env.DB.prepare(
      `UPDATE character_groups SET name = ?, avatar_file_id = ?, routing_mode = ?, updated_at = ?
         WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    ).bind(
      input.name ?? current.name,
      avatarFileId,
      input.routingMode ?? current.routingMode,
      timestamp,
      id,
      principal.userId,
    ),
  ];
  if (input.characterIds) {
    statements.push(
      context.env.DB.prepare('DELETE FROM character_group_members WHERE group_id = ?').bind(id),
    );
    statements.push(
      ...characterIds.map((characterId, position) =>
        context.env.DB.prepare(
          `INSERT INTO character_group_members
             (group_id, character_id, position, added_at) VALUES (?, ?, ?, ?)`,
        ).bind(id, characterId, position, timestamp),
      ),
    );
  }
  await context.env.DB.batch(statements);
  const group = await requireOwnedGroup(context.env.DB, principal.userId, id);
  return context.json({ ...group, members: await readGroupMembers(context.env.DB, group.id) });
});

characterGroupRoutes.delete('/:groupId', async (context) => {
  const principal = context.get('principal');
  const id = context.req.param('groupId');
  await requireOwnedGroup(context.env.DB, principal.userId, id);
  await context.env.DB.prepare(
    `UPDATE character_groups SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
  )
    .bind(nowMs(), nowMs(), id, principal.userId)
    .run();
  return context.body(null, 204);
});

characterGroupRoutes.post('/:groupId/conversations', async (context) => {
  const principal = context.get('principal');
  const group = await requireOwnedGroup(
    context.env.DB,
    principal.userId,
    context.req.param('groupId'),
  );
  const members = await readStartMembers(context.env.DB, group.id);
  const lead = members[0];
  if (!lead) throw new AppError('EMPTY_CHARACTER_GROUP', 'Добавьте персонажа в группу.', 400);
  const timestamp = nowMs();
  const conversationId = createId();
  const greetingId = createId();
  const plan = await readEffectivePlan(context.env.DB, principal.userId);
  const defaultModelProfileId = await readRoleplayModelIdForPlan(context.env.DB, plan.code);
  const isPreview = members.some(
    (member) =>
      member.ownerId === principal.userId &&
      (member.publishState !== 'PUBLISHED' || !['PUBLIC', 'UNLISTED'].includes(member.visibility)),
  );
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO conversations (
        id, user_id, character_id, character_version_id, title, active_leaf_message_id,
        is_preview, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      conversationId,
      principal.userId,
      lead.characterId,
      lead.characterVersionId,
      group.name,
      greetingId,
      isPreview ? 1 : 0,
      timestamp,
      timestamp,
    ),
    context.env.DB.prepare(
      `INSERT INTO conversation_settings
        (conversation_id, model_profile, model_profile_id, updated_at)
       SELECT ?, generation_profile, ?, ? FROM user_settings WHERE user_id = ?`,
    ).bind(conversationId, defaultModelProfileId, timestamp, principal.userId),
    context.env.DB.prepare(
      `INSERT INTO messages (
        id, conversation_id, role, content, content_format, status, is_greeting,
        edited_by_user, origin, metadata_json, created_at, updated_at
      ) VALUES (?, ?, 'ASSISTANT', ?, 'MARKDOWN', 'COMPLETED', 1, 0,
        'CHARACTER_GREETING', ?, ?, ?)`,
    ).bind(
      greetingId,
      conversationId,
      lead.firstMessage,
      JSON.stringify({ speakerCharacterId: lead.characterId, speakerName: lead.name }),
      timestamp,
      timestamp,
    ),
    context.env.DB.prepare(
      'INSERT INTO conversation_memory (conversation_id, updated_at) VALUES (?, ?)',
    ).bind(conversationId, timestamp),
    context.env.DB.prepare(
      `INSERT INTO conversation_character_groups
        (conversation_id, group_id, routing_mode, active_character_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(conversationId, group.id, group.routingMode, lead.characterId, timestamp),
    ...members.map((member) =>
      context.env.DB.prepare(
        `INSERT INTO conversation_group_members
          (conversation_id, character_id, character_version_id, position)
         VALUES (?, ?, ?, ?)`,
      ).bind(conversationId, member.characterId, member.characterVersionId, member.position),
    ),
  ]);
  return context.json({ conversationId, groupId: group.id }, 201);
});

characterGroupRoutes.patch('/:groupId/conversations/:conversationId/speaker', async (context) => {
  const principal = context.get('principal');
  const input = z.object({ characterId: z.uuid() }).parse(await context.req.json());
  const result = await context.env.DB.prepare(
    `UPDATE conversation_character_groups SET active_character_id = ?
     WHERE group_id = ? AND conversation_id = ?
       AND EXISTS (SELECT 1 FROM conversations c
         WHERE c.id = conversation_character_groups.conversation_id
           AND c.user_id = ? AND c.deleted_at IS NULL)
       AND EXISTS (SELECT 1 FROM conversation_group_members m
         WHERE m.conversation_id = conversation_character_groups.conversation_id
           AND m.character_id = ?)`,
  )
    .bind(
      input.characterId,
      context.req.param('groupId'),
      context.req.param('conversationId'),
      principal.userId,
      input.characterId,
    )
    .run();
  if (result.meta.changes === 0) {
    throw new AppError('GROUP_SPEAKER_UNAVAILABLE', 'Персонаж не входит в этот диалог.', 404);
  }
  return context.json({ activeCharacterId: input.characterId });
});

async function requireOwnedGroup(
  database: D1Database,
  ownerId: string,
  groupId: string,
): Promise<GroupRow> {
  const group = await database
    .prepare(
      `SELECT ${groupProjection} FROM character_groups g
       WHERE g.id = ? AND g.owner_id = ? AND g.deleted_at IS NULL`,
    )
    .bind(groupId, ownerId)
    .first<GroupRow>();
  if (!group) throw new AppError('CHARACTER_GROUP_NOT_FOUND', 'Группа персонажей не найдена.', 404);
  return group;
}

async function readGroupMembers(database: D1Database, groupId: string): Promise<MemberRow[]> {
  const result = await database
    .prepare(
      `SELECT m.character_id AS characterId, m.position, v.name, v.tagline,
       c.avatar_file_id AS avatarFileId, c.avatar_focal_x AS avatarFocalX,
       c.avatar_focal_y AS avatarFocalY
       FROM character_group_members m
       JOIN characters c ON c.id = m.character_id AND c.deleted_at IS NULL
       JOIN character_versions v ON v.id = c.active_version_id
       WHERE m.group_id = ? ORDER BY m.position ASC`,
    )
    .bind(groupId)
    .all<MemberRow>();
  return result.results;
}

async function readStartMembers(database: D1Database, groupId: string): Promise<StartMemberRow[]> {
  const result = await database
    .prepare(
      `SELECT m.character_id AS characterId, m.position, v.name, v.tagline,
       c.avatar_file_id AS avatarFileId, c.avatar_focal_x AS avatarFocalX,
       c.avatar_focal_y AS avatarFocalY, c.active_version_id AS characterVersionId,
       c.owner_id AS ownerId, c.publish_state AS publishState, c.visibility,
       v.first_message AS firstMessage
       FROM character_group_members m
       JOIN characters c ON c.id = m.character_id AND c.deleted_at IS NULL
       JOIN character_versions v ON v.id = c.active_version_id
       WHERE m.group_id = ? ORDER BY m.position ASC`,
    )
    .bind(groupId)
    .all<StartMemberRow>();
  return result.results;
}

async function requireOwnedAvatar(
  database: D1Database,
  ownerId: string,
  avatarFileId: string | null,
): Promise<void> {
  if (!avatarFileId) return;
  const media = await database
    .prepare(
      `SELECT 1 AS found FROM file_objects
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL AND mime_type LIKE 'image/%'`,
    )
    .bind(avatarFileId, ownerId)
    .first<{ readonly found: number }>();
  if (!media) throw new AppError('MEDIA_NOT_FOUND', 'Изображение группы недоступно.', 404);
}

async function requireAvailableMembers(
  database: D1Database,
  userId: string,
  characterIds: readonly string[],
): Promise<void> {
  if (new Set(characterIds).size !== characterIds.length) {
    throw new AppError('DUPLICATE_GROUP_MEMBER', 'Персонаж уже добавлен в группу.', 400);
  }
  const placeholders = characterIds.map(() => '?').join(', ');
  const result = await database
    .prepare(
      `SELECT c.id FROM characters c
       WHERE c.id IN (${placeholders}) AND c.deleted_at IS NULL
       AND (c.owner_id = ? OR
         (c.publish_state = 'PUBLISHED' AND c.visibility IN ('PUBLIC', 'UNLISTED')
          AND NOT EXISTS (SELECT 1 FROM user_blocks b
            WHERE (b.blocker_id = ? AND b.blocked_user_id = c.owner_id)
               OR (b.blocker_id = c.owner_id AND b.blocked_user_id = ?))))`,
    )
    .bind(...characterIds, userId, userId, userId)
    .all<{ readonly id: string }>();
  if (result.results.length !== characterIds.length) {
    throw new AppError(
      'CHARACTER_GROUP_MEMBER_UNAVAILABLE',
      'Один или несколько персонажей недоступны.',
      400,
    );
  }
}
