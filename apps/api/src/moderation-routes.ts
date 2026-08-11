import {
  appealDecisionSchema,
  appealInputSchema,
  moderationActionSchema,
  reportInputSchema,
  type ReportTargetType,
} from '@velora/domain';
import {
  canModerateRole,
  canTakeModerationAction,
  isModeratorRole,
  type ModerationAction,
  type ModerationRole,
} from '@velora/moderation';
import { AppError, createId, nowMs, ru } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { invalidatePublicDiscovery } from './public-cache';
import { canResolveMatureReview } from './character-safety';
import type { Env, Variables } from './types';

interface ModerationEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface TargetSubject {
  readonly ownerId: string;
  readonly ownerRole: ModerationRole;
}

interface CaseRow {
  readonly id: string;
  readonly reportId: string | null;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly priority: number;
  readonly state:
    'OPEN' | 'TRIAGED' | 'IN_REVIEW' | 'RESOLVED' | 'APPEALED' | 'APPEAL_REVIEW' | 'CLOSED';
  readonly assignedTo: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly resolvedAt: number | null;
}

interface ActionRow {
  readonly action: ModerationAction;
  readonly previousStateJson: string;
}

interface QueueCaseRow extends CaseRow {
  readonly reason: string | null;
  readonly description: string | null;
  readonly reporterId: string | null;
  readonly targetRole: ModerationRole;
}

const caseStateSchema = z.enum([
  'OPEN',
  'TRIAGED',
  'IN_REVIEW',
  'RESOLVED',
  'APPEALED',
  'APPEAL_REVIEW',
  'CLOSED',
]);

const queueProjection = `c.id, c.report_id AS reportId, c.target_type AS targetType,
  c.target_id AS targetId, c.priority, c.state, c.assigned_to AS assignedTo,
  c.created_at AS createdAt, c.updated_at AS updatedAt, c.resolved_at AS resolvedAt,
  r.reason, r.description, r.reporter_id AS reporterId,
  COALESCE(CASE c.target_type
    WHEN 'CHARACTER' THEN (SELECT u.role FROM characters x JOIN users u ON u.id = x.owner_id WHERE x.id = c.target_id)
    WHEN 'AVATAR' THEN (SELECT u.role FROM file_objects x JOIN users u ON u.id = x.owner_id WHERE x.id = c.target_id)
    WHEN 'GENERATED_MESSAGE' THEN (SELECT u.role FROM messages m JOIN conversations v ON v.id = m.conversation_id JOIN characters x ON x.id = v.character_id JOIN users u ON u.id = x.owner_id WHERE m.id = c.target_id)
    ELSE (SELECT u.role FROM users u WHERE u.id = c.target_id)
  END, 'OWNER') AS targetRole`;

export const moderationRoutes = new Hono<ModerationEnvironment>();

