import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    telegramId: text('telegram_id').notNull().unique(),
    username: text('username'),
    displayName: text('display_name').notNull(),
    locale: text('locale').notNull().default('ru'),
    role: text('role').notNull().default('USER'),
    ageGateAcceptedAt: integer('age_gate_accepted_at'),
    moderationState: text('moderation_state').notNull().default('ACTIVE'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (table) => [index('idx_users_moderation').on(table.moderationState, table.deletedAt)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    csrfHash: text('csrf_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (table) => [
    uniqueIndex('idx_sessions_token_hash').on(table.tokenHash),
    index('idx_sessions_user').on(table.userId, table.expiresAt),
  ],
);

export const authNonces = sqliteTable('auth_nonces', {
  initHash: text('init_hash').primaryKey(),
  expiresAt: integer('expires_at').notNull(),
});

export const personas = sqliteTable(
  'personas',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    avatarFileId: text('avatar_file_id'),
    shortDescription: text('short_description').notNull().default(''),
    longDescription: text('long_description').notNull().default(''),
    personality: text('personality').notNull().default(''),
    appearance: text('appearance').notNull().default(''),
    speakingStyle: text('speaking_style').notNull().default(''),
    background: text('background').notNull().default(''),
    pronouns: text('pronouns').notNull().default(''),
    representedAge: text('represented_age'),
    customNotes: text('custom_notes').notNull().default(''),
    visibility: text('visibility').notNull().default('PRIVATE'),
    isDefault: integer('is_default').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (table) => [index('idx_personas_user').on(table.userId, table.deletedAt)],
);

export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeVersionId: text('active_version_id'),
    avatarFileId: text('avatar_file_id'),
    avatarFocalX: real('avatar_focal_x').notNull().default(50),
    avatarFocalY: real('avatar_focal_y').notNull().default(50),
    personalityVisible: integer('personality_visible').notNull().default(0),
    visibility: text('visibility').notNull().default('PRIVATE'),
    publishState: text('publish_state').notNull().default('DRAFT'),
    contentRating: text('content_rating').notNull().default('SAFE'),
    language: text('language').notNull().default('ru'),
    languageCode: text('language_code').notNull().default('ru'),
    groupSize: text('group_size').notNull().default('single'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (table) => [
    index('idx_characters_discovery').on(table.publishState, table.visibility, table.updatedAt),
  ],
);

export const characterVersions = sqliteTable(
  'character_versions',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    tagline: text('tagline').notNull(),
    description: text('description').notNull(),
    personality: text('personality').notNull(),
    scenario: text('scenario').notNull().default(''),
    firstMessage: text('first_message').notNull(),
    exampleDialogues: text('example_dialogues').notNull().default(''),
    creatorNotes: text('creator_notes').notNull().default(''),
    speechStyle: text('speech_style').notNull().default(''),
    appearance: text('appearance').notNull().default(''),
    background: text('background').notNull().default(''),
    goals: text('goals').notNull().default(''),
    behaviourRules: text('behaviour_rules').notNull().default(''),
    systemInstructions: text('system_instructions').notNull().default(''),
    postHistoryInstructions: text('post_history_instructions').notNull().default(''),
    alternateGreetingsJson: text('alternate_greetings_json').notNull().default('[]'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_character_version').on(table.characterId, table.version)],
);

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id),
    characterVersionId: text('character_version_id')
      .notNull()
      .references(() => characterVersions.id),
    personaId: text('persona_id').references(() => personas.id),
    personaSnapshotJson: text('persona_snapshot_json'),
    title: text('title').notNull(),
    activeMessageId: text('active_leaf_message_id'),
    state: text('state').notNull().default('ACTIVE'),
    memoryStale: integer('memory_stale', { mode: 'boolean' }).notNull().default(false),
    memoryStaleSinceMessageId: text('memory_stale_since_message_id'),
    isPreview: integer('is_preview', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (table) => [index('idx_conversations_user').on(table.userId, table.updatedAt)],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    contentFormat: text('content_format').notNull().default('MARKDOWN'),
    status: text('status').notNull(),
    isGreeting: integer('is_greeting', { mode: 'boolean' }).notNull().default(false),
    editedByUser: integer('edited_by_user', { mode: 'boolean' }).notNull().default(false),
    origin: text('origin').notNull().default('LEGACY'),
    parentMessageId: text('parent_message_id'),
    generationGroupId: text('generation_group_id'),
    model: text('model'),
    provider: text('provider'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    editedAt: integer('edited_at'),
    deletedAt: integer('deleted_at'),
  },
  (table) => [
    index('idx_messages_branch').on(table.conversationId, table.parentMessageId, table.createdAt),
  ],
);

export const messageGenerations = sqliteTable(
  'message_generations',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    requestMessageId: text('request_message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    responseMessageId: text('response_message_id').references(() => messages.id),
    idempotencyKey: text('idempotency_key').notNull(),
    state: text('state').notNull(),
    attempt: integer('attempt').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at'),
    errorCode: text('error_code'),
  },
  (table) => [
    uniqueIndex('idx_message_generations_idempotency').on(
      table.conversationId,
      table.idempotencyKey,
    ),
  ],
);

export const messageGenerationReactions = sqliteTable(
  'message_generation_reactions',
  {
    generationId: text('generation_id')
      .notNull()
      .references(() => messageGenerations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reaction: text('reaction').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.generationId, table.userId] }),
    index('idx_message_generation_reactions_user').on(table.userId, table.updatedAt),
  ],
);

