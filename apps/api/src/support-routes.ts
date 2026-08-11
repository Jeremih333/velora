import {
  supportRequestInputSchema,
  supportRequestUpdateSchema,
  supportStateSchema,
  type SupportCategory,
  type SupportState,
} from '@velora/domain';
import { AppError, createId, nowMs, ru } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from './types';

interface SupportEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface SupportRow {
  readonly id: string;
  readonly userId: string;
  readonly category: SupportCategory;
  readonly subject: string;
  readonly message: string;
  readonly state: SupportState;
  readonly resolutionNote: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly resolvedAt: number | null;
}

const idSchema = z.uuid();
const listQuerySchema = z.object({ state: supportStateSchema.optional() }).strict();
const projection = `id, user_id AS userId, category, subject, message, state,
  resolution_note AS resolutionNote, created_at AS createdAt,
  updated_at AS updatedAt, resolved_at AS resolvedAt`;

export const supportRoutes = new Hono<SupportEnvironment>();

supportRoutes.get('/support/requests', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `SELECT ${projection} FROM support_requests
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(principal.userId)
    .all<SupportRow>();
  return context.json({ items: result.results });
});

supportRoutes.post('/support/requests', async (context) => {
  const principal = context.get('principal');
  const input = supportRequestInputSchema.parse(await context.req.json());
  const id = createId();
  const timestamp = nowMs();
  await context.env.DB.prepare(
    `INSERT INTO support_requests
      (id, user_id, category, subject, message, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
  )
    .bind(id, principal.userId, input.category, input.subject, input.message, timestamp, timestamp)
    .run();
  return context.json(
    {
      id,
      userId: principal.userId,
      ...input,
      state: 'OPEN' as const,
      resolutionNote: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
    },
    201,
  );
});

supportRoutes.get('/admin/support/requests', async (context) => {
  requireAdministrator(context.get('principal').role);
  const query = listQuerySchema.parse(context.req.query());
  const statement = query.state
    ? context.env.DB.prepare(
        `SELECT ${projection} FROM support_requests
           WHERE state = ? ORDER BY updated_at DESC LIMIT 100`,
      ).bind(query.state)
    : context.env.DB.prepare(
        `SELECT ${projection} FROM support_requests ORDER BY updated_at DESC LIMIT 100`,
      );
  const result = await statement.all<SupportRow>();
  return context.json({ items: result.results });
});

supportRoutes.patch('/admin/support/requests/:requestId', async (context) => {
  const principal = context.get('principal');
  requireAdministrator(principal.role);
  const requestId = idSchema.parse(context.req.param('requestId'));
  const input = supportRequestUpdateSchema.parse(await context.req.json());
  const current = await context.env.DB.prepare(
    'SELECT state, category FROM support_requests WHERE id = ?',
  )
    .bind(requestId)
    .first<{ state: SupportState; category: SupportCategory }>();
  if (!current) throw new AppError('SUPPORT_REQUEST_NOT_FOUND', ru.support.notFound, 404);
  const timestamp = nowMs();
  const resolvedAt = input.state === 'RESOLVED' || input.state === 'CLOSED' ? timestamp : null;
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE support_requests SET state = ?, resolution_note = ?, updated_at = ?, resolved_at = ?
         WHERE id = ?`,
    ).bind(input.state, input.resolutionNote, timestamp, resolvedAt, requestId),
    context.env.DB.prepare(
      `INSERT INTO audit_logs
          (id, actor_id, action, target_type, target_id, request_id, metadata_json, created_at)
         VALUES (?, ?, 'SUPPORT_STATE_CHANGED', 'SUPPORT_REQUEST', ?, ?, ?, ?)`,
    ).bind(
      createId(),
      principal.userId,
      requestId,
      context.get('requestId'),
      JSON.stringify({ category: current.category, from: current.state, to: input.state }),
      timestamp,
    ),
  ]);
  const updated = await context.env.DB.prepare(
    `SELECT ${projection} FROM support_requests WHERE id = ?`,
  )
    .bind(requestId)
    .first<SupportRow>();
  if (!updated) throw new Error('SUPPORT_REQUEST_UPDATE_NOT_PERSISTED');
  return context.json(updated);
});

function requireAdministrator(role: string): void {
  if (role !== 'ADMIN' && role !== 'OWNER') {
    throw new AppError('FORBIDDEN', ru.support.forbidden, 403);
  }
}
