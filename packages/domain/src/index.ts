import { z } from 'zod';

export const visibilitySchema = z.enum([
  'PUBLIC',
  'UNLISTED',
  'PRIVATE',
  'MODERATION_HIDDEN',
  'DELETED',
]);
export const messageRoleSchema = z.enum(['USER', 'ASSISTANT', 'SYSTEM_INTERNAL']);
export const messageStatusSchema = z.enum([
  'PENDING',
  'STREAMING',
  'COMPLETED',
  'STOPPED',
  'FAILED',
  'MODERATED',
]);
export const characterStateSchema = z.enum([
  'DRAFT',
  'MODERATION_PENDING',
  'PUBLISHED',
  'REJECTED',
  'HIDDEN',
]);
export const generationStateSchema = z.enum([
  'IDLE',
  'PENDING',
  'STREAMING',
  'COMPLETED',
  'STOPPED',
  'FAILED',
]);

export const personaInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  avatarFileId: z.uuid().nullable().default(null),
  shortDescription: z.string().trim().max(280).default(''),
  longDescription: z.string().trim().max(12_000).default(''),
  personality: z.string().trim().max(12_000).default(''),
  appearance: z.string().trim().max(12_000).default(''),
  speakingStyle: z.string().trim().max(8_000).default(''),
  background: z.string().trim().max(12_000).default(''),
  pronouns: z.string().trim().max(80).default(''),
  representedAge: z.string().trim().max(80).nullable().default(null),
  customNotes: z.string().trim().max(8_000).default(''),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PRIVATE'),
});

export const personaPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    avatarFileId: z.uuid().nullable().optional(),
    shortDescription: z.string().trim().max(280).optional(),
    longDescription: z.string().trim().max(12_000).optional(),
    personality: z.string().trim().max(12_000).optional(),
    appearance: z.string().trim().max(12_000).optional(),
    speakingStyle: z.string().trim().max(8_000).optional(),
    background: z.string().trim().max(12_000).optional(),
    pronouns: z.string().trim().max(80).optional(),
    representedAge: z.string().trim().max(80).nullable().optional(),
    customNotes: z.string().trim().max(8_000).optional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const onboardingCompleteSchema = z.object({
  idempotencyKey: z.uuid(),
  policyAccepted: z.literal(true),
  matureEnabled: z.boolean().default(false),
  persona: z
    .object({
      name: z.string().trim().min(1).max(80),
      shortDescription: z.string().trim().max(280).default(''),
    })
    .nullable()
    .default(null),
});

export const characterInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  avatarFileId: z.uuid().nullable().default(null),
  tagline: z.string().trim().min(1).max(180),
  description: z.string().trim().min(20).max(24_000),
  personality: z.string().trim().min(20).max(24_000),
  scenario: z.string().trim().max(24_000).default(''),
  firstMessage: z.string().trim().min(1).max(16_000),
  exampleDialogues: z.string().trim().max(32_000).default(''),
  creatorNotes: z.string().trim().max(8_000).default(''),
  speechStyle: z.string().trim().max(12_000).default(''),
  appearance: z.string().trim().max(12_000).default(''),
  background: z.string().trim().max(12_000).default(''),
  goals: z.string().trim().max(12_000).default(''),
  behaviourRules: z.string().trim().max(16_000).default(''),
  systemInstructions: z.string().trim().max(16_000).default(''),
  postHistoryInstructions: z.string().trim().max(8_000).default(''),
  alternateGreetings: z.array(z.string().trim().min(1).max(16_000)).max(10).default([]),
  language: z.enum(['ru', 'en']),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).default('PRIVATE'),
  contentRating: z.enum(['SAFE', 'MATURE']),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const characterPatchSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(100).optional(),
    avatarFileId: z.uuid().nullable().optional(),
    tagline: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().min(20).max(24_000).optional(),
    personality: z.string().trim().min(20).max(24_000).optional(),
    scenario: z.string().trim().max(24_000).optional(),
    firstMessage: z.string().trim().min(1).max(16_000).optional(),
    exampleDialogues: z.string().trim().max(32_000).optional(),
    creatorNotes: z.string().trim().max(8_000).optional(),
    speechStyle: z.string().trim().max(12_000).optional(),
    appearance: z.string().trim().max(12_000).optional(),
    background: z.string().trim().max(12_000).optional(),
    goals: z.string().trim().max(12_000).optional(),
    behaviourRules: z.string().trim().max(16_000).optional(),
    systemInstructions: z.string().trim().max(16_000).optional(),
    postHistoryInstructions: z.string().trim().max(8_000).optional(),
    alternateGreetings: z.array(z.string().trim().min(1).max(16_000)).max(10).optional(),
    language: z.enum(['ru', 'en']).optional(),
    visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
    contentRating: z.enum(['SAFE', 'MATURE']).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'baseVersion'), {
    message: 'At least one changed field is required.',
  });

