import {
  buildDeterministicSummary,
  composePersistentMemory,
  type MemoryMessage,
} from '@velora/memory';
import { asError, createId, nowMs } from '@velora/shared';

export type MemoryJobMode = 'INCREMENTAL' | 'FULL';

interface MemoryJobPayload {
  readonly conversationId: string;
  readonly userId: string;
  readonly mode: MemoryJobMode;
}

interface JobRow {
  readonly id: string;
  readonly payloadJson: string;
  readonly attempts: number;
  readonly maxAttempts: number;
}

interface MemoryStateRow {
  readonly currentVersionId: string | null;
  readonly lastSummarizedMessageId: string | null;
  readonly manualContext: string;
  readonly autoSummary: string;
  readonly activeMessageId: string | null;
}

interface BranchMessageRow {
  readonly id: string;
  readonly role: 'USER' | 'ASSISTANT' | 'INTERNAL';
  readonly content: string;
  readonly depth: number;
  readonly parentMessageId: string | null;
}

type ActiveBranchMessage = MemoryMessage & Pick<BranchMessageRow, 'depth' | 'parentMessageId'>;

export interface MemoryJobView {
  readonly id: string;
  readonly status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD';
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly availableAt: number;
  readonly lastErrorCode: string | null;
}

export interface MemoryJobRetryDecision {
  readonly status: 'FAILED' | 'DEAD';
  readonly delayMilliseconds: number;
}

export interface MemoryRegenerationPreview {
  readonly currentAutoSummary: string;
  readonly generatedAutoSummary: string;
  readonly manualContext: string;
  readonly fromMessageId: string | null;
  readonly toMessageId: string | null;
  readonly messageCount: number;
  readonly estimatedTokens: number;
  readonly provider: 'VELORA';
  readonly model: string;
}

const JOB_TYPE = 'SUMMARIZE_MEMORY';
const LEASE_MILLISECONDS = 30_000;
const BRANCH_PAGE_SIZE = 400;
const MAX_BRANCH_MESSAGES = 10_000;
export const AUTOMATIC_MEMORY_MESSAGE_THRESHOLD = 20;
export const AUTOMATIC_MEMORY_CHARACTER_THRESHOLD = 12_000;

export function shouldEnqueueAutomaticMemory(
  newMessageCount: number,
  newCharacterCount: number,
): boolean {
  if (
    !Number.isSafeInteger(newMessageCount) ||
    !Number.isSafeInteger(newCharacterCount) ||
    newMessageCount < 0 ||
    newCharacterCount < 0
  ) {
    throw new RangeError('Automatic memory counters must be non-negative safe integers.');
  }
  return (
    newMessageCount >= AUTOMATIC_MEMORY_MESSAGE_THRESHOLD ||
    newCharacterCount >= AUTOMATIC_MEMORY_CHARACTER_THRESHOLD
  );
}

export async function enqueueMemoryJob(
  database: D1Database,
  input: MemoryJobPayload & { readonly idempotencyKey: string },
): Promise<MemoryJobView> {
  const timestamp = nowMs();
  const normalizedKey = `memory:${input.userId}:${input.conversationId}:${input.mode}:${input.idempotencyKey}`;
  await database
    .prepare(
      `INSERT OR IGNORE INTO jobs
       (id, type, payload_json, status, idempotency_key, attempts, max_attempts,
        available_at, created_at, updated_at)
       VALUES (?, ?, ?, 'PENDING', ?, 0, 5, ?, ?, ?)`,
    )
    .bind(
      createId(),
      JOB_TYPE,
      JSON.stringify({
        conversationId: input.conversationId,
        userId: input.userId,
        mode: input.mode,
      } satisfies MemoryJobPayload),
      normalizedKey,
      timestamp,
      timestamp,
      timestamp,
    )
    .run();
  const row = await database
    .prepare(
      `SELECT id, status, attempts, max_attempts AS maxAttempts,
       available_at AS availableAt, last_error_code AS lastErrorCode
       FROM jobs WHERE idempotency_key = ?`,
    )
    .bind(normalizedKey)
    .first<MemoryJobView>();
  if (!row) throw new Error('MEMORY_JOB_ENQUEUE_FAILED');
  return row;
}

