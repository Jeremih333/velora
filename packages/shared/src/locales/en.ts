import type { ru } from './ru';

type Localized<T> = {
  readonly [Key in keyof T]: T[Key] extends string ? string : Localized<T[Key]>;
};

export const en: Pick<Localized<typeof ru>, 'telegram' | 'billing'> = {
  telegram: {
    openButton: 'Open Velora',
    command: {
      start:
        '✨ *Welcome to Velora*\n\nCreate characters and stories with memory — right inside Telegram.',
      help: '🪄 *Velora*\n\nOpen the app with the button below. If sign-in fails, close the Mini App and open it again.',
      app: '🌙 *Open Velora*\n\nTap the button below to continue your stories.',
      support:
        '🛟 *Velora Support*\n\nOpen Support in the app and describe the issue in one message. Never send passwords or payment credentials.',
      settings:
        '⚙️ *Settings*\n\nTheme, language, default persona, privacy, and data controls are available inside the app.',
      terms:
        '📜 *Terms of Use*\n\nThe current terms are available under Legal Information in Velora.',
      privacy:
        '🔐 *Privacy*\n\nVelora verifies Telegram sign-in on the server and never publishes private stories. The policy is available inside the app.',
      premium:
        '✨ *Top up Velora*\n\nOnly one-time purchases with Telegram Stars — no subscription or automatic charges.',
      report:
        '🛡️ *Report a violation*\n\nOpen the relevant character or message in Velora and choose Report so moderators receive the necessary context.',
      paysupport:
        '⭐ *Payment Support*\n\nKeep Telegram’s payment message and open Support in Velora. Include the date and Stars amount — never send payment credentials.',
    },
    invalidInvoice: 'This invoice is invalid or no longer available.',
    creditsGranted:
      '✅ *AI credits added*\n\nThis was a one-time purchase: no subscription or automatic charges were created.',
    imageSaved:
      '🖼️ *Image saved*\n\nSelect it in the persona or character editor. Until moderation is complete, the image is available only in private drafts.',
  },
  billing: {
    planUnavailable: 'Plan settings are temporarily unavailable.',
    planRequired: 'This feature requires an eligible one-time Velora plan.',
    planLimitReached: 'Your current plan limit has been reached.',
    accessPackNotFound: 'This access pack is unavailable.',
    accessPackExists: 'This access-pack code is already in use.',
    freePlanRequired: 'The base Free plan cannot be disabled.',
    paymentsDisabled:
      'Purchases have not been enabled by the owner yet. No real invoice was created.',
    telegramUnavailable: 'Telegram payments are not configured yet.',
    idempotencyConflict: 'This key has already been used for another access pack.',
    paymentAlreadyProcessed: 'This invoice is already being processed.',
    accessGranted: 'One-time access has been granted.',
    grantFailed: 'The grant could not be saved. Please try again.',
    grantNotActive: 'No active administrative plan grant was found.',
    grantUserNotFound: 'User not found. They must open Velora through Telegram at least once.',
    accessGrantedBot:
      '✅ *Velora access granted*\n\nThis was a one-time purchase: no subscription or automatic renewal was created.',
    refundProcessedBot:
      '↩️ *Refund processed*\n\nAccess granted by the original purchase has been revoked.',
  },
};