export const conversationMemory = sqliteTable('conversation_memory', {
  conversationId: text('conversation_id')
    .primaryKey()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  currentVersionId: text('current_version_id'),
  manualContext: text('manual_context').notNull().default(''),
  autoSummary: text('auto_summary').notNull().default(''),
  lastSummarizedMessageId: text('last_summarized_message_id').references(() => messages.id),
  updatedAt: integer('updated_at').notNull(),
});

export const memoryVersions = sqliteTable(
  'memory_versions',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    manualContext: text('manual_context').notNull().default(''),
    autoSummary: text('auto_summary').notNull().default(''),
    source: text('source').notNull(),
    fromMessageId: text('from_message_id').references(() => messages.id),
    toMessageId: text('to_message_id').references(() => messages.id),
    provider: text('provider'),
    model: text('model'),
    createdAt: integer('created_at').notNull(),
    createdBy: text('created_by').references(() => users.id),
    previousVersionId: text('previous_version_id'),
  },
  (table) => [index('idx_memory_versions_conversation').on(table.conversationId, table.createdAt)],
);

export const characterLikes = sqliteTable(
  'character_likes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.characterId] })],
);

export const characterBookmarks = sqliteTable(
  'character_bookmarks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.characterId] })],
);

export const characterReviews = sqliteTable(
  'character_reviews',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    reviewText: text('review_text').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.characterId] })],
);

export const featureFlags = sqliteTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: integer('enabled').notNull().default(0),
  rolloutPercent: integer('rollout_percent').notNull().default(0),
  configJson: text('config_json').notNull().default('{}'),
  updatedAt: integer('updated_at').notNull(),
  updatedBy: text('updated_by').references(() => users.id),
});

export const apiRateLimits = sqliteTable(
  'api_rate_limits',
  {
    scope: text('scope').notNull(),
    subjectHash: text('subject_hash').notNull(),
    windowStartedAt: integer('window_started_at').notNull(),
    count: integer('count').notNull().default(0),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.subjectHash, table.windowStartedAt] }),
    index('idx_api_rate_limits_expiry').on(table.expiresAt),
  ],
);

export const productEvents = sqliteTable(
  'product_events',
  {
    id: text('id').primaryKey(),
    sourceKey: text('source_key').unique(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventName: text('event_name').notNull(),
    routeGroup: text('route_group').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_product_events_time').on(table.eventName, table.createdAt),
    index('idx_product_events_user').on(table.userId, table.createdAt),
  ],
);

export const userBlocks = sqliteTable(
  'user_blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedUserId: text('blocked_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedUserId] }),
    index('idx_user_blocks_blocked').on(table.blockedUserId, table.blockerId),
  ],
);

export const accountDeletionRequests = sqliteTable(
  'account_deletion_requests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id),
    state: text('state').notNull(),
    requestedAt: integer('requested_at').notNull(),
    executeAfter: integer('execute_after').notNull(),
    cancelledAt: integer('cancelled_at'),
    completedAt: integer('completed_at'),
    attempts: integer('attempts').notNull().default(0),
    leaseExpiresAt: integer('lease_expires_at'),
    lastErrorCode: text('last_error_code'),
    retentionJson: text('retention_json').notNull().default('{}'),
  },
  (table) => [
    index('idx_account_deletion_due').on(table.state, table.executeAfter, table.leaseExpiresAt),
  ],
);
