export type ModerationState =
  'OPEN' | 'TRIAGED' | 'IN_REVIEW' | 'RESOLVED' | 'APPEALED' | 'APPEAL_REVIEW' | 'CLOSED';

const transitions: Readonly<Record<ModerationState, readonly ModerationState[]>> = {
  OPEN: ['TRIAGED'],
  TRIAGED: ['IN_REVIEW'],
  IN_REVIEW: ['RESOLVED'],
  RESOLVED: ['APPEALED', 'CLOSED'],
  APPEALED: ['APPEAL_REVIEW'],
  APPEAL_REVIEW: ['CLOSED'],
  CLOSED: [],
};

export function canTransitionModeration(from: ModerationState, to: ModerationState): boolean {
  return transitions[from].includes(to);
}

export type ModerationRole =
  'USER' | 'CREATOR' | 'MODERATOR' | 'SENIOR_MODERATOR' | 'ADMIN' | 'OWNER';

export type ModerationAction =
  | 'NO_ACTION'
  | 'WARNING'
  | 'CONTENT_HIDE'
  | 'CONTENT_REMOVE'
  | 'TEMP_RESTRICTION'
  | 'ACCOUNT_SUSPEND'
  | 'ACCOUNT_BAN'
  | 'ESCALATE';

const roleRank: Readonly<Record<ModerationRole, number>> = {
  USER: 0,
  CREATOR: 0,
  MODERATOR: 1,
  SENIOR_MODERATOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

const actionRank: Readonly<Record<ModerationAction, number>> = {
  NO_ACTION: 1,
  WARNING: 1,
  CONTENT_HIDE: 1,
  CONTENT_REMOVE: 2,
  TEMP_RESTRICTION: 2,
  ACCOUNT_SUSPEND: 2,
  ACCOUNT_BAN: 3,
  ESCALATE: 1,
};

export function isModeratorRole(role: ModerationRole): boolean {
  return roleRank[role] > 0;
}

export function canModerateRole(actor: ModerationRole, target: ModerationRole): boolean {
  return isModeratorRole(actor) && roleRank[actor] > roleRank[target];
}

export function canTakeModerationAction(role: ModerationRole, action: ModerationAction): boolean {
  return roleRank[role] >= actionRank[action];
}