export type PersonaInput = z.infer<typeof personaInputSchema>;
export type PersonaPatch = z.infer<typeof personaPatchSchema>;
export type CharacterInput = z.infer<typeof characterInputSchema>;
export type CharacterPatch = z.infer<typeof characterPatchSchema>;

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(100)
  .regex(/^[a-zA-Z0-9._:-]+$/u);

export const conversationCreateSchema = z.object({
  characterId: z.uuid(),
  personaId: z.uuid().nullable().optional(),
  greetingIndex: z.number().int().min(0).max(10).default(0),
  title: z.string().trim().min(1).max(120).optional(),
  preview: z.boolean().default(false),
  idempotencyKey: idempotencyKeySchema,
});

export const conversationPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    state: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
    modelProfile: z.enum(['BALANCED', 'CREATIVE', 'PREMIUM']).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(64).max(8192).optional(),
    responseLength: z.enum(['SHORT', 'MEDIUM', 'LONG']).optional(),
    customInstructions: z.string().trim().max(8_000).optional(),
    personaMode: z.enum(['SNAPSHOT', 'LIVE']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one change is required.');

export const messageCreateSchema = z.object({
  content: z.string().trim().min(1).max(16_000),
  parentMessageId: z.uuid().nullable().optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const messageEditSchema = z.object({
  content: z.string().trim().min(1).max(16_000),
  idempotencyKey: idempotencyKeySchema,
});

export const memoryEditSchema = z.object({
  content: z.string().trim().max(64_000),
  idempotencyKey: idempotencyKeySchema,
});

export const memoryRestoreSchema = z.object({ idempotencyKey: idempotencyKeySchema });
export const memoryJobSchema = z.object({ idempotencyKey: idempotencyKeySchema });
export const starsInvoiceInputSchema = z.object({
  packCode: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{2,39}$/u),
  termsAccepted: z.literal(true),
  idempotencyKey: idempotencyKeySchema,
});
export const starsAccessInvoiceInputSchema = z.object({
  packCode: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{2,39}$/u),
  termsAccepted: z.literal(true),
  idempotencyKey: idempotencyKeySchema,
});
export const creditPackInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{2,39}$/u),
  displayName: z.string().trim().min(1).max(32),
  description: z.string().trim().min(1).max(255),
  starsAmount: z.number().int().min(1).max(10_000),
  creditAmountMicros: z.number().int().min(1).max(1_000_000_000),
  active: z.boolean().default(false),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
});
export const creditPackPatchSchema = creditPackInputSchema
  .omit({ code: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one change is required.');
export const planEntitlementsInputSchema = z
  .object({
    rateLimitMultiplier: z.number().int().min(1).max(10),
    characterLimit: z.number().int().min(1).max(1_000),
    personaLimit: z.number().int().min(1).max(100),
    memoryTokenBudget: z.number().int().min(100).max(100_000),
    loreTokenBudget: z.number().int().min(100).max(100_000),
    advancedOperationsDaily: z.number().int().min(0).max(1_000),
    modelProfiles: z
      .array(z.enum(['BALANCED', 'CREATIVE', 'PREMIUM']))
      .min(1)
      .max(3),
  })
  .strict();
export const planPatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(32).optional(),
    active: z.boolean().optional(),
    rank: z.number().int().min(0).max(1_000).optional(),
    entitlements: planEntitlementsInputSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one change is required.');
export const accessPackInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_-]{2,39}$/u),
    displayName: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(255),
    starsAmount: z.number().int().min(1).max(10_000),
    planCode: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{1,31}$/u),
    durationDays: z.number().int().min(1).max(366),
    active: z.boolean().default(false),
    sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
  })
  .strict();
