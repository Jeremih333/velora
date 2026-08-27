import { AppError, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from './types';

interface NotificationEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface NotificationRow {
  readonly id: string;
  readonly kind: 'WELCOME' | 'SYSTEM' | 'BILLING' | 'MODERATION';
  readonly title: string;
  readonly body: string;
  readonly actionTab:
    'discover' | 'chats' | 'characters' | 'billing' | 'settings' | 'profile' | null;
  readonly readAt: number | null;
  readonly createdAt: number;
}

const idSchema = z.string().min(1).max(128);
const listQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();

export const notificationRoutes = new Hono<NotificationEnvironment>();

notificationRoutes.get('/notifications', async (context) => {
  const principal = context.get('principal');
  const { limit } = listQuerySchema.parse(context.req.query());
  const titleColumn = principal.locale === 'en' ? 'title_en' : 'title_ru';
  const bodyColumn = principal.locale === 'en' ? 'body_en' : 'body_ru';
  const [items, unread] = await Promise.all([
    context.env.DB.prepare(
      `SELECT id, kind, ${titleColumn} AS title, ${bodyColumn} AS body,
       action_tab AS actionTab, read_at AS readAt, created_at AS createdAt
       FROM user_notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
      .bind(principal.userId, limit)
      .all<NotificationRow>(),
    context.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM user_notifications
       WHERE user_id = ? AND read_at IS NULL`,
    )
      .bind(principal.userId)
      .first<{ readonly count: number }>(),
  ]);
  return context.json({ items: items.results, unreadCount: unread?.count ?? 0 });
});

notificationRoutes.post('/notifications/read-all', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `UPDATE user_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`,
  )
    .bind(nowMs(), principal.userId)
    .run();
  return context.json({ updated: result.meta.changes });
});

notificationRoutes.post('/notifications/:notificationId/read', async (context) => {
  const principal = context.get('principal');
  const notificationId = idSchema.parse(context.req.param('notificationId'));
  const result = await context.env.DB.prepare(
    `UPDATE user_notifications SET read_at = COALESCE(read_at, ?)
     WHERE id = ? AND user_id = ?`,
  )
    .bind(nowMs(), notificationId, principal.userId)
    .run();
  if (result.meta.changes !== 1) {
    throw new AppError('NOTIFICATION_NOT_FOUND', 'Уведомление не найдено.', 404);
  }
  return context.json({ id: notificationId, read: true });
});
