import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { characterRoutes } from './character-routes';
import type { Env, Variables } from './types';

describe('owned character library', () => {
  it('applies visibility, type, search, and oldest-first filters to D1', async () => {
    let preparedSql = '';
    let boundValues: readonly unknown[] = [];
    const statement = {
      bind: (...values: readonly unknown[]) => {
        boundValues = values;
        return statement;
      },
      all: () => Promise.resolve({ results: [] }),
    };
    const database = {
      prepare: (sql: string) => {
        preparedSql = sql;
        return statement;
      },
    } as unknown as D1Database;
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use('*', async (context, next) => {
      context.set('principal', {
        userId: 'author-1',
        telegramId: '100',
        role: 'USER',
      } as Variables['principal']);
      await next();
    });
    app.route('/api/v1/characters', characterRoutes);

    const response = await app.request(
      '/api/v1/characters?q=Alice&visibility=PRIVATE&kind=small&sort=oldest',
      {},
      { DB: database },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
    expect(preparedSql).toContain('c.visibility = ?');
    expect(preparedSql).toContain('c.group_size = ?');
    expect(preparedSql).toContain('ORDER BY c.updated_at ASC, c.id ASC');
    expect(boundValues).toEqual(['author-1', 'PRIVATE', 'small', 'Alice', 'Alice', 'Alice']);
  });
});
