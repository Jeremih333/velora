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

interface BotHubModelCapabilitiesRow {
  readonly availableCandidatesJson: string;
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
    model: 'deepseek-chat-v3-0324',
    price: { inputPerMillionUsd: 0.3, outputPerMillionUsd: 1.26, fixedRequestUsd: 0.02 },
  },
  {
    model: 'mistral-nemo',
    price: { inputPerMillionUsd: 0.01425, outputPerMillionUsd: 0.0225, fixedRequestUsd: 0.02 },
  },
  {
    model: 'l3-lunaris-8b',
    price: { inputPerMillionUsd: 0.03, outputPerMillionUsd: 0.0375, fixedRequestUsd: 0.02 },
  },
  {
    model: 'llama-3.3-70b-instruct',
    price: { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.34, fixedRequestUsd: 0.02 },
  },
];

export function findRoleplayModelCandidate(model: string): RoleplayModelCandidate | null {
  return ROLEPLAY_MODEL_CANDIDATES.find((candidate) => candidate.model === model) ?? null;
}

export function parseBotHubModelCapabilitiesRow(
  row: BotHubModelCapabilitiesRow,
): BotHubModelCapabilities | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.availableCandidatesJson);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.every((model) => typeof model === 'string')) return null;
  const reviewed = new Set(ROLEPLAY_MODEL_CANDIDATES.map(({ model }) => model));
  const availableCandidates = [...new Set(parsed.filter((model) => reviewed.has(model)))];
  return {
    availableCandidates,
    selectedModel: row.selectedModel && reviewed.has(row.selectedModel) ? row.selectedModel : null,
    checkedAt: row.checkedAt,
  };
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
    .first<BotHubModelCapabilitiesRow>();
  if (!row) return null;
  return parseBotHubModelCapabilitiesRow(row);
}
