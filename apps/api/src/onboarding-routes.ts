import { onboardingCompleteSchema } from '@velora/domain';
import { createId, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import type { Env, Variables } from './types';

interface OnboardingEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface CompletionRow {
  readonly personaId: string | null;
  readonly matureEnabled: number;
  readonly policyAcceptedAt: number;
  readonly completedAt: number;
}

export const onboardingRoutes = new Hono<OnboardingEnvironment>();

onboardingRoutes.post('/complete', async (context) => {
  const principal = context.get('principal');
  const input = onboardingCompleteSchema.parse(await context.req.json());
  const existing = await readCompletion(context.env.DB, principal.userId);
  if (existing) return context.json(toResponse(existing));

  const timestamp = nowMs();
  const personaId = input.persona ? createId() : null;
  const statements: D1PreparedStatement[] = [];
  if (input.persona && personaId) {
    statements.push(
      context.env.DB.prepare(
        `INSERT INTO personas (
            id, user_id, name, avatar_file_id, short_description, long_description,
            personality, appearance, speaking_style, background, pronouns, represented_age,
            custom_notes, visibility, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, ?, '', '', '', '', '', '', NULL, '', 'PRIVATE', ?, ?)`,
      ).bind(
        personaId,
        principal.userId,
        input.persona.name,
        input.persona.shortDescription,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        `UPDATE personas SET is_default = 1 WHERE id = ? AND NOT EXISTS (
            SELECT 1 FROM personas
            WHERE user_id = ? AND is_default = 1 AND deleted_at IS NULL AND id != ?
          )`,
      ).bind(personaId, principal.userId, personaId),
      context.env.DB.prepare(
        `UPDATE user_settings SET
            default_persona_id = COALESCE(
              default_persona_id,
              (SELECT id FROM personas
               WHERE user_id = ? AND is_default = 1 AND deleted_at IS NULL LIMIT 1)
            ),
            updated_at = ?
           WHERE user_id = ?`,
      ).bind(principal.userId, timestamp, principal.userId),
    );
  }
  statements.push(
    context.env.DB.prepare(
      'UPDATE user_settings SET nsfw_visible = ?, updated_at = ? WHERE user_id = ?',
    ).bind(input.matureEnabled ? 1 : 0, timestamp, principal.userId),
    context.env.DB.prepare(
      `UPDATE users SET
          age_gate_accepted_at = CASE
            WHEN ? = 1 THEN COALESCE(age_gate_accepted_at, ?)
            ELSE age_gate_accepted_at
          END,
          updated_at = ?
         WHERE id = ?`,
    ).bind(input.matureEnabled ? 1 : 0, timestamp, timestamp, principal.userId),
    context.env.DB.prepare(
      `INSERT INTO onboarding_completions (
          user_id, idempotency_key, persona_id, mature_enabled, policy_accepted_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      principal.userId,
      input.idempotencyKey,
      personaId,
      input.matureEnabled ? 1 : 0,
      timestamp,
      timestamp,
    ),
  );

  try {
    await context.env.DB.batch(statements);
  } catch (error) {
    const replay = await readCompletion(context.env.DB, principal.userId);
    if (replay) return context.json(toResponse(replay));
    throw error;
  }
  const created = await readCompletion(context.env.DB, principal.userId);
  if (!created) throw new Error('Onboarding completion was not persisted.');
  return context.json(toResponse(created), 201);
});

async function readCompletion(database: D1Database, userId: string): Promise<CompletionRow | null> {
  return database
    .prepare(
      `SELECT persona_id AS personaId, mature_enabled AS matureEnabled,
        policy_accepted_at AS policyAcceptedAt, completed_at AS completedAt
       FROM onboarding_completions WHERE user_id = ?`,
    )
    .bind(userId)
    .first<CompletionRow>();
}

function toResponse(row: CompletionRow) {
  return {
    completed: true,
    personaId: row.personaId,
    matureEnabled: row.matureEnabled === 1,
    policyAcceptedAt: row.policyAcceptedAt,
    completedAt: row.completedAt,
  };
}