export async function readMemoryJob(
  database: D1Database,
  userId: string,
  conversationId: string,
  jobId: string,
): Promise<MemoryJobView | null> {
  return database
    .prepare(
      `SELECT id, status, attempts, max_attempts AS maxAttempts,
       available_at AS availableAt, last_error_code AS lastErrorCode
       FROM jobs WHERE id = ? AND type = ?
       AND json_extract(payload_json, '$.userId') = ?
       AND json_extract(payload_json, '$.conversationId') = ?`,
    )
    .bind(jobId, JOB_TYPE, userId, conversationId)
    .first<MemoryJobView>();
}

export async function enqueueAutomaticMemoryIfNeeded(
  database: D1Database,
  input: {
    readonly conversationId: string;
    readonly userId: string;
    readonly responseMessageId: string;
  },
): Promise<void> {
  const state = await readMemoryState(database, input.conversationId, input.userId);
  if (!state?.activeMessageId) return;
  const branch = await readActiveBranch(database, input.conversationId, state.activeMessageId);
  const coveredIndex = state.lastSummarizedMessageId
    ? branch.findIndex((message) => message.id === state.lastSummarizedMessageId)
    : -1;
  const newMessageCount = branch.length - coveredIndex - 1;
  const newCharacterCount = branch
    .slice(coveredIndex + 1)
    .reduce((total, message) => total + message.content.length, 0);
  if (!shouldEnqueueAutomaticMemory(newMessageCount, newCharacterCount)) return;
  await enqueueMemoryJob(database, {
    conversationId: input.conversationId,
    userId: input.userId,
    mode: 'INCREMENTAL',
    idempotencyKey: `automatic:${input.responseMessageId}`,
  });
}

export async function buildMemoryRegenerationPreview(
  database: D1Database,
  userId: string,
  conversationId: string,
): Promise<MemoryRegenerationPreview> {
  const state = await readMemoryState(database, conversationId, userId);
  if (!state?.activeMessageId) throw new Error('MEMORY_CONVERSATION_NOT_FOUND');
  const branch = await readActiveBranch(database, conversationId, state.activeMessageId);
  const summary = buildDeterministicSummary({ messages: branch, mode: 'FULL' });
  if (!summary.toMessageId) throw new Error('MEMORY_EMPTY_HISTORY');
  return {
    currentAutoSummary: state.autoSummary,
    generatedAutoSummary: summary.content,
    manualContext: state.manualContext,
    fromMessageId: summary.fromMessageId,
    toMessageId: summary.toMessageId,
    messageCount: summary.messageCount,
    estimatedTokens: summary.estimatedTokens,
    provider: 'VELORA',
    model: summary.model,
  };
}

export async function processDueMemoryJobs(database: D1Database, limit = 3): Promise<number> {
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const job = await claimDueJob(database);
    if (!job) break;
    try {
      await processClaimedJob(database, job);
    } catch (error) {
      const errorCode = memoryErrorCode(error);
      if (shouldCompleteMemoryJobWithoutRetry(errorCode)) {
        await completeClaimedJobWithoutOutput(database, job.id, errorCode);
      } else {
        await failClaimedJob(database, job, errorCode);
      }
    }
    processed += 1;
  }
  return processed;
}

export function shouldCompleteMemoryJobWithoutRetry(errorCode: string): boolean {
  // A user can delete or rewind the branch after requesting a summary. Retrying
  // an empty history cannot succeed and must not become an operational incident.
  return errorCode === 'MEMORY_EMPTY_HISTORY';
}

async function completeClaimedJobWithoutOutput(
  database: D1Database,
  jobId: string,
  reasonCode: string,
): Promise<void> {
  await database
    .prepare(
      `UPDATE jobs SET status = 'COMPLETED', lease_expires_at = NULL,
       last_error_code = ?, updated_at = ? WHERE id = ? AND status = 'PROCESSING'`,
    )
    .bind(reasonCode, nowMs(), jobId)
    .run();
}

async function claimDueJob(database: D1Database): Promise<JobRow | null> {
  const timestamp = nowMs();
  const candidate = await database
    .prepare(
      `SELECT id, payload_json AS payloadJson, attempts, max_attempts AS maxAttempts
       FROM jobs WHERE type = ? AND (
         (status IN ('PENDING', 'FAILED') AND available_at <= ?)
         OR (status = 'PROCESSING' AND lease_expires_at <= ?)
       ) ORDER BY available_at ASC, created_at ASC LIMIT 1`,
    )
    .bind(JOB_TYPE, timestamp, timestamp)
    .first<JobRow>();
  if (!candidate) return null;
  const claimed = await database
    .prepare(
      `UPDATE jobs SET status = 'PROCESSING', attempts = attempts + 1,
       lease_expires_at = ?, updated_at = ? WHERE id = ? AND (
         (status IN ('PENDING', 'FAILED') AND available_at <= ?)
         OR (status = 'PROCESSING' AND lease_expires_at <= ?)
       )`,
    )
    .bind(timestamp + LEASE_MILLISECONDS, timestamp, candidate.id, timestamp, timestamp)
    .run();
  if (claimed.meta.changes !== 1) return null;
  return { ...candidate, attempts: candidate.attempts + 1 };
}

