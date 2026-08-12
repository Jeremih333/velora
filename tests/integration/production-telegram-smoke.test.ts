import { describe, expect, it, vi } from 'vitest';
import {
  buildProductionTelegramSmokeQueryForMarker,
  evaluateProductionTelegramSmoke,
  parseWranglerD1Rows,
} from '../../toolkit/production-telegram-smoke.mjs';

describe('production Telegram smoke evidence', () => {
  it('requires a completed new update, the exact owner and a new active session', () => {
    const startedAt = 1_786_550_000_000;
    expect(
      evaluateProductionTelegramSmoke(
        {
          owner_smoke_events: 1,
          owner_users: 1,
          owner_last_seen_at: startedAt,
          active_sessions: 1,
        },
        startedAt,
      ),
    ).toEqual({ startVerified: true, miniAppVerified: true });
    expect(
      evaluateProductionTelegramSmoke(
        {
          owner_smoke_events: 0,
          owner_users: 1,
          owner_last_seen_at: startedAt - 1,
          active_sessions: 0,
        },
        startedAt,
      ),
    ).toEqual({ startVerified: false, miniAppVerified: false });
  });

  it('builds an aggregate-only query bounded to new owner evidence', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_786_550_100_000);
    const marker = `velora_smoke_${'a'.repeat(32)}`;
    const query = buildProductionTelegramSmokeQueryForMarker(1_786_550_000_000, marker);
    expect(query).toContain("telegram_id = '1040929628'");
    expect(query).toContain("role = 'OWNER'");
    expect(query).toContain("a.action = 'TELEGRAM_PRODUCTION_SMOKE'");
    expect(query).toContain(
      "a.target_id = '07e77891a73de5c7fa51d23b73c68d4140e85ac59a0c251b2cb28b804bb9b432'",
    );
    expect(query).toContain('a.created_at >= 1786550000000');
    expect(query).toContain('s.created_at >= 1786550000000');
    expect(query).toContain('s.expires_at > 1786550100000');
    expect(query).not.toContain('content');
    expect(query).not.toContain('token_hash');
    expect(() =>
      buildProductionTelegramSmokeQueryForMarker(1_786_550_000_000, 'ordinary-referral'),
    ).toThrow('Invalid production smoke marker');
  });

  it('accepts only successful single-query Wrangler JSON', () => {
    expect(
      parseWranglerD1Rows(
        JSON.stringify([{ results: [{ owner_smoke_events: 1 }], success: true }]),
      ),
    ).toEqual([{ owner_smoke_events: 1 }]);
    expect(() => parseWranglerD1Rows('{}')).toThrow('unexpected D1 response');
    expect(() => parseWranglerD1Rows(JSON.stringify([{ results: [], success: false }]))).toThrow(
      'unexpected D1 response',
    );
  });
});
