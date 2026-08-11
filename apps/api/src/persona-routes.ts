import { personaInputSchema, personaPatchSchema } from '@velora/domain';
import { AppError, createId, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import type { Env, Variables } from './types';
import { requirePlanResourceCapacity } from './plans';

interface PersonaEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface PersonaRow {
  readonly id: string;
  readonly name: string;
  readonly avatarFileId: string | null;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly personality: string;
  readonly appearance: string;
  readonly speakingStyle: string;
  readonly background: string;
  readonly pronouns: string;
  readonly representedAge: string | null;
  readonly customNotes: string;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly isDefault: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const personaProjection = `id, name, avatar_file_id AS avatarFileId,
  short_description AS shortDescription, long_description AS longDescription,
  personality, appearance, speaking_style AS speakingStyle, background, pronouns,
  represented_age AS representedAge, custom_notes AS customNotes, visibility,
  is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt`;

export const personaRoutes = new Hono<PersonaEnvironment>();

personaRoutes.get('/', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `SELECT ${personaProjection} FROM personas
     WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, updated_at DESC LIMIT 100`,
  )
    .bind(principal.userId)
    .all<PersonaRow>();
  return context.json({ items: result.results.map(toPersonaResponse) });
});

personaRoutes.post('/', async (context) => {
  const principal = context.get('principal');
  await requirePlanResourceCapacity(context.env.DB, principal.userId, 'PERSONA');
  const input = personaInputSchema.parse(await context.req.json());
  if (input.avatarFileId) {
    await requireOwnedMedia(context.env.DB, principal.userId, input.avatarFileId);
    if (input.visibility === 'PUBLIC') {
      await requireApprovedMedia(context.env.DB, principal.userId, input.avatarFileId);
    }
  }
  const id = createId();
  const timestamp = nowMs();
  await context.env.DB.prepare(
    `INSERT INTO personas (
      id, user_id, name, avatar_file_id, short_description, long_description,
      personality, appearance, speaking_style, background, pronouns, represented_age,
      custom_notes, visibility, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      principal.userId,
      input.name,
      input.avatarFileId,
      input.shortDescription,
      input.longDescription,
      input.personality,
      input.appearance,
      input.speakingStyle,
      input.background,
      input.pronouns,
      input.representedAge,
      input.customNotes,
      input.visibility,
      timestamp,
      timestamp,
    )
    .run();
  await context.env.DB.prepare(
    `UPDATE personas SET is_default = 1 WHERE id = ? AND NOT EXISTS (
      SELECT 1 FROM personas WHERE user_id = ? AND is_default = 1 AND deleted_at IS NULL
    )`,
  )
    .bind(id, principal.userId)
    .run();
  const created = await getOwnedPersona(context.env.DB, principal.userId, id);
  return context.json(toPersonaResponse(created), 201);
});

personaRoutes.get('/:personaId', async (context) => {
  const principal = context.get('principal');
  const persona = await getOwnedPersona(
    context.env.DB,
    principal.userId,
    context.req.param('personaId'),
  );
  return context.json(toPersonaResponse(persona));
});

personaRoutes.patch('/:personaId', async (context) => {
  const principal = context.get('principal');
  const id = context.req.param('personaId');
  const current = await getOwnedPersona(context.env.DB, principal.userId, id);
  const patch = personaPatchSchema.parse(await context.req.json());
  if (patch.avatarFileId) {
    await requireOwnedMedia(context.env.DB, principal.userId, patch.avatarFileId);
  }
  const nextAvatar = patch.avatarFileId === undefined ? current.avatarFileId : patch.avatarFileId;
  const nextVisibility = patch.visibility ?? current.visibility;
  if (nextAvatar && nextVisibility === 'PUBLIC') {
    await requireApprovedMedia(context.env.DB, principal.userId, nextAvatar);
  }
  await context.env.DB.prepare(
    `UPDATE personas SET name = ?, avatar_file_id = ?, short_description = ?,
      long_description = ?, personality = ?, appearance = ?, speaking_style = ?,
      background = ?, pronouns = ?, represented_age = ?, custom_notes = ?, visibility = ?,
      updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
  )
    .bind(
      patch.name ?? current.name,
      patch.avatarFileId === undefined ? current.avatarFileId : patch.avatarFileId,
      patch.shortDescription ?? current.shortDescription,
      patch.longDescription ?? current.longDescription,
      patch.personality ?? current.personality,
      patch.appearance ?? current.appearance,
      patch.speakingStyle ?? current.speakingStyle,
      patch.background ?? current.background,
      patch.pronouns ?? current.pronouns,
      patch.representedAge === undefined ? current.representedAge : patch.representedAge,
      patch.customNotes ?? current.customNotes,
      patch.visibility ?? current.visibility,
      nowMs(),
      id,
      principal.userId,
    )
    .run();
  return context.json(
    toPersonaResponse(await getOwnedPersona(context.env.DB, principal.userId, id)),
  );
});