moderationRoutes.post('/reports', async (context) => {
  const principal = context.get('principal');
  const input = reportInputSchema.parse(await context.req.json());
  const target = await resolveTarget(
    context.env.DB,
    input.targetType,
    input.targetId,
    principal.userId,
  );
  if (target.ownerId === principal.userId) {
    throw new AppError(
      'SELF_REPORT_NOT_ALLOWED',
      'Нельзя пожаловаться на собственный контент.',
      409,
    );
  }
  const recent = await context.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM reports WHERE reporter_id = ? AND created_at >= ?',
  )
    .bind(principal.userId, nowMs() - 60 * 60 * 1000)
    .first<{ count: number }>();
  if ((recent?.count ?? 0) >= 5) {
    throw new AppError('REPORT_RATE_LIMITED', 'Слишком много жалоб. Попробуйте позже.', 429);
  }
  const duplicate = await context.env.DB.prepare(
    `SELECT r.id FROM reports r JOIN moderation_cases c ON c.report_id = r.id
     WHERE r.reporter_id = ? AND r.target_type = ? AND r.target_id = ?
       AND c.state NOT IN ('CLOSED', 'RESOLVED') LIMIT 1`,
  )
    .bind(principal.userId, input.targetType, input.targetId)
    .first<{ id: string }>();
  if (duplicate) {
    throw new AppError('REPORT_ALREADY_OPEN', 'Жалоба на этот объект уже рассматривается.', 409);
  }
  const reportId = createId();
  const caseId = createId();
  const timestamp = nowMs();
  const priority = priorityForReason(input.reason);
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      reportId,
      principal.userId,
      input.targetType,
      input.targetId,
      input.reason,
      input.description,
      timestamp,
    ),
    context.env.DB.prepare(
      `INSERT INTO moderation_cases
       (id, report_id, target_type, target_id, priority, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    ).bind(caseId, reportId, input.targetType, input.targetId, priority, timestamp, timestamp),
    context.env.DB.prepare(
      `INSERT INTO risk_signals
         (id, subject_user_id, source_type, source_id, signal_type, severity,
          metadata_json, created_at)
         VALUES (?, ?, 'REPORT', ?, ?, ?, ?, ?)`,
    ).bind(
      createId(),
      target.ownerId,
      reportId,
      `REPORT_${input.reason}`,
      Math.min(priority, 100),
      JSON.stringify({ targetType: input.targetType }),
      timestamp,
    ),
    auditStatement(context.env.DB, {
      actorId: principal.userId,
      action: 'REPORT_CREATED',
      targetType: 'MODERATION_CASE',
      targetId: caseId,
      requestId: context.get('requestId'),
      metadata: { reportId, reason: input.reason, targetType: input.targetType },
      timestamp,
    }),
  ]);
  return context.json({ id: reportId, caseId, state: 'OPEN', priority, createdAt: timestamp }, 201);
});

moderationRoutes.get('/reports', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `SELECT r.id, r.target_type AS targetType, r.target_id AS targetId, r.reason,
       r.description, r.created_at AS createdAt, c.id AS caseId, c.state,
       c.updated_at AS updatedAt
     FROM reports r JOIN moderation_cases c ON c.report_id = r.id
     WHERE r.reporter_id = ? ORDER BY r.created_at DESC LIMIT 100`,
  )
    .bind(principal.userId)
    .all();
  return context.json({ items: result.results });
});

moderationRoutes.post('/appeals', async (context) => {
  const principal = context.get('principal');
  const input = appealInputSchema.parse(await context.req.json());
  const moderationCase = await getCase(context.env.DB, input.caseId);
  if (moderationCase.state !== 'RESOLVED') {
    throw new AppError('CASE_NOT_APPEALABLE', 'Это решение пока нельзя обжаловать.', 409);
  }
  const target = await resolveTarget(
    context.env.DB,
    moderationCase.targetType,
    moderationCase.targetId,
  );
  if (target.ownerId !== principal.userId) {
    throw new AppError(
      'FORBIDDEN',
      'Обжаловать решение может только затронутый пользователь.',
      403,
    );
  }
  const existing = await context.env.DB.prepare('SELECT id FROM appeals WHERE case_id = ? LIMIT 1')
    .bind(moderationCase.id)
    .first<{ id: string }>();
  if (existing) throw new AppError('APPEAL_ALREADY_EXISTS', 'Апелляция уже создана.', 409);
  const appealId = createId();
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO appeals (id, case_id, user_id, statement, status, created_at)
       VALUES (?, ?, ?, ?, 'OPEN', ?)`,
    ).bind(appealId, moderationCase.id, principal.userId, input.statement, timestamp),
    context.env.DB.prepare(
      `UPDATE moderation_cases SET state = 'APPEALED', updated_at = ? WHERE id = ?`,
    ).bind(timestamp, moderationCase.id),
    auditStatement(context.env.DB, {
      actorId: principal.userId,
      action: 'APPEAL_CREATED',
      targetType: 'MODERATION_CASE',
      targetId: moderationCase.id,
      requestId: context.get('requestId'),
      metadata: { appealId },
      timestamp,
    }),
  ]);
  return context.json({ id: appealId, caseId: moderationCase.id, status: 'OPEN' }, 201);
});

