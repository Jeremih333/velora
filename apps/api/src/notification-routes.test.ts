import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { AppError } from '@velora/shared';
import { notificationRoutes } from './notification-routes';
import type { Env, Variables } from './types';

function appWithDatabase(database: D1Database) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use('*', async (context, next) => {
    context.set('principal', {
      userId: 'user-1',
      telegramId: '1',
      locale: 'ru',
      role: 'USER',
    } as Variables['principal']);
    await next();
  });
  app.onError((error, context) => {
    if (error instanceof AppError) {
      return context.json(
        { error: { code: error.code, message: error.message } },
        error.status as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503,
      );
    }
    return context.json({ error: { code: 'INTERNAL_ERROR' } }, 500);
  });
  app.route('/api/v1', notificationRoutes);
  return { app, database };
}

describe('notification routes', () => {
  it('returns only the principal notifications with the unread count', async () => {
    const statements: string[] = [];
    const database = {
      prepare: (sql: string) => {
        statements.push(sql);
        const statement = {
          bind: () => statement,
          all: () =>
            Promise.resolve({
              results: [
                {
                  id: 'notice-1',
                  kind: 'WELCOME',
                  title: 'Добро пожаловать',
                  body: 'Начни историю.',
                  actionTab: 'discover',
                  readAt: null,
                  createdAt: 10,
                },
              ],
            }),
          first: () => Promise.resolve({ count: 1 }),
        };
        return statement;
      },
    } as unknown as D1Database;
    const { app } = appWithDatabase(database);
    const response = await app.request('/api/v1/notifications?limit=10', {}, { DB: database });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ unreadCount: 1, items: [{ id: 'notice-1' }] });
    expect(statements.every((sql) => sql.includes('user_id = ?'))).toBe(true);
    expect(statements[0]).toContain('title_ru AS title');
  });

  it('cannot mark another user notification as read', async () => {
    const statement = {
      bind: () => statement,
      run: () => Promise.resolve({ meta: { changes: 0 } }),
    };
    const database = { prepare: () => statement } as unknown as D1Database;
    const { app } = appWithDatabase(database);
    const response = await app.request(
      '/api/v1/notifications/notice-from-another-user/read',
      { method: 'POST' },
      { DB: database },
    );
    expect(response.status).toBe(404);
  });
});