async function processClaimedJob(database: D1Database, job: JobRow): Promise<void> {
  const payload = parsePayload(job.payloadJson);
  const state = await readMemoryState(database, payload.conversationId, payload.userId);
  if (!state?.activeMessageId) throw new Error('MEMORY_CONVERSATION_NOT_FOUND');
  const branch = await readActiveBranch(database, payload.conversationId, state.activeMessageId);
  if (
    payload.mode === 'INCREMENTAL' &&
    state.lastSummarizedMessageId &&
    !branch.some((message) => message.id === state.lastSummarizedMessageId)
  ) {
    throw new Error('MEMORY_BRANCH_CHANGED');
  }
  const coveredIndex = state.lastSummarizedMessageId
    ? branch.findIndex((message) => message.id === state.lastSummarizedMessageId)
    : -1;
  const messages = payload.mode === 'INCREMENTAL' ? branch.slice(coveredIndex + 1) : branch;
  const preservedMemory = payload.mode === 'INCREMENTAL' ? state.autoSummary : '';
  const summary = buildDeterministicSummary({
    messages,
    preservedMemory,
    mode: payload.mode,
  });
  if (!summary.toMessageId) throw new Error('MEMORY_EMPTY_HISTORY');
  const versionId = createId();
  const timestamp = nowMs();
  const content = composePersistentMemory(state.manualContext, summary.content);
  await database.batch([
    database
      .prepare(
        `INSERT INTO memory_versions
         (id, conversation_id, content, manual_context, auto_summary, source,
          from_message_id, to_message_id, provider, model, created_at, created_by,
          previous_version_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        versionId,
        payload.conversationId,
        content,
        state.manualContext,
        summary.content,
        payload.mode === 'FULL' ? 'FULL_REGENERATION' : 'AUTO_SUMMARY',
        summary.fromMessageId,
        summary.toMessageId,
        'VELORA',
        summary.model,
        timestamp,
        payload.userId,
        state.currentVersionId,
      ),
    database
      .prepare(
        `UPDATE conversation_memory SET current_version_id = ?, manual_context = ?,
         auto_summary = ?, last_summarized_message_id = ?, updated_at = ?
         WHERE conversation_id = ?`,
      )
      .bind(
        versionId,
        state.manualContext,
        summary.content,
        summary.toMessageId,
        timestamp,
        payload.conversationId,
      ),
    database
      .prepare(
        `UPDATE conversations SET
         memory_stale = CASE WHEN active_leaf_message_id = ? THEN 0 ELSE memory_stale END,
         memory_stale_since_message_id = CASE
           WHEN active_leaf_message_id = ? THEN NULL ELSE memory_stale_since_message_id END,
         updated_at = CASE WHEN active_leaf_message_id = ? THEN ? ELSE updated_at END
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      )
      .bind(
        summary.toMessageId,
        summary.toMessageId,
        summary.toMessageId,
        timestamp,
        payload.conversationId,
        payload.userId,
      ),
    database
      .prepare(
        `UPDATE jobs SET status = 'COMPLETED', lease_expires_at = NULL,
         last_error_code = NULL, updated_at = ? WHERE id = ? AND status = 'PROCESSING'`,
      )
      .bind(timestamp, job.id),
    database
      .prepare(
        `INSERT INTO product_events
         (id, source_key, user_id, event_name, route_group, created_at)
         SELECT ?, ?, ?, 'MEMORY_SUMMARIZED', 'memory', ?
         WHERE EXISTS (SELECT 1 FROM jobs WHERE id = ? AND status = 'COMPLETED')
         ON CONFLICT(source_key) DO NOTHING`,
      )
      .bind(createId(), `memory-job:${job.id}`, payload.userId, timestamp, job.id),
  ]);
}

