import type { ModelPrice } from '@velora/ai';

export interface RoleplayModelCandidate {
  readonly model: string;
  readonly price: ModelPrice;
}

export interface BotHubModelCapabilities {
  readonly availableCandidates: readonly string[];
  readonly selectedModel: string | null;
  readonly checkedAt: number;
}

// Ordered by the current roleplay quality/cost preference. Only this reviewed intersection may be
// persisted from BotHub's private key-scoped model catalogue or selected for a paid checkpoint.
export const ROLEPLAY_MODEL_CANDIDATES: readonly RoleplayModelCandidate[] = [
  {
    model: 'deepseek-v3.2-speciale',
    price: { inputPerMillionUsd: 0.65, outputPerMillionUsd: 1.95, fixedRequestUsd: 0.02 },
  },
  {
    model: 'deepseek-chat-v3.1',
    price: { inputPerMillionUsd: 0.41, outputPerMillionUsd: 1.55, fixedRequestUsd: 0.02 },
  },
  {
    model: 'kimi-k2.5',
    price: { inputPerMillionUsd: 0.93, outputPerMillionUsd: 4.64, fixedRequestUsd: 0.02 },
  },
  {
    model: 'deepseek-r1t2-chimera',
    price: { inputPerMillionUsd: 0.49, outputPerMillionUsd: 1.79, fixedRequestUsd: 0.02 },
  },
  {
    model: 'qwen3-8b',
    price: { inputPerMillionUsd: 0.2, outputPerMillionUsd: 0.75, fixedRequestUsd: 0.02 },
  },
  {
    model: 'gpt-5-nano',
    price: { inputPerMillionUsd: 0.09, outputPerMillionUsd: 0.66, fixedRequestUsd: 0.02 },
  },
  {
    model: 'gpt-5.4-mini',
    price: { inputPerMillionUsd: 1.22, outputPerMillionUsd: 7.32, fixedRequestUsd: 0.02 },
  },
];

export function findRoleplayModelCandidate(model: string): RoleplayModelCandidate | null {
  return ROLEPLAY_MODEL_CANDIDATES.find((candidate) => candidate.model === model) ?? null;
}

export async function readBotHubModelCapabilities(
  database: D1Database,
): Promise<BotHubModelCapabilities | null> {
  const row = await database
    .prepare(
      `SELECT available_candidates_json AS availableCandidatesJson,
       selected_model AS selectedModel, checked_at AS checkedAt
       FROM provider_model_capabilities WHERE provider = 'BOTHUB'`,
    )
    .first<{
      readonly availableCandidatesJson: string;
      readonly selectedModel: string | null;
      readonly checkedAt: number;
    }>();
  if (!row) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.availableCandidatesJson);
  } catch {
    return null;
  }
  const reviewed = new Set(ROLEPLAY_MODEL_CANDIDATES.map(({ model }) => model));
  if (
    !Array.isArray(parsed) ||
    !parsed.every((model) => typeof model === 'string' && reviewed.has(model))
  ) {
    return null;
  }
  return {
    availableCandidates: parsed,
    selectedModel: row.selectedModel && reviewed.has(row.selectedModel) ? row.selectedModel : null,
    checkedAt: row.checkedAt,
  };
}