moderationRoutes.get('/appeals', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `SELECT id, case_id AS caseId, statement, status, decision, created_at AS createdAt,
       resolved_at AS resolvedAt FROM appeals WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(principal.userId)
    .all();
  return context.json({ items: result.results });
});

moderationRoutes.use('/admin/*', async (context, next) => {
  const principal = context.get('principal');
  if (!isModeratorRole(principal.role)) {
    throw new AppError('FORBIDDEN', 'Раздел доступен только команде модерации.', 403);
  }
  await next();
});

moderationRoutes.get('/admin/moderation/cases', async (context) => {
  const principal = context.get('principal');
  const state = caseStateSchema.optional().parse(context.req.query('state'));
  const statement = state
    ? context.env.DB.prepare(
        `SELECT ${queueProjection}
         FROM moderation_cases c LEFT JOIN reports r ON r.id = c.report_id
         WHERE c.state = ? ORDER BY c.priority DESC, c.created_at LIMIT 100`,
      ).bind(state)
    : context.env.DB.prepare(
        `SELECT ${queueProjection}
         FROM moderation_cases c LEFT JOIN reports r ON r.id = c.report_id
         ORDER BY CASE c.state WHEN 'OPEN' THEN 0 WHEN 'APPEALED' THEN 1 ELSE 2 END,
         c.priority DESC, c.created_at LIMIT 100`,
      );
  const result = await statement.all<QueueCaseRow>();
  const items = result.results
    .filter((row) => canModerateRole(principal.role, row.targetRole))
    .map((row) => ({
      id: row.id,
      reportId: row.reportId,
      targetType: row.targetType,
      targetId: row.targetId,
      priority: row.priority,
      state: row.state,
      assignedTo: row.assignedTo,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      resolvedAt: row.resolvedAt,
      reason: row.reason,
      description: row.description,
      reporterId: row.reporterId,
    }));
  return context.json({ items });
});

moderationRoutes.get('/admin/moderation/cases/:caseId', async (context) => {
  const principal = context.get('principal');
  const moderationCase = await getCase(context.env.DB, context.req.param('caseId'));
  const target = await resolveTarget(
    context.env.DB,
    moderationCase.targetType,
    moderationCase.targetId,
  );
  if (!canModerateRole(principal.role, target.ownerRole)) {
    throw new AppError('PROTECTED_ACCOUNT', 'Материалы этого дела недоступны.', 403);
  }
  const report = moderationCase.reportId
    ? await context.env.DB.prepare(
        `SELECT r.id, r.reporter_id AS reporterId, u.display_name AS reporterName,
         r.reason, r.description, r.created_at AS createdAt
         FROM reports r JOIN users u ON u.id = r.reporter_id WHERE r.id = ?`,
      )
        .bind(moderationCase.reportId)
        .first()
    : null;
  const [actions, appeals, audit, evidence] = await Promise.all([
    context.env.DB.prepare(
      `SELECT a.id, a.actor_id AS actorId, u.display_name AS actorName, a.action, a.reason,
       a.previous_state_json AS previousStateJson, a.new_state_json AS newStateJson,
       a.created_at AS createdAt FROM moderation_actions a
       JOIN users u ON u.id = a.actor_id WHERE a.case_id = ? ORDER BY a.created_at`,
    )
      .bind(moderationCase.id)
      .all(),
    context.env.DB.prepare(
      `SELECT id, user_id AS userId, statement, status, decision, reviewer_id AS reviewerId,
       created_at AS createdAt, resolved_at AS resolvedAt FROM appeals WHERE case_id = ?`,
    )
      .bind(moderationCase.id)
      .all(),
    context.env.DB.prepare(
      `SELECT id, actor_id AS actorId, action, metadata_json AS metadataJson,
       created_at AS createdAt FROM audit_logs
       WHERE target_type = 'MODERATION_CASE' AND target_id = ? ORDER BY created_at`,
    )
      .bind(moderationCase.id)
      .all(),
    readEvidence(context.env.DB, moderationCase.targetType, moderationCase.targetId),
  ]);
  return context.json({
    ...moderationCase,
    report,
    evidence,
    actions: actions.results,
    appeals: appeals.results,
    audit: audit.results,
  });
});

moderationRoutes.get('/admin/moderation/risk/:userId', async (context) => {
  const principal = context.get('principal');
  const subject = await context.env.DB.prepare(
    `SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(context.req.param('userId'))
    .first<{ id: string; role: ModerationRole }>();
  if (!subject) throw new AppError('USER_NOT_FOUND', 'Пользователь не найден.', 404);
  if (!canModerateRole(principal.role, subject.role)) {
    throw new AppError('PROTECTED_ACCOUNT', 'Сигналы этого аккаунта недоступны.', 403);
  }
  const signals = await context.env.DB.prepare(
    `SELECT id, source_type AS sourceType, source_id AS sourceId,
     signal_type AS signalType, severity, metadata_json AS metadataJson,
     created_at AS createdAt, reviewed_at AS reviewedAt,
     reviewed_by AS reviewedBy, dismissed_at AS dismissedAt
     FROM risk_signals WHERE subject_user_id = ?
     ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(subject.id)
    .all<{
      id: string;
      sourceType: string;
      sourceId: string | null;
      signalType: string;
      severity: number;
      metadataJson: string;
      createdAt: number;
      reviewedAt: number | null;
      reviewedBy: string | null;
      dismissedAt: number | null;
    }>();
  const active = signals.results.filter((signal) => signal.dismissedAt === null);
  const score = Math.min(
    100,
    Math.round(active.reduce((sum, signal) => sum + signal.severity * 0.2, 0)),
  );
  return context.json({
    userId: subject.id,
    score,
    activeSignalCount: active.length,
    informationalOnly: true,
    automaticSanction: false,
    items: signals.results.map((signal) => ({
      ...signal,
      metadata: safeJsonObject(signal.metadataJson),
      metadataJson: undefined,
    })),
  });
});

moderationRoutes.post('/admin/moderation/cases/:caseId/assign', async (context) => {
  const principal = context.get('principal');
  const moderationCase = await getCase(context.env.DB, context.req.param('caseId'));
  const target = await resolveTarget(
    context.env.DB,
    moderationCase.targetType,
    moderationCase.targetId,
  );
  if (!canModerateRole(principal.role, target.ownerRole)) {
    throw new AppError('PROTECTED_ACCOUNT', 'Нельзя назначить себе это дело.', 403);
  }
  if (!['OPEN', 'TRIAGED', 'IN_REVIEW'].includes(moderationCase.state)) {
    throw new AppError('CASE_NOT_ASSIGNABLE', 'Дело уже завершено или обжалуется.', 409);
  }
  if (moderationCase.assignedTo && moderationCase.assignedTo !== principal.userId) {
    throw new AppError('CASE_ALREADY_ASSIGNED', 'Дело уже назначено другому модератору.', 409);
  }
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE moderation_cases SET assigned_to = ?, state = 'IN_REVIEW', updated_at = ?
       WHERE id = ?`,
    ).bind(principal.userId, timestamp, moderationCase.id),
    auditStatement(context.env.DB, {
      actorId: principal.userId,
      action: 'CASE_ASSIGNED',
      targetType: 'MODERATION_CASE',
      targetId: moderationCase.id,
      requestId: context.get('requestId'),
      metadata: {},
      timestamp,
    }),
  ]);
  return context.json({ ...moderationCase, assignedTo: principal.userId, state: 'IN_REVIEW' });
});

