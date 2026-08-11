import { describe, expect, it } from 'vitest';
import {
  canModerateRole,
  canTakeModerationAction,
  canTransitionModeration,
  isModeratorRole,
} from './index';

describe('moderation state machine', () => {
  it('allows documented transitions only', () => {
    expect(canTransitionModeration('OPEN', 'TRIAGED')).toBe(true);
    expect(canTransitionModeration('OPEN', 'CLOSED')).toBe(false);
    expect(canTransitionModeration('CLOSED', 'OPEN')).toBe(false);
  });

  it('enforces role hierarchy and action privilege', () => {
    expect(isModeratorRole('CREATOR')).toBe(false);
    expect(isModeratorRole('MODERATOR')).toBe(true);
    expect(canModerateRole('MODERATOR', 'USER')).toBe(true);
    expect(canModerateRole('MODERATOR', 'MODERATOR')).toBe(false);
    expect(canModerateRole('ADMIN', 'SENIOR_MODERATOR')).toBe(true);
    expect(canModerateRole('ADMIN', 'OWNER')).toBe(false);
    expect(canTakeModerationAction('MODERATOR', 'CONTENT_HIDE')).toBe(true);
    expect(canTakeModerationAction('MODERATOR', 'ACCOUNT_BAN')).toBe(false);
    expect(canTakeModerationAction('ADMIN', 'ACCOUNT_BAN')).toBe(true);
  });
});
