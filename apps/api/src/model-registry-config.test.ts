import { describe, expect, it } from 'vitest';
import { ROLEPLAY_MODEL_REGISTRY } from './model-registry';
import {
  selectRoleplayModelIdForPlan,
  type EffectiveRoleplayModelProfile,
} from './model-registry-config';

const profiles: readonly EffectiveRoleplayModelProfile[] = ROLEPLAY_MODEL_REGISTRY.map(
  (profile) => ({ ...profile, updatedAt: null, updatedBy: null }),
);

describe('tariff-aware conversation model defaults', () => {
  it('gives a Free user an enabled Free model instead of the paid global default', () => {
    expect(selectRoleplayModelIdForPlan(profiles, 'FREE', null, 'velora-balanced')).toBe(
      'velora-free-roleplay',
    );
  });

  it('keeps an accessible saved choice for each paid plan', () => {
    expect(
      selectRoleplayModelIdForPlan(profiles, 'PLUS', 'velora-deepseek-v3-0324', 'velora-balanced'),
    ).toBe('velora-deepseek-v3-0324');
    expect(
      selectRoleplayModelIdForPlan(profiles, 'PRO', 'velora-llama-epic', 'velora-balanced'),
    ).toBe('velora-llama-epic');
  });

  it('repairs a stale paid choice after the user returns to Free', () => {
    expect(
      selectRoleplayModelIdForPlan(profiles, 'FREE', 'velora-llama-epic', 'velora-balanced'),
    ).toBe('velora-free-roleplay');
  });

  it('never returns a disabled model', () => {
    const disabledFree = profiles.map((profile) =>
      profile.id === 'velora-free-roleplay' ? { ...profile, enabled: false } : profile,
    );
    expect(selectRoleplayModelIdForPlan(disabledFree, 'FREE', null, 'velora-balanced')).toBe(
      'velora-free-context',
    );
  });
});
