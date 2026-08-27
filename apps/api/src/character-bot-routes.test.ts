import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { characterBotRoutes } from './character-bot-routes';
import type { Env, Variables } from './types';

describe('character bot routes', () => {
  it('lists bots using the active character version name', async () => {
    let preparedSql = '';
    const statement = {
      bind: () => statement,
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
        userId: 'owner',
        telegramId: '1',
        role: 'OWNER',
      } as Variables['principal']);
      await next();
    });
    app.route('/api/v1', characterBotRoutes);
    const response = await app.request('/api/v1/character-bots', {}, { DB: database });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
    expect(preparedSql).toContain('v.name AS characterName');
    expect(preparedSql).toContain('JOIN character_versions v ON v.id = c.active_version_id');
    expect(preparedSql).not.toContain('c.name AS characterName');
  });
});