export const accessPackPatchSchema = accessPackInputSchema
  .omit({ code: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one change is required.');
export const generationCreateSchema = z.object({
  parentMessageId: z.uuid().optional(),
  mode: z.enum(['REPLY', 'CONTINUE']).default('REPLY'),
  idempotencyKey: idempotencyKeySchema,
});

const loreKeysSchema = z.array(z.string().trim().min(1).max(120)).min(1).max(50);
export const lorebookInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4_000).default(''),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).default('PRIVATE'),
});
export const lorebookPatchSchema = lorebookInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one change is required.');
export const loreEntryInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(32_000),
  keys: loreKeysSchema,
  secondaryKeys: loreKeysSchema.or(z.tuple([])).default([]),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(-10_000).max(10_000).default(0),
  position: z.number().int().min(0).max(100_000).default(0),
  caseSensitive: z.boolean().default(false),
  matchWholeWord: z.boolean().default(false),
  scanDepth: z.number().int().min(1).max(200).default(20),
  tokenBudget: z.number().int().min(1).max(8_192).default(400),
});
export const loreEntryPatchSchema = loreEntryInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one change is required.');
export const loreAttachmentSchema = z.object({ enabled: z.boolean().default(true) });
export const lorebookTransferSchema = z
  .object({
    format: z.literal('velora-lorebook'),
    version: z.literal(1),
    book: lorebookInputSchema,
    entries: z.array(loreEntryInputSchema).max(100),
  })
  .strict();
export const lorebookImportSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    transfer: lorebookTransferSchema,
  })
  .strict();

export type ConversationCreate = z.infer<typeof conversationCreateSchema>;
export type ConversationPatch = z.infer<typeof conversationPatchSchema>;
export type MessageCreate = z.infer<typeof messageCreateSchema>;
export type LorebookInput = z.infer<typeof lorebookInputSchema>;
export type LoreEntryInput = z.infer<typeof loreEntryInputSchema>;
export type LorebookTransfer = z.infer<typeof lorebookTransferSchema>;

export const reportTargetTypeSchema = z.enum([
  'CHARACTER',
  'AVATAR',
  'CREATOR',
  'GENERATED_MESSAGE',
  'USER_PROFILE',
]);
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;
export const reportReasonSchema = z.enum([
  'UNDERAGE',
  'SEXUAL_CONTENT_INVOLVING_MINORS',
  'ABUSE_HARASSMENT',
  'NON_CONSENSUAL_EXPLOITATIVE_MATERIAL',
  'ILLEGAL_CONTENT',
  'IMPERSONATION',
  'HATE',
  'SELF_HARM_CONCERN',
  'SPAM',
  'COPYRIGHT',
  'OTHER',
]);
export const reportInputSchema = z.object({
  targetType: reportTargetTypeSchema,
  targetId: z.uuid(),
  reason: reportReasonSchema,
  description: z.string().trim().max(2_000).default(''),
});
export const moderationActionSchema = z.object({
  action: z.enum([
    'NO_ACTION',
    'WARNING',
    'CONTENT_HIDE',
    'CONTENT_REMOVE',
    'TEMP_RESTRICTION',
    'ACCOUNT_SUSPEND',
    'ACCOUNT_BAN',
    'ESCALATE',
  ]),
  reason: z.string().trim().min(5).max(2_000),
});
export const appealInputSchema = z.object({
  caseId: z.uuid(),
  statement: z.string().trim().min(20).max(4_000),
});
export const appealDecisionSchema = z.object({
  decision: z.enum(['UPHELD', 'OVERTURNED']),
  reason: z.string().trim().min(5).max(2_000),
});

export const supportCategorySchema = z.enum(['GENERAL', 'TECHNICAL', 'PAYMENT', 'SAFETY', 'DATA']);
export const supportStateSchema = z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED']);
export const supportRequestInputSchema = z
  .object({
    category: supportCategorySchema,
    subject: z.string().trim().min(3).max(120),
    message: z.string().trim().min(20).max(4_000),
  })
  .strict();
export const supportRequestUpdateSchema = z
  .object({
    state: supportStateSchema,
    resolutionNote: z.string().trim().max(4_000).default(''),
  })
  .strict();
export type SupportCategory = z.infer<typeof supportCategorySchema>;
export type SupportState = z.infer<typeof supportStateSchema>;

export const userProfilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    bio: z.string().trim().max(1_000).default(''),
    avatarFileId: z.uuid().nullable().default(null),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  })
  .strict();
