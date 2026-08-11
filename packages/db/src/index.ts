import {
  index,
  integer,
  primaryKey,
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
    shortDescription: text('short_description').notNull().default(''),
    longDescription: text('long_description').notNull().default(''),
    pronouns: text('pronouns').notNull().default(''),
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
    visibility: text('visibility').notNull().default('PRIVATE'),
    publishState: text('publish_state').notNull().default('DRAFT'),
    contentRating: text('content_rating').notNull().default('SAFE'),
    language: text('language').notNull().default('ru'),
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
    definitionJson: text('definition_json').notNull(),
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
    title: text('title').notNull(),
    activeMessageId: text('active_message_id'),
    state: text('state').notNull().default('ACTIVE'),
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
    status: text('status').notNull(),
    parentMessageId: text('parent_message_id'),
    generationGroupId: text('generation_group_id'),
    model: text('model'),
    provider: text('provider'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    editedAt: integer('edited_at'),
    deletedAt: integer('deleted_at'),
  },
  (table) => [
    index('idx_messages_branch').on(table.conversationId, table.parentMessageId, table.createdAt),
  ],
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
