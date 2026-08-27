export interface AuthResponse {
  readonly user: { readonly id: string; readonly displayName: string; readonly role: string };
  readonly csrfToken: string;
}

export interface MeResponse {
  readonly id: string;
  readonly username: string | null;
  readonly displayName: string;
  readonly avatarFileId: string | null;
  readonly locale: 'ru' | 'en';
  readonly role: string;
  readonly moderationState: string;
  readonly ageGateAccepted: boolean;
  readonly onboardingCompleted: boolean;
  readonly plan: string;
  readonly planDisplayName: string;
  readonly planAccessUntil: number | null;
  readonly planEntitlements: {
    readonly rateLimitMultiplier: number;
    readonly characterLimit: number;
    readonly personaLimit: number;
    readonly memoryTokenBudget: number;
    readonly loreTokenBudget: number;
    readonly advancedOperationsDaily: number;
    readonly modelProfiles: readonly ('BALANCED' | 'CREATIVE' | 'PREMIUM')[];
  };
  readonly creditBalanceMicros: number;
}

export interface UserNotification {
  readonly id: string;
  readonly kind: 'WELCOME' | 'SYSTEM' | 'BILLING' | 'MODERATION';
  readonly title: string;
  readonly body: string;
  readonly actionTab:
    'discover' | 'chats' | 'characters' | 'billing' | 'settings' | 'profile' | null;
  readonly readAt: number | null;
  readonly createdAt: number;
}

export interface NotificationList {
  readonly items: readonly UserNotification[];
  readonly unreadCount: number;
}

export interface AccountDeletionStatus {
  readonly id: string;
  readonly state: 'PENDING' | 'PROCESSING' | 'CANCELLED' | 'COMPLETED' | 'FAILED';
  readonly requestedAt: number;
  readonly executeAfter: number;
  readonly cancellable: boolean;
}

export interface DataControls {
  readonly export: {
    readonly formatVersion: number;
    readonly resources: readonly string[];
    readonly counts: {
      readonly conversations: number;
      readonly characters: number;
      readonly lorebooks: number;
      readonly supportRequests: number;
    };
  };
  readonly deletion: AccountDeletionStatus | null;
  readonly gracePeriodDays: number;
  readonly retention: {
    readonly retained: readonly string[];
    readonly reason: string;
    readonly identity: string;
  };
}

export interface BlockedUser {
  readonly userId: string;
  readonly displayName: string;
  readonly username: string | null;
  readonly createdAt: number;
}