moderationRoutes.post('/admin/moderation/cases/:caseId/actions', async (context) => {
  const principal = context.get('principal');
  const input = moderationActionSchema.parse(await context.req.json());
  if (!canTakeModerationAction(principal.role, input.action)) {
    throw new AppError('FORBIDDEN_ACTION', 'Недостаточно прав для этого действия.', 403);
  }
  const moderationCase = await getCase(context.env.DB, context.req.param('caseId'));
  if (!['OPEN', 'TRIAGED', 'IN_REVIEW'].includes(moderationCase.state)) {
    throw new AppError('CASE_NOT_ACTIONABLE', 'По этому делу уже принято решение.', 409);
  }
  if (moderationCase.assignedTo && moderationCase.assignedTo !== principal.userId) {
    throw new AppError('CASE_ASSIGNED_TO_ANOTHER', 'Дело назначено другому модератору.', 409);
  }
  if (
    moderationCase.reportId === null &&
    moderationCase.targetType === 'CHARACTER' &&
    !canResolveMatureReview(input.action)
  ) {
    throw new AppError('MATURE_REVIEW_ACTION_INVALID', ru.character.matureReviewActionInvalid, 409);
  }
  const target = await resolveTarget(
    context.env.DB,
    moderationCase.targetType,
    moderationCase.targetId,
  );
  if (!canModerateRole(principal.role, target.ownerRole)) {
    throw new AppError('PROTECTED_ACCOUNT', 'Нельзя применить действие к этому аккаунту.', 403);
  }
  const timestamp = nowMs();
  const mutation = await buildTargetMutation(
    context.env.DB,
    moderationCase,
    target,
    input.action,
    timestamp,
  );
  const actionId = createId();
  const nextState = input.action === 'ESCALATE' ? 'TRIAGED' : 'RESOLVED';
  const statements = [
    ...mutation.statements,
    ...(moderationCase.reportId === null && moderationCase.targetType === 'CHARACTER'
      ? [
          context.env.DB.prepare(
            `UPDATE risk_signals SET reviewed_at = ?, reviewed_by = ?,
               dismissed_at = CASE WHEN ? = 'ESCALATE' THEN dismissed_at ELSE ? END
               WHERE source_type = 'SYSTEM_RULE' AND source_id = ?
                 AND signal_type = 'MATURE_CHARACTER_REVIEW_REQUIRED'`,
          ).bind(timestamp, principal.userId, input.action, timestamp, moderationCase.targetId),
        ]
      : []),
    context.env.DB.prepare(
      `INSERT INTO moderation_actions
       (id, case_id, actor_id, action, reason, previous_state_json, new_state_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      actionId,
      moderationCase.id,
      principal.userId,
      input.action,
      input.reason,
      JSON.stringify(mutation.previousState),
      JSON.stringify(mutation.newState),
      timestamp,
    ),
    context.env.DB.prepare(
      `UPDATE moderation_cases SET state = ?, assigned_to = ?, priority = ?, updated_at = ?,
       resolved_at = ? WHERE id = ?`,
    ).bind(
      nextState,
      principal.userId,
      input.action === 'ESCALATE'
        ? Math.max(moderationCase.priority, 100)
        : moderationCase.priority,
      timestamp,
      nextState === 'RESOLVED' ? timestamp : null,
      moderationCase.id,
    ),
    auditStatement(context.env.DB, {
      actorId: principal.userId,
      action: `MODERATION_${input.action}`,
      targetType: 'MODERATION_CASE',
      targetId: moderationCase.id,
      requestId: context.get('requestId'),
      metadata: { actionId, targetType: moderationCase.targetType },
      timestamp,
    }),
  ];
  await context.env.DB.batch(statements);
  if (moderationCase.targetType === 'CHARACTER') {
    invalidatePublicDiscovery(context, moderationCase.targetId);
  } else {
    invalidatePublicDiscovery(context);
  }
  return context.json({ id: actionId, caseId: moderationCase.id, state: nextState });
});

moderationRoutes.get('/admin/moderation/appeals', async (context) => {
  const principal = context.get('principal');
  if (!['ADMIN', 'OWNER'].includes(principal.role)) {
    throw new AppError('FORBIDDEN', 'Апелляции доступны только администратору.', 403);
  }
  const result = await context.env.DB.prepare(
    `SELECT a.id, a.case_id AS caseId, a.user_id AS userId, u.display_name AS userName,
     a.statement, a.status, a.decision, a.created_at AS createdAt, a.resolved_at AS resolvedAt
     FROM appeals a JOIN users u ON u.id = a.user_id
     WHERE a.status IN ('OPEN', 'IN_REVIEW') ORDER BY a.created_at LIMIT 100`,
  ).all();
  return context.json({ items: result.results });
});

moderationRoutes.post('/admin/moderation/appeals/:appealId/decision', async (context) => {
  const principal = context.get('principal');
  if (!['ADMIN', 'OWNER'].includes(principal.role)) {
    throw new AppError('FORBIDDEN', 'Решение по апелляции доступно администратору.', 403);
  }
  const input = appealDecisionSchema.parse(await context.req.json());
  const appeal = await context.env.DB.prepare(
    `SELECT id, case_id AS caseId, status FROM appeals WHERE id = ?`,
  )
    .bind(context.req.param('appealId'))
    .first<{ id: string; caseId: string; status: string }>();
  if (!appeal) throw new AppError('APPEAL_NOT_FOUND', 'Апелляция не найдена.', 404);
  if (!['OPEN', 'IN_REVIEW'].includes(appeal.status)) {
    throw new AppError('APPEAL_ALREADY_DECIDED', 'По апелляции уже принято решение.', 409);
  }
  const moderationCase = await getCase(context.env.DB, appeal.caseId);
  const latestAction = await context.env.DB.prepare(
    `SELECT action, previous_state_json AS previousStateJson FROM moderation_actions
     WHERE case_id = ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(moderationCase.id)
    .first<ActionRow>();
  const restoreStatements =
    input.decision === 'OVERTURNED' && latestAction
      ? restoreTarget(context.env.DB, latestAction.previousStateJson)
      : [];
  const timestamp = nowMs();
  await context.env.DB.batch([
    ...restoreStatements,
    context.env.DB.prepare(
      `UPDATE appeals SET status = ?, reviewer_id = ?, decision = ?, resolved_at = ? WHERE id = ?`,
    ).bind(input.decision, principal.userId, input.reason, timestamp, appeal.id),
    context.env.DB.prepare(
      `UPDATE moderation_cases SET state = 'CLOSED', updated_at = ? WHERE id = ?`,
    ).bind(timestamp, moderationCase.id),
    auditStatement(context.env.DB, {
      actorId: principal.userId,
      action: `APPEAL_${input.decision}`,
      targetType: 'MODERATION_CASE',
      targetId: moderationCase.id,
      requestId: context.get('requestId'),
      metadata: { appealId: appeal.id },
      timestamp,
    }),
  ]);
  if (moderationCase.targetType === 'CHARACTER') {
    invalidatePublicDiscovery(context, moderationCase.targetId);
  } else {
    invalidatePublicDiscovery(context);
  }
  return context.json({ id: appeal.id, status: input.decision, caseState: 'CLOSED' });
});

moderationRoutes.get('/admin/audit', async (context) => {
  const principal = context.get('principal');
  if (!['ADMIN', 'OWNER'].includes(principal.role)) {
    throw new AppError('FORBIDDEN', 'Журнал доступен только администратору.', 403);
  }
  const result = await context.env.DB.prepare(
    `SELECT id, actor_id AS actorId, action, target_type AS targetType,
     target_id AS targetId, request_id AS requestId, metadata_json AS metadataJson,
     created_at AS createdAt FROM audit_logs ORDER BY created_at DESC LIMIT 200`,
  ).all();
  return context.json({ items: result.results });
});

function priorityForReason(reason: string): number {
  if (reason === 'SEXUAL_CONTENT_INVOLVING_MINORS') return 100;
  if (reason === 'UNDERAGE') return 90;
  if (reason === 'SELF_HARM_CONCERN') return 80;
  if (reason === 'ILLEGAL_CONTENT' || reason === 'NON_CONSENSUAL_EXPLOITATIVE_MATERIAL') return 70;
  return 20;
}

async function getCase(database: D1Database, id: string): Promise<CaseRow> {
  const row = await database
    .prepare(
      `SELECT id, report_id AS reportId, target_type AS targetType, target_id AS targetId,
       priority, state, assigned_to AS assignedTo, created_at AS createdAt,
       updated_at AS updatedAt, resolved_at AS resolvedAt FROM moderation_cases WHERE id = ?`,
    )
    .bind(id)
    .first<CaseRow>();
  if (!row) throw new AppError('CASE_NOT_FOUND', 'Дело модерации не найдено.', 404);
  return row;
}

async function resolveTarget(
  database: D1Database,
  type: ReportTargetType,
  id: string,
  reporterId?: string,
): Promise<TargetSubject> {
  let row: TargetSubject | null;
  if (type === 'CHARACTER') {
    row = await database
      .prepare(
        `SELECT c.owner_id AS ownerId, u.role AS ownerRole FROM characters c
         JOIN users u ON u.id = c.owner_id WHERE c.id = ? AND u.deleted_at IS NULL
         AND (? IS NULL OR c.owner_id = ? OR
           (c.deleted_at IS NULL AND c.publish_state = 'PUBLISHED' AND c.visibility IN ('PUBLIC', 'UNLISTED')))`,
      )
      .bind(id, reporterId ?? null, reporterId ?? null)
      .first<TargetSubject>();
  } else if (type === 'AVATAR') {
    row = await database
      .prepare(
        `SELECT f.owner_id AS ownerId, u.role AS ownerRole FROM file_objects f
         JOIN users u ON u.id = f.owner_id WHERE f.id = ? AND f.deleted_at IS NULL
         AND (? IS NULL OR f.owner_id = ? OR EXISTS (
           SELECT 1 FROM characters c WHERE c.avatar_file_id = f.id AND c.deleted_at IS NULL
             AND c.publish_state = 'PUBLISHED' AND c.visibility IN ('PUBLIC', 'UNLISTED')
         ) OR EXISTS (
           SELECT 1 FROM personas p WHERE p.avatar_file_id = f.id AND p.deleted_at IS NULL
             AND p.visibility = 'PUBLIC'
         ))`,
      )
      .bind(id, reporterId ?? null, reporterId ?? null)
      .first<TargetSubject>();
  } else if (type === 'GENERATED_MESSAGE') {
    row = await database
      .prepare(
        `SELECT c.owner_id AS ownerId, u.role AS ownerRole FROM messages m
         JOIN conversations v ON v.id = m.conversation_id
         JOIN characters c ON c.id = v.character_id JOIN users u ON u.id = c.owner_id
         WHERE m.id = ? AND m.role = 'ASSISTANT' AND (? IS NULL OR v.user_id = ?)`,
      )
      .bind(id, reporterId ?? null, reporterId ?? null)
      .first<TargetSubject>();
  } else {
    row = await database
      .prepare(
        `SELECT id AS ownerId, role AS ownerRole FROM users
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(id)
      .first<TargetSubject>();
  }
  if (!row) throw new AppError('REPORT_TARGET_NOT_FOUND', 'Объект жалобы недоступен.', 404);
  return row;
}

async function readEvidence(database: D1Database, type: ReportTargetType, id: string) {
  if (type === 'CHARACTER') {
    return database
      .prepare(
        `SELECT c.id, c.owner_id AS ownerId, c.visibility, c.publish_state AS publishState,
         c.content_rating AS contentRating, v.name, v.tagline, v.description
         FROM characters c JOIN character_versions v ON v.id = c.active_version_id WHERE c.id = ?`,
      )
      .bind(id)
      .first();
  }
  if (type === 'AVATAR') {
    return database
      .prepare(
        `SELECT id, owner_id AS ownerId, mime_type AS mimeType, byte_size AS byteSize,
         width, height, moderation_state AS moderationState FROM file_objects WHERE id = ?`,
      )
      .bind(id)
      .first();
  }
  if (type === 'GENERATED_MESSAGE') {
    return database
      .prepare(
        `SELECT id, conversation_id AS conversationId, role, content, status, created_at AS createdAt
         FROM messages WHERE id = ?`,
      )
      .bind(id)
      .first();
  }
  if (type === 'USER_PROFILE') {
    return database
      .prepare(
        `SELECT u.id, COALESCE(p.display_name, u.display_name) AS displayName,
         COALESCE(p.bio, '') AS bio, COALESCE(p.visibility, 'PUBLIC') AS visibility,
         p.avatar_file_id AS avatarFileId, u.role, u.moderation_state AS moderationState
         FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`,
      )
      .bind(id)
      .first();
  }
  return database
    .prepare(
      `SELECT id, username, display_name AS displayName, role,
       moderation_state AS moderationState FROM users WHERE id = ?`,
    )
    .bind(id)
    .first();
}

async function buildTargetMutation(
  database: D1Database,
  moderationCase: CaseRow,
  target: TargetSubject,
  action: ModerationAction,
  timestamp: number,
): Promise<{
  readonly statements: readonly D1PreparedStatement[];
  readonly previousState: Readonly<Record<string, unknown>>;
  readonly newState: Readonly<Record<string, unknown>>;
}> {
  if (
    action === 'NO_ACTION' &&
    moderationCase.reportId === null &&
    moderationCase.targetType === 'CHARACTER'
  ) {
    const state = await database
      .prepare(
        `SELECT visibility, publish_state AS publishState, deleted_at AS deletedAt
         FROM characters WHERE id = ?`,
      )
      .bind(moderationCase.targetId)
      .first<{ visibility: string; publishState: string; deletedAt: number | null }>();
    if (!state) {
      throw new AppError('REPORT_TARGET_NOT_FOUND', ru.character.notFound, 404);
    }
    if (state.publishState !== 'MODERATION_PENDING' || state.deletedAt !== null) {
      throw new AppError('MATURE_REVIEW_NOT_PENDING', ru.character.matureReviewNotPending, 409);
    }
    return {
      statements: [
        database
          .prepare(
            `UPDATE characters SET publish_state = 'PUBLISHED',
             published_at = COALESCE(published_at, ?), updated_at = ?
             WHERE id = ? AND publish_state = 'MODERATION_PENDING' AND deleted_at IS NULL`,
          )
          .bind(timestamp, timestamp, moderationCase.targetId),
      ],
      previousState: { kind: 'CHARACTER', id: moderationCase.targetId, ...state },
      newState: {
        kind: 'CHARACTER',
        id: moderationCase.targetId,
        visibility: state.visibility,
        publishState: 'PUBLISHED',
        deletedAt: state.deletedAt,
      },
    };
  }
  if (action === 'NO_ACTION' || action === 'WARNING' || action === 'ESCALATE') {
    return { statements: [], previousState: { kind: 'NONE' }, newState: { kind: 'NONE' } };
  }
  if (action === 'TEMP_RESTRICTION' || action === 'ACCOUNT_SUSPEND' || action === 'ACCOUNT_BAN') {
    const state = await database
      .prepare('SELECT moderation_state AS moderationState FROM users WHERE id = ?')
      .bind(target.ownerId)
      .first<{ moderationState: string }>();
    if (!state) throw new AppError('REPORT_TARGET_NOT_FOUND', 'Пользователь не найден.', 404);
    const moderationState =
      action === 'TEMP_RESTRICTION'
        ? 'RESTRICTED'
        : action === 'ACCOUNT_SUSPEND'
          ? 'SUSPENDED'
          : 'BANNED';
    return {
      statements: [
        database
          .prepare('UPDATE users SET moderation_state = ?, updated_at = ? WHERE id = ?')
          .bind(moderationState, timestamp, target.ownerId),
      ],
      previousState: { kind: 'USER', id: target.ownerId, moderationState: state.moderationState },
      newState: { kind: 'USER', id: target.ownerId, moderationState },
    };
  }
  if (moderationCase.targetType === 'CHARACTER') {
    const state = await database
      .prepare(
        `SELECT visibility, publish_state AS publishState, deleted_at AS deletedAt
         FROM characters WHERE id = ?`,
      )
      .bind(moderationCase.targetId)
      .first<{ visibility: string; publishState: string; deletedAt: number | null }>();
    if (!state) throw new AppError('REPORT_TARGET_NOT_FOUND', 'Персонаж не найден.', 404);
    return {
      statements: [
        database
          .prepare(
            `UPDATE characters SET visibility = 'MODERATION_HIDDEN', publish_state = 'HIDDEN',
             updated_at = ? WHERE id = ?`,
          )
          .bind(timestamp, moderationCase.targetId),
      ],
      previousState: { kind: 'CHARACTER', id: moderationCase.targetId, ...state },
      newState: {
        kind: 'CHARACTER',
        id: moderationCase.targetId,
        visibility: 'MODERATION_HIDDEN',
        publishState: 'HIDDEN',
        deletedAt: state.deletedAt,
      },
    };
  }
  if (moderationCase.targetType === 'USER_PROFILE') {
    const state = await database
      .prepare(
        `SELECT display_name AS displayName, bio, avatar_file_id AS avatarFileId, visibility
         FROM user_profiles WHERE user_id = ?`,
      )
      .bind(moderationCase.targetId)
      .first<{
        displayName: string;
        bio: string;
        avatarFileId: string | null;
        visibility: string;
      }>();
    if (!state) throw new AppError('REPORT_TARGET_NOT_FOUND', ru.profile.unavailable, 404);
    const remove = action === 'CONTENT_REMOVE';
    return {
      statements: [
        database
          .prepare(
            `UPDATE user_profiles SET bio = ?, avatar_file_id = ?, visibility = 'PRIVATE',
             updated_at = ? WHERE user_id = ?`,
          )
          .bind(
            remove ? '' : state.bio,
            remove ? null : state.avatarFileId,
            timestamp,
            target.ownerId,
          ),
      ],
      previousState: { kind: 'USER_PROFILE', id: target.ownerId, ...state },
      newState: {
        kind: 'USER_PROFILE',
        id: target.ownerId,
        displayName: state.displayName,
        bio: remove ? '' : state.bio,
        avatarFileId: remove ? null : state.avatarFileId,
        visibility: 'PRIVATE',
      },
    };
  }
  if (moderationCase.targetType === 'AVATAR') {
    const state = await database
      .prepare('SELECT moderation_state AS moderationState FROM file_objects WHERE id = ?')
      .bind(moderationCase.targetId)
      .first<{ moderationState: string }>();
    if (!state) throw new AppError('REPORT_TARGET_NOT_FOUND', 'Медиафайл не найден.', 404);
    return {
      statements: [
        database
          .prepare(`UPDATE file_objects SET moderation_state = 'REJECTED' WHERE id = ?`)
          .bind(moderationCase.targetId),
      ],
      previousState: { kind: 'AVATAR', id: moderationCase.targetId, ...state },
      newState: { kind: 'AVATAR', id: moderationCase.targetId, moderationState: 'REJECTED' },
    };
  }
  if (moderationCase.targetType === 'GENERATED_MESSAGE') {
    const state = await database
      .prepare('SELECT status FROM messages WHERE id = ?')
      .bind(moderationCase.targetId)
      .first<{ status: string }>();
    if (!state) throw new AppError('REPORT_TARGET_NOT_FOUND', 'Сообщение не найдено.', 404);
    return {
      statements: [
        database
          .prepare(`UPDATE messages SET status = 'MODERATED' WHERE id = ?`)
          .bind(moderationCase.targetId),
      ],
      previousState: { kind: 'MESSAGE', id: moderationCase.targetId, status: state.status },
      newState: { kind: 'MESSAGE', id: moderationCase.targetId, status: 'MODERATED' },
    };
  }
  throw new AppError('ACTION_NOT_SUPPORTED', 'Это действие неприменимо к выбранному объекту.', 409);
}

function restoreTarget(
  database: D1Database,
  previousStateJson: string,
): readonly D1PreparedStatement[] {
  let state: unknown;
  try {
    state = JSON.parse(previousStateJson);
  } catch {
    throw new AppError('INVALID_AUDIT_STATE', 'Состояние для восстановления повреждено.', 500);
  }
  if (!isRecord(state) || typeof state['kind'] !== 'string') return [];
  if (
    state['kind'] === 'USER' &&
    typeof state['id'] === 'string' &&
    typeof state['moderationState'] === 'string'
  ) {
    return [
      database
        .prepare('UPDATE users SET moderation_state = ?, updated_at = ? WHERE id = ?')
        .bind(state['moderationState'], nowMs(), state['id']),
    ];
  }
  if (
    state['kind'] === 'CHARACTER' &&
    typeof state['id'] === 'string' &&
    typeof state['visibility'] === 'string' &&
    typeof state['publishState'] === 'string'
  ) {
    return [
      database
        .prepare(
          'UPDATE characters SET visibility = ?, publish_state = ?, updated_at = ? WHERE id = ?',
        )
        .bind(state['visibility'], state['publishState'], nowMs(), state['id']),
    ];
  }
  if (
    state['kind'] === 'AVATAR' &&
    typeof state['id'] === 'string' &&
    typeof state['moderationState'] === 'string'
  ) {
    return [
      database
        .prepare('UPDATE file_objects SET moderation_state = ? WHERE id = ?')
        .bind(state['moderationState'], state['id']),
    ];
  }
  if (
    state['kind'] === 'MESSAGE' &&
    typeof state['id'] === 'string' &&
    typeof state['status'] === 'string'
  ) {
    return [
      database
        .prepare('UPDATE messages SET status = ? WHERE id = ?')
        .bind(state['status'], state['id']),
    ];
  }
  if (
    state['kind'] === 'USER_PROFILE' &&
    typeof state['id'] === 'string' &&
    typeof state['displayName'] === 'string' &&
    typeof state['bio'] === 'string' &&
    (typeof state['avatarFileId'] === 'string' || state['avatarFileId'] === null) &&
    typeof state['visibility'] === 'string'
  ) {
    return [
      database
        .prepare(
          `UPDATE user_profiles SET display_name = ?, bio = ?, avatar_file_id = ?,
           visibility = ?, updated_at = ? WHERE user_id = ?`,
        )
        .bind(
          state['displayName'],
          state['bio'],
          state['avatarFileId'],
          state['visibility'],
          nowMs(),
          state['id'],
        ),
    ];
  }
  return [];
}

function auditStatement(
  database: D1Database,
  input: {
    readonly actorId: string;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly requestId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly timestamp: number;
  },
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO audit_logs
       (id, actor_id, action, target_type, target_id, request_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      createId(),
      input.actorId,
      input.action,
      input.targetType,
      input.targetId,
      input.requestId,
      JSON.stringify(input.metadata),
      input.timestamp,
    );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJsonObject(value: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