personaRoutes.post('/:personaId/default', async (context) => {
  const principal = context.get('principal');
  const id = context.req.param('personaId');
  await getOwnedPersona(context.env.DB, principal.userId, id);
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      'UPDATE personas SET is_default = 0, updated_at = ? WHERE user_id = ?',
    ).bind(timestamp, principal.userId),
    context.env.DB.prepare(
      'UPDATE personas SET is_default = 1, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    ).bind(timestamp, id, principal.userId),
    context.env.DB.prepare(
      'UPDATE user_settings SET default_persona_id = ?, updated_at = ? WHERE user_id = ?',
    ).bind(id, timestamp, principal.userId),
  ]);
  return context.json({ defaultPersonaId: id });
});

personaRoutes.delete('/:personaId', async (context) => {
  const principal = context.get('principal');
  const id = context.req.param('personaId');
  const persona = await getOwnedPersona(context.env.DB, principal.userId, id);
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      'UPDATE personas SET deleted_at = ?, is_default = 0, updated_at = ? WHERE id = ? AND user_id = ?',
    ).bind(timestamp, timestamp, id, principal.userId),
    context.env.DB.prepare(
      'UPDATE user_settings SET default_persona_id = NULL, updated_at = ? WHERE user_id = ? AND default_persona_id = ?',
    ).bind(timestamp, principal.userId, id),
  ]);
  return context.json({ deleted: true, wasDefault: persona.isDefault === 1 });
});

async function getOwnedPersona(
  database: D1Database,
  userId: string,
  personaId: string,
): Promise<PersonaRow> {
  const persona = await database
    .prepare(
      `SELECT ${personaProjection} FROM personas
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
    .bind(personaId, userId)
    .first<PersonaRow>();
  if (!persona) throw new AppError('PERSONA_NOT_FOUND', 'Persona не найдена.', 404);
  return persona;
}

async function requireOwnedMedia(
  database: D1Database,
  userId: string,
  fileId: string,
): Promise<void> {
  const media = await database
    .prepare(
      'SELECT 1 AS found FROM file_objects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
    )
    .bind(fileId, userId)
    .first<{ found: number }>();
  if (!media) throw new AppError('MEDIA_NOT_FOUND', 'Медиафайл не найден.', 404);
}

async function requireApprovedMedia(
  database: D1Database,
  userId: string,
  fileId: string,
): Promise<void> {
  const media = await database
    .prepare(
      `SELECT 1 AS found FROM file_objects WHERE id = ? AND owner_id = ?
       AND moderation_state = 'APPROVED' AND deleted_at IS NULL`,
    )
    .bind(fileId, userId)
    .first<{ found: number }>();
  if (!media) {
    throw new AppError('MEDIA_MODERATION_PENDING', 'Изображение ещё не прошло модерацию.', 409);
  }
}

function toPersonaResponse(row: PersonaRow) {
  return { ...row, isDefault: row.isDefault === 1 };
}