async function failClaimedJob(database: D1Database, job: JobRow, errorCode: string): Promise<void> {
  const timestamp = nowMs();
  const retry = memoryJobRetryDecision(job.attempts, job.maxAttempts);
  await database
    .prepare(
      `UPDATE jobs SET status = ?, available_at = ?, lease_expires_at = NULL,
       last_error_code = ?, updated_at = ? WHERE id = ? AND status = 'PROCESSING'`,
    )
    .bind(retry.status, timestamp + retry.delayMilliseconds, errorCode, timestamp, job.id)
    .run();
}

export function memoryJobRetryDecision(
  attempts: number,
  maxAttempts: number,
): MemoryJobRetryDecision {
  if (
    !Number.isInteger(attempts) ||
    !Number.isInteger(maxAttempts) ||
    attempts < 1 ||
    maxAttempts < 1
  ) {
    throw new RangeError('Job attempts must be positive integers.');
  }
  return {
    status: attempts >= maxAttempts ? 'DEAD' : 'FAILED',
    delayMilliseconds: Math.min(3_600_000, 60_000 * 2 ** Math.max(0, attempts - 1)),
  };
}

async function readMemoryState(
  database: D1Database,
  conversationId: string,
  userId: string,
): Promise<MemoryStateRow | null> {
  return database
    .prepare(
      `SELECT cm.current_version_id AS currentVersionId,
       cm.last_summarized_message_id AS lastSummarizedMessageId,
       cm.manual_context AS manualContext, cm.auto_summary AS autoSummary,
       c.active_leaf_message_id AS activeMessageId
       FROM conversations c JOIN conversation_memory cm ON cm.conversation_id = c.id
       WHERE c.id = ? AND c.user_id = ? AND c.deleted_at IS NULL AND c.state != 'DELETED'`,
    )
    .bind(conversationId, userId)
    .first<MemoryStateRow>();
}

async function readActiveBranch(
  database: D1Database,
  conversationId: string,
  activeMessageId: string,
): Promise<readonly ActiveBranchMessage[]> {
  const newestToOldest: ActiveBranchMessage[] = [];
  let cursor: string | null = activeMessageId;
  let absoluteDepth = 0;
  while (cursor !== null) {
    const result: D1Result<BranchMessageRow> = await database
      .prepare(
        `WITH RECURSIVE branch(id, parentMessageId, role, content, status, depth) AS (
         SELECT id, parent_message_id, role, content, status, 0 FROM messages
         WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL
         UNION ALL
         SELECT m.id, m.parent_message_id, m.role, m.content, m.status, b.depth + 1
         FROM messages m JOIN branch b ON m.id = b.parentMessageId
         WHERE m.conversation_id = ? AND m.deleted_at IS NULL AND b.depth < ?
         ) SELECT id, parentMessageId, role, content, depth FROM branch ORDER BY depth ASC`,
      )
      .bind(cursor, conversationId, conversationId, BRANCH_PAGE_SIZE - 1)
      .all<BranchMessageRow>();
    if (result.results.length === 0) throw new Error('MEMORY_BRANCH_BROKEN');
    for (const message of result.results) {
      if (message.role === 'USER' || message.role === 'ASSISTANT') {
        if (message.content.length > 0) {
          newestToOldest.push({
            id: message.id,
            role: message.role,
            content: message.content,
            parentMessageId: message.parentMessageId,
            depth: absoluteDepth + message.depth,
          });
        }
      }
    }
    absoluteDepth += result.results.length;
    if (absoluteDepth > MAX_BRANCH_MESSAGES) throw new Error('MEMORY_HISTORY_TOO_DEEP');
    const oldest = result.results.at(-1);
    cursor = result.results.length === BRANCH_PAGE_SIZE ? (oldest?.parentMessageId ?? null) : null;
  }
  return newestToOldest.reverse();
}

function parsePayload(value: string): MemoryJobPayload {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new Error('MEMORY_JOB_PAYLOAD_INVALID');
  const conversationId = parsed['conversationId'];
  const userId = parsed['userId'];
  const mode = parsed['mode'];
  if (
    typeof conversationId !== 'string' ||
    typeof userId !== 'string' ||
    (mode !== 'INCREMENTAL' && mode !== 'FULL')
  ) {
    throw new Error('MEMORY_JOB_PAYLOAD_INVALID');
  }
  return { conversationId, userId, mode };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function memoryErrorCode(error: unknown): string {
  const message = asError(error).message;
  if (/manual memory/iu.test(message)) return 'MEMORY_MANUAL_TOO_LARGE';
  if (/^MEMORY_[A-Z_]+$/u.test(message)) return message;
  return 'MEMORY_JOB_FAILED';
}
