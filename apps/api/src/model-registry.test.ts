import { describe, expect, it } from 'vitest';
import {
  canUseModelTier,
  publicModelProjection,
  requireRoleplayModelProfile,
  ROLEPLAY_MODEL_REGISTRY,
} from './model-registry';

describe('roleplay model registry', () => {
  it('uses stable unique IDs and keeps provider configuration server-side', () => {
    expect(new Set(ROLEPLAY_MODEL_REGISTRY.map(({ id }) => id)).size).toBe(
      ROLEPLAY_MODEL_REGISTRY.length,
    );
    expect(
      new Set(ROLEPLAY_MODEL_REGISTRY.map(({ providerModelId }) => providerModelId)).size,
    ).toBe(ROLEPLAY_MODEL_REGISTRY.length);
    expect(ROLEPLAY_MODEL_REGISTRY).toHaveLength(5);
    const freeModels = ROLEPLAY_MODEL_REGISTRY.filter(({ tier }) => tier === 'free');
    expect(freeModels.map(({ id }) => id)).toEqual(['velora-free-roleplay', 'velora-free-context']);
    expect(freeModels.map(({ providerModelId }) => providerModelId)).toEqual([
      'l3-lunaris-8b',
      'mistral-nemo',
    ]);
    expect(freeModels.every(({ maxOutput }) => maxOutput <= 800)).toBe(true);
    expect(
      freeModels.every(
        ({ price }) =>
          price.fixedRequestUsd === 0.02 &&
          price.inputPerMillionUsd < 0.41 &&
          price.outputPerMillionUsd < 1.55,
      ),
    ).toBe(true);
    const firstFreeModel = freeModels[0];
    expect(firstFreeModel).toBeDefined();
    if (!firstFreeModel) throw new Error('Expected at least one Free model fixture.');
    const projected = publicModelProjection(firstFreeModel, true);
    expect(projected).not.toHaveProperty('providerModelId');
    expect(projected).not.toHaveProperty('price');
    expect(projected.providerLabel).toBe('BotHub');
    expect(projected.costLabelRu).toBe('Очень низкий');
    expect(projected.available).toBe(true);
  });

  it('enforces model tiers without trusting the browser', () => {
    expect(canUseModelTier('FREE', 'free')).toBe(true);
    expect(canUseModelTier('FREE', 'standard')).toBe(false);
    expect(canUseModelTier('PLUS', 'standard')).toBe(true);
    expect(canUseModelTier('FREE', 'premium')).toBe(false);
    expect(canUseModelTier('PLUS', 'premium')).toBe(false);
    expect(canUseModelTier('PRO', 'premium')).toBe(true);
    expect(
      ROLEPLAY_MODEL_REGISTRY.filter(({ tier }) => tier === 'standard').map(({ id }) => id),
    ).toEqual(['velora-deepseek-v3-0324', 'velora-balanced']);
    expect(
      ROLEPLAY_MODEL_REGISTRY.filter(({ tier }) => tier === 'premium').map(({ id }) => id),
    ).toEqual(['velora-llama-epic']);
    expect(() => requireRoleplayModelProfile('unknown-model')).toThrow(
      'Выбранная модель сейчас недоступна.',
    );
  });
});