export interface CreditPack {
  readonly code: string;
  readonly displayName: string;
  readonly description: string;
  readonly starsAmount: number;
  readonly creditAmountMicros: number;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface BillingCatalog {
  readonly paymentsEnabled: boolean;
  readonly recurringPayments: false;
  readonly currency: 'XTR';
  readonly items: readonly CreditPack[];
}

export interface AccessPack {
  readonly code: string;
  readonly displayName: string;
  readonly description: string;
  readonly starsAmount: number;
  readonly planCode: string;
  readonly durationDays: number;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly recurring: false;
}

export interface AccessPackCatalog {
  readonly paymentsEnabled: boolean;
  readonly recurringPayments: false;
  readonly currency: 'XTR';
  readonly items: readonly AccessPack[];
}

export interface PlanDefinition {
  readonly id: string;
  readonly code: string;
  readonly displayName: string;
  readonly active: boolean;
  readonly rank: number;
  readonly entitlements: MeResponse['planEntitlements'];
}

export interface PlanCatalog {
  readonly items: readonly PlanDefinition[];
}

export interface OwnerUserGrant {
  readonly id: string;
  readonly target: {
    readonly id: string;
    readonly telegramId: string;
    readonly displayName: string;
  };
  readonly planCode: string | null;
  readonly durationDays: number | null;
  readonly creditAmountMicros: number;
  readonly reason: string;
  readonly createdAt: number;
  readonly accessStartsAt: number | null;
  readonly accessExpiresAt: number | null;
  readonly accessRevokedAt: number | null;
  readonly alreadyApplied?: boolean;
}

export interface PaymentInvoice {
  readonly id: string;
  readonly kind: 'CREDITS' | 'PLAN_ACCESS';
  readonly packCode: string;
  readonly starsAmount: number;
  readonly creditAmountMicros: number | null;
  readonly planCode: string | null;
  readonly accessDurationDays: number | null;
  readonly state: string;
  readonly invoiceUrl: string;
  readonly recurring: false;
  readonly createdAt: number;
}

export interface PaymentHistoryItem {
  readonly id: string;
  readonly packCode: string | null;
  readonly accessPackCode: string | null;
  readonly planCode: string | null;
  readonly accessDurationDays: number | null;
  readonly amount: number;
  readonly creditAmountMicros: number | null;
  readonly state:
    | 'CREATED'
    | 'INVOICE_SENT'
    | 'PENDING'
    | 'PAID'
    | 'GRANTED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'REFUNDED';
  readonly createdAt: number;
  readonly paidAt: number | null;
  readonly validUntil: number | null;
  readonly autoRenew: false;
}

export interface OwnerPayment {
  readonly id: string;
  readonly target: {
    readonly id: string;
    readonly telegramId: string;
    readonly displayName: string;
  };
  readonly starsAmount: number;
  readonly state: string;
  readonly kind: 'CREDITS' | 'PLAN_ACCESS';
  readonly packCode: string | null;
  readonly planCode: string | null;
  readonly creditAmountMicros: number | null;
  readonly createdAt: number;
  readonly paidAt: number | null;
  readonly refund: {
    readonly id: string;
    readonly state: 'CLAIMED' | 'SUBMITTED' | 'CONFIRMED' | 'UNKNOWN';
    readonly reason: string;
    readonly updatedAt: number;
  } | null;
}

export interface Persona {
  readonly id: string;
  readonly name: string;
  readonly avatarFileId: string | null;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly personality: string;
  readonly personalityVisible?: boolean;
  readonly appearance: string;
  readonly speakingStyle: string;
  readonly background: string;
  readonly pronouns: string;
  readonly representedAge: string | null;
  readonly customNotes: string;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly isDefault: boolean;
  readonly updatedAt: number;
}

export interface Character {
  readonly id: string;
  readonly avatarFileId: string | null;
  readonly avatarFocalX: number;
  readonly avatarFocalY: number;
  readonly visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  readonly publishState: 'DRAFT' | 'MODERATION_PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN';
  readonly contentRating: 'SAFE' | 'MATURE';
  readonly language: CharacterLanguageCode;
  readonly groupSize: CharacterGroupSize;
  readonly version: number;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly personality: string;
  readonly personalityVisible?: boolean;
  readonly scenario: string;
  readonly firstMessage: string;
  readonly exampleDialogues: string;
  readonly creatorNotes: string;
  readonly speechStyle: string;
  readonly appearance: string;
  readonly background: string;
  readonly goals: string;
  readonly behaviourRules: string;
  readonly systemInstructions: string;
  readonly postHistoryInstructions: string;
  readonly alternateGreetings: readonly string[];
  readonly tags: readonly string[];
  readonly updatedAt: number;
}

export interface DiscoveryCharacter {
  readonly id: string;
  readonly avatarFileId: string | null;
  readonly avatarFocalX: number;
  readonly avatarFocalY: number;
  readonly contentRating: 'SAFE' | 'MATURE';
  readonly language: CharacterLanguageCode;
  readonly groupSize: CharacterGroupSize;
  readonly updatedAt: number;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly personality?: string | null;
  readonly firstMessage: string;
  readonly alternateGreetings: readonly string[];
  readonly creatorId: string;
  readonly creatorName: string;
  readonly creatorRole: string;
  readonly avatarBotUsername: string | null;
  readonly likeCount: number;
  readonly bookmarkCount: number;
  readonly reviewCount: number;
  readonly averageRating: number | null;
  readonly liked: boolean;
  readonly bookmarked: boolean;
  readonly myRating: number | null;
  readonly myReviewText: string | null;
  readonly tags: readonly string[];
}

export interface CharacterReview {
  readonly userId: string;
  readonly displayName: string;
  readonly rating: number;
  readonly reviewText: string;
  readonly updatedAt: number;
}

export interface CreatorStats {
  readonly characterCount: number;
  readonly publishedCount: number;
  readonly chatsStarted: number;
  readonly likes: number;
  readonly bookmarks: number;
  readonly reviews: number;
  readonly averageRating: number | null;
}

export interface PublicFeatureFlags {
  readonly flags: {
    readonly advanced_memory: boolean;
    readonly new_model: boolean;
    readonly public_reviews: boolean;
    readonly experimental_renderer: boolean;
    readonly groups: boolean;
  };
}

export interface AdminFeatureFlag {
  readonly key: keyof PublicFeatureFlags['flags'];
  readonly enabled: boolean;
  readonly rolloutPercent: number;
  readonly config: Readonly<Record<string, unknown>>;
  readonly updatedAt: number;
  readonly updatedBy: string | null;
}

export interface StaffAssignment {
  readonly id: string;
  readonly userId: string;
  readonly telegramId: string;
  readonly username: string | null;
  readonly displayName: string;
  readonly role: 'MODERATOR' | 'SENIOR_MODERATOR';
  readonly assignedBy: string;
  readonly assignedAt: number;
}

export interface OperationsDashboard {
  readonly users: number;
  readonly activeUsers24h: number;
  readonly messages24h: number;
  readonly aiRequests24h: number;
  readonly failedGenerations24h: number;
  readonly aiCostMicros24h: number;
  readonly paymentFailures24h: number;
  readonly moderationBacklog: number;
  readonly jobBacklog: number;
  readonly productEvents24h: number;
  readonly jobsCreated24h: number;
  readonly mediaObjectsCreated24h: number;
  readonly mediaBytesCreated24h: number;
  readonly mediaBytesTotal: number;
  readonly providerLastSuccessAt: number | null;
  readonly providerLastFailureAt: number | null;
  readonly ownerAiUsage: OwnerAiUsage | null;
  readonly planDistribution: Readonly<Record<string, number>>;
  readonly capacityProjection: CloudflareCapacityProjection;
  readonly generatedAt: number;
}

export interface OwnerAiUsage {
  readonly daily: AiUsageWindow;
  readonly weekly: AiUsageWindow;
  readonly lifetime: AiUsageWindow;
  readonly perModelWeekly: readonly (AiUsageWindow & { readonly model: string })[];
  readonly configuredBudgetMicros: {
    readonly daily: number;
    readonly monthly: number;
    readonly lifetime: number;
    readonly remainingLifetime: number;
  };
  readonly capsBalance: {
    readonly estimatedRemainingCaps: null;
    readonly status: 'PROVIDER_BALANCE_API_UNAVAILABLE';
  };
}

export interface AiUsageWindow {
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicros: number;
}

export interface CloudflareCapacityProjection {
  readonly safetyMarginPercent: number;
  readonly basisWindowHours: number;
  readonly metrics: readonly CloudflareCapacityMetric[];
  readonly exceedsFreePlan: boolean;
  readonly automaticUpgradeEnabled: false;
  readonly runtimePolicy: {
    readonly status: 'OK' | 'WARNING' | 'CRITICAL' | 'EMERGENCY' | 'EXCEEDED';
    readonly analyticsEnabled: boolean;
    readonly cacheTtlMultiplier: 1 | 2 | 3 | 6;
    readonly backgroundJobsEnabled: boolean;
    readonly coreChatEnabled: true;
  };
}

export interface CloudflareCapacityMetric {
  readonly key:
    | 'workerRequests'
    | 'd1RowsRead'
    | 'd1RowsWritten'
    | 'queueOperations'
    | 'r2Storage'
    | 'r2ClassAOperations'
    | 'r2ClassBOperations';
  readonly period: 'DAY' | 'MONTH' | 'TOTAL';
  readonly projected: number;
  readonly freeLimit: number;
  readonly utilizationPercent: number;
  readonly status: 'OK' | 'WARNING' | 'CRITICAL' | 'EMERGENCY' | 'EXCEEDED';
}

export interface AiSmokeRun {
  readonly runKey: string;
  readonly provider: 'BOTHUB';
  readonly model: string;
  readonly state: 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly protocolVariant: 'OPENAI_INCLUDE_USAGE' | 'BOTHUB_DOCUMENTED';
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly providerReportedCostMicros: number;
  readonly conservativeCostMicros: number;
  readonly latencyMs: number | null;
  readonly outputLength: number;
  readonly errorCode: string | null;
  readonly httpStatus: number | null;
  readonly responseStarted: boolean;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly alreadyAttempted: boolean;
  readonly output?: string;
}

export interface BotHubModelCapabilities {
  readonly availableCandidates: readonly string[];
  readonly selectedModel: string | null;
  readonly checkedAt: number;
}

export interface RoleplayModelEvalCatalogItem {
  readonly modelProfileId: string;
  readonly displayName: string;
  readonly providerModelId: string;
  readonly tier: 'free' | 'standard' | 'premium';
  readonly enabled: boolean;
}

export interface RoleplayModelEvalRun {
  readonly runKey: string;
  readonly modelProfileId: string;
  readonly displayName: string;
  readonly provider: 'BOTHUB';
  readonly model: string;
  readonly state: 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly providerReportedCostMicros: number;
  readonly conservativeCostMicros: number;
  readonly latencyMs: number | null;
  readonly outputLength: number;
  readonly errorCode: string | null;
  readonly httpStatus: number | null;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly alreadyAttempted: boolean;
}

export type RoleplayBenchmarkCriterion =
  | 'character_adherence'
  | 'persona_adherence'
  | 'narrative_quality'
  | 'russian_quality'
  | 'english_quality'
  | 'emotional_continuity'
  | 'memory_use'
  | 'lore_use'
  | 'formatting'
  | 'repetition_control'
  | 'verbosity_control'
  | 'latency'
  | 'cost'
  | 'consensual_mature_fictional_compatibility';

export interface RoleplayBenchmarkSample {
  readonly scenarioId: string;
  readonly output: string;
  readonly outputSha256: string;
  readonly outputLength: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly conservativeCostMicros: number;
  readonly latencyMs: number;
}

export interface RoleplayBenchmarkRun {
  readonly runKey: string;
  readonly benchmarkVersion: string;
  readonly modelProfileId: string;
  readonly providerModelId: string;
  readonly state: 'RUNNING' | 'AWAITING_REVIEW' | 'APPROVED' | 'REJECTED' | 'FAILED';
  readonly scenarioCount: number;
  readonly completedScenarioCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly conservativeCostMicros: number;
  readonly latencyMs: number | null;
  readonly errorCode: string | null;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly reviewedAt: number | null;
  readonly alreadyAttempted: boolean;
  readonly samples?: readonly RoleplayBenchmarkSample[];
  readonly scores?: Readonly<Record<RoleplayBenchmarkCriterion, number>>;
}

export interface RoleplayModelControlHealth {
  readonly windowHours: 24;
  readonly requestCount: number;
  readonly successRatePercent: number | null;
  readonly failureRatePercent: number | null;
  readonly averageLatencyMs: number | null;
  readonly averageTtftMs: number | null;
  readonly recentErrors: readonly {
    readonly errorCode: string;
    readonly completedAt: number | null;
  }[];
}

export interface RoleplayModelControlItem {
  readonly modelProfileId: string;
  readonly displayName: string;
  readonly descriptionRu: string;
  readonly tier: 'free' | 'standard' | 'premium';
  readonly enabled: boolean;
  readonly fallbackIds: readonly string[];
  readonly updatedAt: number | null;
  readonly updatedBy: string | null;
  readonly health: RoleplayModelControlHealth;
}

export interface RoleplayModelControls {
  readonly defaultModelProfileId: string;
  readonly items: readonly RoleplayModelControlItem[];
}

export interface ModerationCaseSummary {
  readonly id: string;
  readonly reportId: string | null;
  readonly targetType: string;
  readonly targetId: string;
  readonly priority: number;
  readonly state: string;
  readonly assignedTo: string | null;
  readonly reason: string | null;
  readonly description: string | null;
  readonly createdAt: number;
}

export interface ModerationCaseDetail extends ModerationCaseSummary {
  readonly report: Readonly<Record<string, unknown>> | null;
  readonly evidence: Readonly<Record<string, unknown>> | null;
  readonly actions: readonly Readonly<Record<string, unknown>>[];
  readonly appeals: readonly Readonly<Record<string, unknown>>[];
  readonly audit: readonly Readonly<Record<string, unknown>>[];
}

export interface Settings {
  readonly theme: 'dark' | 'amoled' | 'light';
  readonly locale: 'ru' | 'en';
  readonly defaultPersonaId: string | null;
  readonly generationProfile: 'BALANCED' | 'CREATIVE' | 'PREMIUM';
  readonly nsfwVisible: boolean;
  readonly safeSearch: boolean;
  readonly matureImageBlur: boolean;
  readonly preferences: Readonly<Record<string, unknown>>;
}

export type SupportCategory = 'GENERAL' | 'TECHNICAL' | 'PAYMENT' | 'SAFETY' | 'DATA';
export type SupportState = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';

export interface SupportRequest {
  readonly id: string;
  readonly userId: string;
  readonly category: SupportCategory;
  readonly subject: string;
  readonly message: string;
  readonly state: SupportState;
  readonly resolutionNote: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly resolvedAt: number | null;
}

export interface MediaFile {
  readonly id: string;
  readonly mimeType: string;
  readonly originalName: string | null;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly moderationState: 'PENDING' | 'APPROVED' | 'REJECTED';
  readonly contentUrl: string;
}

export interface MediaLibraryResponse {
  readonly items: readonly MediaFile[];
  readonly capabilities: {
    readonly directUpload: boolean;
    readonly acceptedMimeTypes: readonly string[];
    readonly maxBytes: number;
    readonly maxOutputDimension: number;
  };
}

export interface UserProfile {
  readonly userId: string;
  readonly username: string | null;
  readonly displayName: string;
  readonly bio: string;
  readonly avatarFileId: string | null;
  readonly avatarPending: boolean;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly role: string;
  readonly isOwn: boolean;
  readonly stats: {
    readonly characters: number;
    readonly likes: number;
    readonly chats: number;
  };
  readonly characters: readonly {
    readonly id: string;
    readonly avatarFileId: string | null;
    readonly avatarFocalX: number;
    readonly avatarFocalY: number;
    readonly name: string;
    readonly tagline: string;
    readonly contentRating: 'SAFE' | 'MATURE';
    readonly updatedAt: number;
  }[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConversationSummary {
  readonly id: string;
  readonly characterId: string;
  readonly personaId: string | null;
  readonly title: string;
  readonly activeMessageId: string | null;
  readonly state: 'ACTIVE' | 'ARCHIVED';
  readonly isPreview: boolean;
  readonly memoryStale: boolean;
  readonly characterName: string;
  readonly characterAvatarFileId: string | null;
  readonly characterAvatarFocalX: number;
  readonly characterAvatarFocalY: number;
  readonly personaName: string | null;
  readonly lastMessage: string | null;
  readonly messageCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ChatCharacterProfile {
  readonly id: string;
  readonly avatarFileId: string | null;
  readonly avatarFocalX: number;
  readonly avatarFocalY: number;
  readonly contentRating: 'SAFE' | 'MATURE';
  readonly language: string;
  readonly groupSize: string;
  readonly visibility: string;
  readonly publishState: string;
  readonly updatedAt: number;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly personality: string | null;
  readonly firstMessage: string;
  readonly alternateGreetings: readonly string[];
  readonly creatorId: string;
  readonly creatorName: string;
  readonly creatorRole: string;
  readonly avatarBotUsername: string | null;
  readonly likeCount: number;
  readonly bookmarkCount: number;
  readonly reviewCount: number;
  readonly averageRating: number | null;
  readonly liked: boolean;
  readonly bookmarked: boolean;
  readonly tags: readonly string[];
  readonly isOwner: boolean;
  readonly interactable: boolean;
  readonly estimatedTokens: number;
}

export interface ConversationSettings {
  readonly modelProfile: 'BALANCED' | 'CREATIVE' | 'PREMIUM';
  readonly modelProfileId: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly responseLength: 'SHORT' | 'MEDIUM' | 'DETAILED' | 'LONG';
  readonly customInstructions: string;
  readonly personaMode: 'SNAPSHOT' | 'LIVE';
}

export interface RoleplayModelCatalogItem {
  readonly id: string;
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
  readonly tier: 'free' | 'standard' | 'premium';
  readonly experimental: boolean;
  readonly supportsStreaming: boolean;
  readonly available: boolean;
  readonly allowed: boolean;
}

export interface RoleplayModelCatalog {
  readonly selectedProviderCatalogCheckedAt: number | null;
  readonly items: readonly RoleplayModelCatalogItem[];
}

export interface ConversationDetail extends ConversationSummary {
  readonly character: {
    readonly name: string;
    readonly tagline: string;
    readonly avatarFileId: string | null;
    readonly avatarFocalX: number;
    readonly avatarFocalY: number;
    readonly contentRating: 'SAFE' | 'MATURE';
  };
  readonly settings: ConversationSettings;
  readonly group: {
    readonly id: string;
    readonly name: string;
    readonly avatarFileId: string | null;
    readonly routingMode: 'CONTEXTUAL' | 'MANUAL';
    readonly activeCharacterId: string;
    readonly members: readonly {
      readonly characterId: string;
      readonly position: number;
      readonly name: string;
      readonly tagline: string;
      readonly avatarFileId: string | null;
      readonly avatarFocalX: number;
      readonly avatarFocalY: number;
    }[];
  } | null;
  readonly promptInspectorAvailable: boolean;
}

export interface PromptInspectorResponse {
  readonly selectedModel: {
    readonly profileId: string;
    readonly providerModelId: string;
  };
  readonly character: {
    readonly name: string;
    readonly description: string;
    readonly personality: string;
    readonly scenario: string;
    readonly speechStyle: string;
    readonly appearance: string;
    readonly background: string;
    readonly goals: string;
    readonly behaviourRules: string;
    readonly systemInstructions: string;
    readonly postHistoryInstructions: string;
    readonly exampleDialogues: string;
  };
  readonly persona: Readonly<Record<string, string | null>> | null;
  readonly memory: string;
  readonly lore: readonly {
    readonly id: string;
    readonly title: string;
    readonly content: string;
  }[];
  readonly chatInstructions: string;
  readonly recentMessages: readonly {
    readonly role: 'USER' | 'ASSISTANT';
    readonly content: string;
  }[];
  readonly tokenEstimates: Readonly<Record<string, number>>;
  readonly includedLoreEntries: readonly string[];
  readonly includedExampleMessages: number;
  readonly droppedExampleMessages: number;
  readonly droppedHistoryMessages: number;
  readonly unknownTemplateVariables: readonly string[];
}

export interface ConversationMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: 'USER' | 'ASSISTANT' | 'INTERNAL';
  readonly content: string;
  readonly contentFormat: 'PLAIN_TEXT' | 'MARKDOWN';
  readonly status:
    'PENDING' | 'STREAMING' | 'COMPLETED' | 'STOPPED' | 'FAILED' | 'DELETED' | 'MODERATED';
  readonly isGreeting: boolean;
  readonly editedByUser: boolean;
  readonly origin:
    'LEGACY' | 'USER_INPUT' | 'CHARACTER_GREETING' | 'AI_GENERATION' | 'USER_EDIT' | 'INTERNAL';
  readonly parentMessageId: string | null;
  readonly generationGroupId: string | null;
  readonly generationId: string | null;
  readonly reaction: 'POSITIVE' | 'NEGATIVE' | 'EXCEPTIONAL' | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly editedAt: number | null;
  readonly variantIndex: number;
  readonly variantCount: number;
  readonly variantIds: readonly string[];
}

export interface MemoryVersion {
  readonly id: string;
  readonly content: string;
  readonly manualContext: string;
  readonly autoSummary: string;
  readonly sourceType: 'AUTO_SUMMARY' | 'FULL_REGENERATION' | 'MANUAL_EDIT' | 'RESTORE';
  readonly fromMessageId: string | null;
  readonly toMessageId: string | null;
  readonly createdAt: number;
  readonly provider: string | null;
  readonly model: string | null;
  readonly previousVersionId: string | null;
}

export interface MemoryJob {
  readonly id: string;
  readonly status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD';
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly availableAt: number;
  readonly lastErrorCode: string | null;
}

export interface ConversationMemory {
  readonly active: MemoryVersion | null;
  readonly manualContext: string;
  readonly autoSummary: string;
  readonly stale: boolean;
  readonly staleSinceMessageId: string | null;
  readonly lastSummarizedMessageId: string | null;
  readonly estimatedTokens: number;
  readonly pendingJob: MemoryJob | null;
}

export interface MemoryRegenerationPreview {
  readonly currentAutoSummary: string;
  readonly generatedAutoSummary: string;
  readonly manualContext: string;
  readonly fromMessageId: string | null;
  readonly toMessageId: string | null;
  readonly messageCount: number;
  readonly estimatedTokens: number;
  readonly provider: string;
  readonly model: string;
}

export interface LoreEntry {
  readonly id: string;
  readonly lorebookId: string;
  readonly title: string;
  readonly content: string;
  readonly keys: readonly string[];
  readonly secondaryKeys: readonly string[];
  readonly enabled: boolean;
  readonly priority: number;
  readonly position: number;
  readonly caseSensitive: boolean;
  readonly matchWholeWord: boolean;
  readonly scanDepth: number;
  readonly tokenBudget: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface Lorebook {
  readonly id: string;
  readonly ownerId: string;
  readonly coverMediaFileId: string | null;
  readonly name: string;
  readonly description: string;
  readonly visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  readonly entryCount?: number;
  readonly entries?: readonly LoreEntry[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LorebookTransfer {
  readonly format: 'velora-lorebook';
  readonly version: 1;
  readonly book: Pick<Lorebook, 'name' | 'description' | 'visibility'>;
  readonly entries: readonly Omit<LoreEntry, 'id' | 'lorebookId' | 'createdAt' | 'updatedAt'>[];
}
import type { CharacterGroupSize, CharacterLanguageCode } from '@velora/shared';
