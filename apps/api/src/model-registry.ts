import type { ModelPrice } from '@velora/ai';
import { AppError } from '@velora/shared';

export type ModelTier = 'free' | 'standard' | 'premium';

export interface RoleplayModelProfile {
  readonly id: string;
  readonly providerModelId: string;
  readonly displayName: string;
  readonly descriptionRu: string;
  readonly bestForRu: string;
  readonly speedLabel: string;
  readonly qualityLabel: string;
  readonly roleplayLabel: string;
  readonly memoryLabel: string;
  readonly providerLabel: 'BotHub';
  readonly costLabelRu: string;
  readonly contextWindow: number;
  readonly maxOutput: number;
  readonly tier: ModelTier;
  readonly enabled: boolean;
  readonly experimental: boolean;
  readonly supportsStreaming: boolean;
  readonly fallbackIds: readonly string[];
  readonly price: ModelPrice;
}

// Provider IDs, conservative price ceilings and descriptions are server-owned.
// The browser never receives the BotHub key, master balance or internal budget ceilings.
export const ROLEPLAY_MODEL_REGISTRY: readonly RoleplayModelProfile[] = [
  {
    id: 'velora-deepseek-v3-0324',
    providerModelId: 'deepseek-chat-v3-0324',
    displayName: 'DeepSeek V3 0324 · Story',
    descriptionRu:
      'Стабильная модель для выразительных диалогов, действий персонажа и последовательного развития истории.',
    bestForRu: 'Повседневный ролплей, живые диалоги и сюжетные сцены',
    speedLabel: 'Высокая',
    qualityLabel: 'Высокое',
    roleplayLabel: 'Высокое',
    memoryLabel: 'Большая',
    providerLabel: 'BotHub',
    costLabelRu: 'Средний',
    contextWindow: 131_072,
    maxOutput: 1_400,
    tier: 'standard',
    enabled: true,
    experimental: false,
    supportsStreaming: true,
    fallbackIds: ['velora-free-context'],
    price: { inputPerMillionUsd: 0.3, outputPerMillionUsd: 1.26, fixedRequestUsd: 0.02 },
  },
  {
    id: 'velora-balanced',
    providerModelId: 'deepseek-chat-v3.1',
    displayName: 'VeloraAI Balanced',
    descriptionRu:
      'Проверенная модель для длинных ролевых историй, последовательных персонажей и повседневных диалогов.',
    bestForRu: 'Длинные истории и стабильная ролевая игра',
    speedLabel: 'Средняя',
    qualityLabel: 'Высокое',
    roleplayLabel: 'Высокое',
    memoryLabel: 'Большая',
    providerLabel: 'BotHub',
    costLabelRu: 'Средний',
    contextWindow: 131_072,
    maxOutput: 1_200,
    tier: 'standard',
    enabled: true,
    experimental: false,
    supportsStreaming: true,
    fallbackIds: ['velora-deepseek-v3-0324', 'velora-free-context'],
    price: { inputPerMillionUsd: 0.41, outputPerMillionUsd: 1.55, fixedRequestUsd: 0.02 },
  },
  {
    id: 'velora-llama-epic',
    providerModelId: 'llama-3.3-70b-instruct',
    displayName: 'Llama 3.3 70B · Epic',
    descriptionRu:
      'Стабильная большая модель для кинематографичных сцен, естественного диалога и взаимодействия нескольких персонажей.',
    bestForRu: 'Длинные сцены, группы персонажей и устойчивое продолжение истории',
    speedLabel: 'Средняя',
    qualityLabel: 'Высокое',
    roleplayLabel: 'Высокое',
    memoryLabel: 'Большая',
    providerLabel: 'BotHub',
    costLabelRu: 'Средний',
    contextWindow: 128_000,
    maxOutput: 1_400,
    tier: 'premium',
    enabled: true,
    experimental: false,
    supportsStreaming: true,
    fallbackIds: ['velora-balanced'],
    price: { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.34, fixedRequestUsd: 0.02 },
  },
  {
    id: 'velora-free-roleplay',
    providerModelId: 'l3-lunaris-8b',
    displayName: 'Lunaris Roleplay',
    descriptionRu:
      'Очень экономичная ролевая модель для коротких и средних сцен. Память VeloraAI помогает сохранять важный контекст истории.',
    bestForRu: 'Живые ролевые диалоги и короткие сцены',
    speedLabel: 'Высокая',
    qualityLabel: 'Базовое',
    roleplayLabel: 'Хорошее',
    memoryLabel: 'Большая',
    providerLabel: 'BotHub',
    costLabelRu: 'Очень низкий',
    contextWindow: 8_192,
    maxOutput: 800,
    tier: 'free',
    enabled: true,
    experimental: true,
    supportsStreaming: true,
    fallbackIds: ['velora-free-context'],
    price: { inputPerMillionUsd: 0.03, outputPerMillionUsd: 0.0375, fixedRequestUsd: 0.02 },
  },
  {
    id: 'velora-free-context',
    providerModelId: 'mistral-nemo',
    displayName: 'Mistral Nemo',
    descriptionRu:
      'Экономичная мультиязычная модель с большим контекстом для знакомства с приложением и историй средней сложности.',
    bestForRu: 'Длинный контекст и ролевая игра на русском',
    speedLabel: 'Высокая',
    qualityLabel: 'Базовое',
    roleplayLabel: 'Базовое',
    memoryLabel: 'Большая',
    providerLabel: 'BotHub',
    costLabelRu: 'Минимальный',
    contextWindow: 128_000,
    maxOutput: 800,
    tier: 'free',
    enabled: true,
    experimental: true,
    supportsStreaming: true,
    fallbackIds: [],
    price: { inputPerMillionUsd: 0.01425, outputPerMillionUsd: 0.0225, fixedRequestUsd: 0.02 },
  },
] as const;

export function findRoleplayModelProfile(id: string): RoleplayModelProfile | null {
  return ROLEPLAY_MODEL_REGISTRY.find((profile) => profile.id === id) ?? null;
}

export function requireRoleplayModelProfile(id: string): RoleplayModelProfile {
  const profile = findRoleplayModelProfile(id);
  if (!profile?.enabled) {
    throw new AppError('MODEL_PROFILE_UNAVAILABLE', 'Выбранная модель сейчас недоступна.', 409);
  }
  return profile;
}

export function canUseModelTier(planCode: string, tier: ModelTier): boolean {
  if (tier === 'free') return true;
  if (tier === 'standard') return ['PLUS', 'PRO'].includes(planCode);
  return planCode === 'PRO';
}

export function publicModelProjection(profile: RoleplayModelProfile, available: boolean) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    descriptionRu: profile.descriptionRu,
    bestForRu: profile.bestForRu,
    speedLabel: profile.speedLabel,
    qualityLabel: profile.qualityLabel,
    roleplayLabel: profile.roleplayLabel,
    memoryLabel: profile.memoryLabel,
    providerLabel: profile.providerLabel,
    costLabelRu: profile.costLabelRu,
    contextWindow: profile.contextWindow,
    maxOutput: profile.maxOutput,
    tier: profile.tier,
    experimental: profile.experimental,
    supportsStreaming: profile.supportsStreaming,
    available,
  };
}
