import { AppError } from '@velora/shared';
import { z } from 'zod';
import {
  canUseModelTier,
  findRoleplayModelProfile,
  ROLEPLAY_MODEL_REGISTRY,
  type ModelTier,
  type RoleplayModelProfile,
} from './model-registry';

const fallbackIdsSchema = z
  .array(z.string().min(1).max(80))
  .max(2)
  .refine((items) => new Set(items).size === items.length, 'Fallback IDs must be unique.');

interface OverrideRow {
  readonly modelProfileId: string;
  readonly displayName: string;
  readonly descriptionRu: string;
  readonly tier: ModelTier;
  readonly enabled: number;
  readonly fallbackIdsJson: string;
  readonly updatedAt: number;
  readonly updatedBy: string | null;
}

export interface EffectiveRoleplayModelProfile extends RoleplayModelProfile {
  readonly updatedAt: number | null;
  readonly updatedBy: string | null;
}

export async function readEffectiveRoleplayModelProfiles(
  database: D1Database,
): Promise<readonly EffectiveRoleplayModelProfile[]> {
  const result = await database
    .prepare(
      `SELECT model_profile_id AS modelProfileId, display_name AS displayName,
       description_ru AS descriptionRu, tier, enabled, fallback_ids_json AS fallbackIdsJson,
       updated_at AS updatedAt, updated_by AS updatedBy
       FROM roleplay_model_overrides ORDER BY model_profile_id`,
    )
    .all<OverrideRow>();
  const rows = new Map(result.results.map((row) => [row.modelProfileId, row] as const));
  return ROLEPLAY_MODEL_REGISTRY.map((base) => mergeOverride(base, rows.get(base.id)));
}

export async function requireEffectiveRoleplayModelProfile(
  database: D1Database,
  id: string,
): Promise<EffectiveRoleplayModelProfile> {
  const profile = (await readEffectiveRoleplayModelProfiles(database)).find(
    (item) => item.id === id,
  );
  if (!profile?.enabled) {
    throw new AppError('MODEL_PROFILE_UNAVAILABLE', 'Выбранная модель сейчас недоступна.', 409);
  }
  return profile;
}

export async function readDefaultRoleplayModelId(database: D1Database): Promise<string> {
  const [row, profiles] = await Promise.all([
    database
      .prepare(
        'SELECT model_profile_id AS modelProfileId FROM roleplay_model_default WHERE singleton = 1',
      )
      .first<{ readonly modelProfileId: string }>(),
    readEffectiveRoleplayModelProfiles(database),
  ]);
  const selected = profiles.find(
    (profile) => profile.id === row?.modelProfileId && profile.enabled,
  );
  const fallback =
    profiles.find((profile) => profile.id === 'velora-balanced' && profile.enabled) ??
    profiles.find((profile) => profile.tier === 'free' && profile.enabled) ??
    profiles.find((profile) => profile.enabled);
  if (!selected && !fallback) {
    throw new AppError(
      'MODEL_PROFILE_UNAVAILABLE',
      'Нет доступной модели для нового диалога.',
      503,
    );
  }
  return (selected ?? fallback)?.id ?? 'velora-balanced';
}

export function selectRoleplayModelIdForPlan(
  profiles: readonly EffectiveRoleplayModelProfile[],
  planCode: string,
  preferredId: string | null,
  configuredDefaultId: string | null,
): string | null {
  const accessible = (profile: EffectiveRoleplayModelProfile): boolean =>
    profile.enabled && canUseModelTier(planCode, profile.tier);
  return (
    profiles.find((profile) => profile.id === preferredId && accessible(profile))?.id ??
    profiles.find((profile) => profile.id === configuredDefaultId && accessible(profile))?.id ??
    profiles.find((profile) => profile.tier === 'free' && accessible(profile))?.id ??
    profiles.find(accessible)?.id ??
    null
  );
}

export async function readRoleplayModelIdForPlan(
  database: D1Database,
  planCode: string,
  preferredId: string | null = null,
): Promise<string> {
  const [defaultRow, profiles] = await Promise.all([
    database
      .prepare(
        'SELECT model_profile_id AS modelProfileId FROM roleplay_model_default WHERE singleton = 1',
      )
      .first<{ readonly modelProfileId: string }>(),
    readEffectiveRoleplayModelProfiles(database),
  ]);
  const selected = selectRoleplayModelIdForPlan(
    profiles,
    planCode,
    preferredId,
    defaultRow?.modelProfileId ?? null,
  );
  if (!selected) {
    throw new AppError('MODEL_PROFILE_UNAVAILABLE', 'Нет модели, доступной на вашем тарифе.', 503);
  }
  return selected;
}

function mergeOverride(
  base: RoleplayModelProfile,
  row: OverrideRow | undefined,
): EffectiveRoleplayModelProfile {
  if (!row) return { ...base, updatedAt: null, updatedBy: null };
  const fallbacks = parseFallbackIds(row.fallbackIdsJson, base.id);
  return {
    ...base,
    displayName: row.displayName,
    descriptionRu: row.descriptionRu,
    tier: row.tier,
    enabled: row.enabled === 1,
    fallbackIds: fallbacks,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

function parseFallbackIds(value: string, primaryId: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return [];
  }
  const result = fallbackIdsSchema.safeParse(parsed);
  if (!result.success) return [];
  return result.data.filter((id) => id !== primaryId && findRoleplayModelProfile(id) !== null);
}
