import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const toolkitDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(toolkitDir);
const apiRoot = path.join(projectRoot, 'apps', 'api');
const persistenceRoot = mkdtempSync(path.join(tmpdir(), 'velora-api-test-'));
function cleanupPersistenceRoot() {
  try {
    rmSync(persistenceRoot, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      ['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(String(error.code))
    ) {
      return false;
    }
    throw error;
  }
}
process.once('exit', () => {
  try {
    cleanupPersistenceRoot();
  } catch {
    // Best effort only during process teardown; normal cleanup awaits child shutdown below.
  }
});
const wranglerEntry = path.join(apiRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const port = 8791;
const baseUrl = `http://127.0.0.1:${port}`;
const providerPort = 8792;
const signingKey = `integration-signing-${randomUUID()}`;
const sessionToken = `session-${randomUUID()}`;
const csrfToken = `csrf-${randomUUID()}`;
const userId = randomUUID();
const sessionId = randomUUID();
const reporterId = randomUUID();
const reporterSessionId = randomUUID();
const reporterSessionToken = `reporter-session-${randomUUID()}`;
const reporterCsrfToken = `reporter-csrf-${randomUUID()}`;
const adminId = randomUUID();
const adminSessionId = randomUUID();
const adminSessionToken = `admin-session-${randomUUID()}`;
const adminCsrfToken = `admin-csrf-${randomUUID()}`;
const ownerId = randomUUID();
const ownerSessionId = randomUUID();
const ownerSessionToken = `owner-session-${randomUUID()}`;
const ownerCsrfToken = `owner-csrf-${randomUUID()}`;
const deletionUserId = randomUUID();
const deletionSessionId = randomUUID();
const deletionSessionToken = `deletion-session-${randomUUID()}`;
const deletionCsrfToken = `deletion-csrf-${randomUUID()}`;
const ownerPackCode = `owner-${randomUUID().slice(0, 12)}`;
const accessPackCode = `plus-${randomUUID().slice(0, 12)}`;
const mediaId = randomUUID();
const opaqueCharacterId = 'seed-character-integration';
const opaqueCharacterVersionId = 'seed-character-version-integration';
const characterName = 'Мира';
const matureCharacterName = `Ночная история ${randomUUID()}`;
const telegramId = String(8_000_000_000 + Math.floor(Math.random() * 999_999_999));
const firstRunTelegramId = String(Number(telegramId) + 10_000);
const now = Date.now();
const telegramRequests = [];
const aiRequests = [];
let aiSmokeRequests = 0;
let modelEvalRequests = 0;
let benchmarkRequests = 0;
let requiredAiModelAvailable = true;
let creativeTransientAttempts = 0;
const telegramConfigurationMutations = [];
let aiHealthChecks = 0;
let configuredWebhook = { url: '', allowed_updates: [] };
const configuredCommands = new Map();
let configuredMenu = { type: 'default' };
let configuredDescription = '';
let configuredShortDescription = '';

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function signTelegramInitData(user, token) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `integration-first-run-${randomUUID()}`,
    user: JSON.stringify(user),
  });
  const checkString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(checkString).digest('hex'));
  return params.toString();
}

function respondJson(response, payload, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function runWrangler(argumentsList) {
  const result = spawnSync(
    process.execPath,
    [wranglerEntry, ...argumentsList, '--persist-to', persistenceRoot],
    {
      cwd: apiRoot,
      encoding: 'utf8',
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stdout.write(result.stdout);
    process.exit(result.status ?? 1);
  }
  return `${result.stdout}\n${result.stderr}`;
}

function localR2ObjectStatus(objectPath) {
  return spawnSync(
    process.execPath,
    [
      wranglerEntry,
      'r2',
      'object',
      'get',
      objectPath,
      '--local',
      '--env',
      'local',
      '--pipe',
      '--persist-to',
      persistenceRoot,
    ],
    { cwd: apiRoot, encoding: 'buffer', shell: false },
  ).status;
}

runWrangler(['d1', 'migrations', 'apply', 'velora-local', '--local', '--env', 'local']);
const setupSql = `
  INSERT INTO users (id, telegram_id, display_name, locale, role, moderation_state, created_at, updated_at, last_seen_at)
  VALUES ('${userId}', '${telegramId}', 'Integration User', 'ru', 'USER', 'ACTIVE', ${now}, ${now}, ${now});
  INSERT INTO user_settings (user_id, updated_at) VALUES ('${userId}', ${now});
  INSERT INTO sessions (id, user_id, token_hash, csrf_hash, created_at, expires_at)
  VALUES ('${sessionId}', '${userId}', '${hash(`${signingKey}:${sessionToken}`)}', '${hash(`${signingKey}:${csrfToken}`)}', ${now}, ${now + 600_000});
  INSERT INTO users (id, telegram_id, display_name, locale, role, moderation_state, created_at, updated_at, last_seen_at)
  VALUES ('${reporterId}', '${Number(telegramId) + 1}', 'Reporting User', 'ru', 'USER', 'ACTIVE', ${now}, ${now}, ${now});
  INSERT INTO user_settings (user_id, updated_at) VALUES ('${reporterId}', ${now});
  INSERT INTO sessions (id, user_id, token_hash, csrf_hash, created_at, expires_at)
  VALUES ('${reporterSessionId}', '${reporterId}', '${hash(`${signingKey}:${reporterSessionToken}`)}', '${hash(`${signingKey}:${reporterCsrfToken}`)}', ${now}, ${now + 600_000});
  INSERT INTO users (id, telegram_id, display_name, locale, role, moderation_state, created_at, updated_at, last_seen_at)
  VALUES ('${adminId}', '${Number(telegramId) + 2}', 'Integration Admin', 'ru', 'ADMIN', 'ACTIVE', ${now}, ${now}, ${now});
  INSERT INTO user_settings (user_id, updated_at) VALUES ('${adminId}', ${now});
  INSERT INTO sessions (id, user_id, token_hash, csrf_hash, created_at, expires_at)
  VALUES ('${adminSessionId}', '${adminId}', '${hash(`${signingKey}:${adminSessionToken}`)}', '${hash(`${signingKey}:${adminCsrfToken}`)}', ${now}, ${now + 600_000});
  INSERT INTO users (id, telegram_id, display_name, locale, role, moderation_state, created_at, updated_at, last_seen_at)
  VALUES ('${ownerId}', '${Number(telegramId) + 3}', 'Integration Owner', 'ru', 'OWNER', 'ACTIVE', ${now}, ${now}, ${now});
  INSERT INTO user_settings (user_id, updated_at) VALUES ('${ownerId}', ${now});
  INSERT INTO sessions (id, user_id, token_hash, csrf_hash, created_at, expires_at)
  VALUES ('${ownerSessionId}', '${ownerId}', '${hash(`${signingKey}:${ownerSessionToken}`)}', '${hash(`${signingKey}:${ownerCsrfToken}`)}', ${now}, ${now + 600_000});
  INSERT INTO users (id, telegram_id, display_name, locale, role, moderation_state, created_at, updated_at, last_seen_at)
  VALUES ('${deletionUserId}', '${Number(telegramId) + 4}', 'Deletion Fixture', 'ru', 'USER', 'ACTIVE', ${now}, ${now}, ${now});
  INSERT INTO user_settings (user_id, updated_at) VALUES ('${deletionUserId}', ${now});
  INSERT INTO onboarding_completions
    (user_id, idempotency_key, persona_id, mature_enabled, policy_accepted_at, completed_at)
  VALUES ('${deletionUserId}', '${randomUUID()}', NULL, 0, ${now}, ${now});
  INSERT INTO sessions (id, user_id, token_hash, csrf_hash, created_at, expires_at)
  VALUES ('${deletionSessionId}', '${deletionUserId}', '${hash(`${signingKey}:${deletionSessionToken}`)}', '${hash(`${signingKey}:${deletionCsrfToken}`)}', ${now}, ${now + 600_000});
  INSERT INTO personas (id, user_id, name, created_at, updated_at)
  VALUES ('${randomUUID()}', '${deletionUserId}', 'Disposable persona', ${now}, ${now});
  INSERT INTO credit_accounts (user_id, updated_at)
  VALUES ('${deletionUserId}', ${now});
  INSERT INTO credit_transactions
    (id, user_id, type, amount_micros, idempotency_key, metadata_json, created_at)
  VALUES ('${randomUUID()}', '${deletionUserId}', 'BONUS', 250000,
    'deletion-retention-${randomUUID()}', '{}', ${now});
  INSERT INTO account_deletion_requests
    (id, user_id, state, requested_at, execute_after, retention_json)
  VALUES ('${randomUUID()}', '${deletionUserId}', 'PENDING', ${now - 1}, 0, '{}');
  INSERT INTO support_requests
    (id, user_id, category, subject, message, state, created_at, updated_at)
  VALUES ('${randomUUID()}', '${deletionUserId}', 'DATA', 'Disposable request',
    'This private request must be erased with its account.', 'OPEN', ${now}, ${now});
  INSERT INTO user_profiles (user_id, display_name, bio, visibility, created_at, updated_at)
  VALUES ('${deletionUserId}', 'Disposable profile', 'Must be erased.', 'PUBLIC', ${now}, ${now});
  INSERT INTO file_objects (id, owner_id, storage_provider, provider_file_id, provider_unique_id,
    mime_type, byte_size, width, height, moderation_state, created_at)
  VALUES ('${mediaId}', '${userId}', 'TELEGRAM', 'fixture-file', 'fixture-unique',
    'image/jpeg', 4, 100, 100, 'PENDING', ${now});
  INSERT INTO credit_accounts (user_id, updated_at) VALUES ('${userId}', ${now});
  INSERT INTO credit_transactions
    (id, user_id, type, amount_micros, idempotency_key, metadata_json, created_at)
  VALUES ('${randomUUID()}', '${userId}', 'BONUS', 1000000, 'integration-credit-${randomUUID()}', '{}', ${now});
  INSERT INTO credit_packs
    (code, display_name, description, stars_amount, credit_amount_micros,
     active, sort_order, created_at, updated_at)
  VALUES ('fixture-pack', 'Fixture credits', 'One-time integration credit pack',
    50, 250000, 1, 0, ${now}, ${now})
  ON CONFLICT(code) DO UPDATE SET display_name = excluded.display_name,
    description = excluded.description, stars_amount = excluded.stars_amount,
    credit_amount_micros = excluded.credit_amount_micros, active = 1,
    sort_order = excluded.sort_order, updated_at = excluded.updated_at;
  INSERT INTO access_packs
    (code, display_name, description, stars_amount, plan_code, duration_days,
     active, sort_order, created_at, updated_at)
  VALUES ('expired-plus-fixture', 'Expired Plus', 'Expired access regression fixture',
    1, 'PLUS', 30, 0, 999, ${now}, ${now});
  INSERT INTO payments
    (id, user_id, amount, state, invoice_payload, telegram_payment_charge_id,
     created_at, updated_at, paid_at, access_pack_code, plan_code,
     access_duration_days, terms_accepted_at, client_idempotency_key)
  VALUES ('expired-plan-payment', '${reporterId}', 1, 'ENTITLEMENT_GRANTED',
    'expired-plan-payload', 'expired-plan-charge', ${now - 60 * 86400000},
    ${now - 60 * 86400000}, ${now - 60 * 86400000}, 'expired-plus-fixture',
    'PLUS', 30, ${now - 60 * 86400000}, 'expired-plan-key');
  INSERT INTO plan_access_grants
    (id, user_id, plan_code, starts_at, expires_at, source_payment_id, created_at)
  VALUES ('expired-plan-grant', '${reporterId}', 'PLUS', ${now - 60 * 86400000},
    ${now - 30 * 86400000}, 'expired-plan-payment', ${now - 60 * 86400000});
  INSERT INTO provider_smoke_runs
    (run_key, actor_id, provider, model, state, request_id, error_code, latency_ms,
     started_at, completed_at)
  VALUES ('BOTHUB_INITIAL_ROLEPLAY_V1', '${userId}', 'BOTHUB',
    'deepseek-v3.2-speciale', 'FAILED', 'legacy-smoke-request', 'BOTHUB_HTTP_ERROR', 1815,
    ${now - 2000}, ${now - 185});
  INSERT INTO provider_smoke_runs
    (run_key, actor_id, provider, model, state, request_id, input_tokens, output_tokens,
     conservative_cost_micros, latency_ms, output_length, started_at, completed_at,
     protocol_variant, http_status, response_started)
  VALUES ('BOTHUB_FREE_CONTEXT_EVAL_V1', '${userId}', 'BOTHUB', 'mistral-nemo',
    'COMPLETED', 'free-context-eval', 20, 10, 20001, 100, 20, ${now - 1000}, ${now - 900},
    'BOTHUB_DOCUMENTED', 200, 1);
  UPDATE model_profiles
  SET model = 'deepseek-chat-v3.1',
      cost_policy_json =
        '{"maxInputUsdPerMillion":0.41,"maxOutputUsdPerMillion":1.55,"fixedRequestUsd":0.02}',
      fallback_models_json =
        '[{"provider":"BOTHUB","model":"kimi-k2.5","maxInputUsdPerMillion":0.93,"maxOutputUsdPerMillion":4.64,"fixedRequestUsd":0.02}]'
  WHERE name = 'CREATIVE';
  INSERT INTO provider_model_capabilities
    (provider, catalog_sha256, available_candidates_json, selected_model, checked_at)
  VALUES ('BOTHUB', '${'0'.repeat(64)}', '["deepseek-chat-v3.1","l3-lunaris-8b","mistral-nemo"]',
    'deepseek-chat-v3.1', ${now});
  INSERT INTO integration_reconciliations
    (integration_key, desired_hash, state, attempts, next_attempt_at, verified_at, updated_at)
  VALUES ('bothub_provider', '${'0'.repeat(64)}', 'READY', 0, 0, ${now}, ${now});
  INSERT INTO characters
    (id, owner_id, visibility, publish_state, content_rating, language,
     created_at, updated_at, published_at)
  VALUES ('${opaqueCharacterId}', '${ownerId}', 'PUBLIC', 'PUBLISHED', 'SAFE', 'ru',
    ${now}, ${now}, ${now});
  INSERT INTO character_versions
    (id, character_id, version, name, tagline, description, personality, scenario,
     first_message, created_at)
  VALUES ('${opaqueCharacterVersionId}', '${opaqueCharacterId}', 1,
    'Opaque fixture', 'Server-issued ID', 'Synthetic integration character.', 'Calm', '',
    'История с непрозрачным ID открыта.', ${now});
  UPDATE characters SET active_version_id = '${opaqueCharacterVersionId}'
  WHERE id = '${opaqueCharacterId}';
`;
runWrangler(['d1', 'execute', 'velora-local', '--local', '--env', 'local', '--command', setupSql]);

const providerServer = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString('utf8');
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (
    request.method === 'GET' &&
    request.url === '/file/botintegration-bot-token/photos/integration.png'
  ) {
    const image = Buffer.alloc(24);
    image.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10], 0);
    image.write('IHDR', 12, 'ascii');
    image.writeUInt32BE(800, 16);
    image.writeUInt32BE(600, 20);
    response.writeHead(200, {
      'content-type': 'image/png',
      'content-length': String(image.byteLength),
    });
    response.end(image);
    return;
  }
  if (request.method === 'GET' && request.url === '/models') {
    if (request.headers.authorization !== 'Bearer integration-ai-key') {
      respondJson(response, { error: 'unauthorized' }, 401);
      return;
    }
    aiHealthChecks += 1;
    respondJson(response, {
      object: 'list',
      data: requiredAiModelAvailable
        ? [{ id: 'deepseek-chat-v3.1' }, { id: 'l3-lunaris-8b' }, { id: 'mistral-nemo' }]
        : [{ id: 'other-model' }],
    });
    return;
  }
  const telegramMethod = request.url?.match(/^\/botintegration-bot-token\/([A-Za-z]+)$/u)?.[1];
  if (telegramMethod === 'getMe') {
    respondJson(response, {
      ok: true,
      result: { id: 123, is_bot: true, username: 'velora_local_bot' },
    });
    return;
  }
  if (telegramMethod === 'getWebhookInfo') {
    respondJson(response, { ok: true, result: configuredWebhook });
    return;
  }
  if (telegramMethod === 'setWebhook') {
    telegramConfigurationMutations.push(telegramMethod);
    configuredWebhook = { url: body.url, allowed_updates: body.allowed_updates };
    respondJson(response, { ok: true, result: true });
    return;
  }
  if (telegramMethod === 'getMyCommands') {
    respondJson(response, {
      ok: true,
      result: configuredCommands.get(body.language_code ?? 'default') ?? [],
    });
    return;
  }
  if (telegramMethod === 'setMyCommands') {
    telegramConfigurationMutations.push(`${telegramMethod}:${body.language_code ?? 'default'}`);
    configuredCommands.set(body.language_code ?? 'default', body.commands);
    respondJson(response, { ok: true, result: true });
    return;
  }
  if (telegramMethod === 'getChatMenuButton') {
    respondJson(response, { ok: true, result: configuredMenu });
    return;
  }
  if (telegramMethod === 'setChatMenuButton') {
    telegramConfigurationMutations.push(telegramMethod);
    configuredMenu = body.menu_button;
    respondJson(response, { ok: true, result: true });
    return;
  }
  if (telegramMethod === 'getMyDescription') {
    respondJson(response, { ok: true, result: { description: configuredDescription } });
    return;
  }
  if (telegramMethod === 'setMyDescription') {
    telegramConfigurationMutations.push(telegramMethod);
    configuredDescription = body.description;
    respondJson(response, { ok: true, result: true });
    return;
  }
  if (telegramMethod === 'getMyShortDescription') {
    respondJson(response, {
      ok: true,
      result: { short_description: configuredShortDescription },
    });
    return;
  }
  if (telegramMethod === 'getFile') {
    respondJson(response, {
      ok: true,
      result: { file_path: 'photos/integration.png', file_size: 24 },
    });
    return;
  }
  if (telegramMethod === 'setMyShortDescription') {
    telegramConfigurationMutations.push(telegramMethod);
    configuredShortDescription = body.short_description;
    respondJson(response, { ok: true, result: true });
    return;
  }
  if (request.url === '/botintegration-bot-token/createInvoiceLink') {
    telegramRequests.push({ method: 'createInvoiceLink', body });
    if (
      body.currency !== 'XTR' ||
      body.provider_token !== undefined ||
      body.subscription_period !== undefined ||
      ![50, 120].includes(body.prices?.[0]?.amount)
    ) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end('{"ok":false,"description":"invalid invoice"}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true,"result":"https://t.me/$integration-invoice"}');
    return;
  }
  if (request.url === '/botintegration-bot-token/answerPreCheckoutQuery') {
    telegramRequests.push({ method: 'answerPreCheckoutQuery', body });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true,"result":true}');
    return;
  }
  if (request.url === '/botintegration-bot-token/refundStarPayment') {
    telegramRequests.push({ method: 'refundStarPayment', body });
    if (typeof body.user_id !== 'number' || typeof body.telegram_payment_charge_id !== 'string') {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end('{"ok":false,"description":"invalid refund"}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true,"result":true}');
    return;
  }
  if (request.url === '/botintegration-bot-token/sendMessage') {
    telegramRequests.push({ method: 'sendMessage', body });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true,"result":true}');
    return;
  }
  const smokeRequest =
    body.model === 'deepseek-chat-v3.1' &&
    body.max_tokens === 32 &&
    body.messages?.some(
      (message) =>
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.includes('ночной сад'),
    );
  const modelEvalRequest =
    ['l3-lunaris-8b', 'mistral-nemo'].includes(body.model) && body.max_tokens === 64;
  const benchmarkRequest =
    ['l3-lunaris-8b', 'mistral-nemo'].includes(body.model) && body.max_tokens === 120;
  if (
    request.method !== 'POST' ||
    request.url !== '/chat/completions' ||
    request.headers.authorization !== 'Bearer integration-ai-key' ||
    body.stream !== true ||
    (smokeRequest || modelEvalRequest || benchmarkRequest
      ? body.stream_options !== undefined
      : body.stream_options?.include_usage !== true) ||
    !Array.isArray(body.messages) ||
    (!smokeRequest &&
      !modelEvalRequest &&
      !benchmarkRequest &&
      body.model !== 'mistral-nemo' &&
      !body.messages.some(
        (message) =>
          typeof message.content === 'string' && message.content.includes('MODEL_SWITCH_TEST'),
      ) &&
      !body.messages.some(
        (message) =>
          typeof message.content === 'string' && message.content.includes('CONTENT_POLICY_TEST'),
      ) &&
      !body.messages.some(
        (message) =>
          typeof message.content === 'string' && message.content.includes('PARTIAL_FAILURE_TEST'),
      ) &&
      !body.messages.some(
        (message) => message.role === 'system' && message.content.includes('секретный проход'),
      ))
  ) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end('{"error":"invalid provider request"}');
    return;
  }
  aiRequests.push(body);
  if (smokeRequest) aiSmokeRequests += 1;
  if (modelEvalRequest) modelEvalRequests += 1;
  if (benchmarkRequest) benchmarkRequests += 1;
  if (
    body.messages.some(
      (message) => typeof message.content === 'string' && message.content.includes('FAIL_ALL_TEST'),
    )
  ) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end('{"error":"forced integration provider outage"}');
    return;
  }
  if (
    body.messages.some(
      (message) =>
        typeof message.content === 'string' && message.content.includes('PARTIAL_FAILURE_TEST'),
    )
  ) {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write('data: {"choices":[{"delta":{"content":"Partial answer retained."}}]}\n\n');
    response.end(
      'data: {"error":{"code":"forced_partial_failure","message":"forced integration partial failure"}}\n\n',
    );
    return;
  }
  if (
    body.messages.some(
      (message) =>
        typeof message.content === 'string' && message.content.includes('CONTENT_POLICY_TEST'),
    )
  ) {
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(
      '{"error":{"code":"content_policy","message":"private provider diagnostic must not escape"}}',
    );
    return;
  }
  if (
    body.model === 'deepseek-chat-v3.1' &&
    body.max_tokens === 350 &&
    creativeTransientAttempts < 2
  ) {
    creativeTransientAttempts += 1;
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end('{"error":"temporary provider outage"}');
    return;
  }
  const slowDeletionTest = body.messages.some(
    (message) =>
      typeof message.content === 'string' && message.content.includes('SLOW_DELETE_TEST'),
  );
  const slowConcurrencyTest = body.messages.some(
    (message) =>
      typeof message.content === 'string' && message.content.includes('Параллельная история'),
  );
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write(': processing\n\n');
  response.write('data: {"choices":[{"delta":{"content":"Архив "}}]}\n\n');
  if (slowDeletionTest || slowConcurrencyTest)
    await new Promise((resolve) => setTimeout(resolve, 350));
  response.write(
    'data: {"choices":[{"delta":{"content":"открылся."},"finish_reason":"stop"}],"usage":{"prompt_tokens":240,"completion_tokens":12,"cost":0.0002,"prompt_tokens_details":{"cached_tokens":0}}}\n\n',
  );
  response.end('data: [DONE]\n\n');
});
await new Promise((resolve, reject) => {
  providerServer.once('error', reject);
  providerServer.listen(providerPort, '127.0.0.1', resolve);
});

const worker = spawn(
  process.execPath,
  [
    wranglerEntry,
    'dev',
    '--env',
    'local',
    '--port',
    String(port),
    '--var',
    `SESSION_SIGNING_KEY:${signingKey}`,
    '--var',
    'BOTHUB_API_KEY:integration-ai-key',
    '--var',
    `BOTHUB_BASE_URL:http://127.0.0.1:${providerPort}/chat/completions`,
    '--var',
    `BOTHUB_MODELS_URL:http://127.0.0.1:${providerPort}/models`,
    '--var',
    'TELEGRAM_BOT_TOKEN:integration-bot-token',
    '--var',
    'TELEGRAM_WEBHOOK_SECRET:integration-webhook-secret',
    '--var',
    'TELEGRAM_RECONCILIATION_ENABLED:true',
    '--var',
    `TELEGRAM_API_BASE_URL:http://127.0.0.1:${providerPort}`,
    '--var',
    'OWNER_TELEGRAM_ID:1040929628',
    '--var',
    'PAYMENTS_ENABLED:true',
    '--var',
    'PAID_AI_ENABLED:true',
    'SPONSORED_FREE_AI_ENABLED:true',
    '--var',
    'DAILY_AI_BUDGET_USD:1',
    '--var',
    'PER_USER_DAILY_AI_BUDGET_USD:0.50',
    '--var',
    'MONTHLY_AI_BUDGET_USD:10',
    '--var',
    'LIFETIME_AI_BUDGET_USD:100',
    '--log-level',
    'error',
    '--test-scheduled',
    '--persist-to',
    persistenceRoot,
  ],
  { cwd: apiRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: false },
);
let workerOutput = '';
worker.stdout.on('data', (chunk) => {
  workerOutput = `${workerOutput}${String(chunk)}`.slice(-64_000);
});
worker.stderr.on('data', (chunk) => {
  workerOutput = `${workerOutput}${String(chunk)}`.slice(-64_000);
});

const headers = { cookie: `velora_session=${sessionToken}` };
const reporterHeaders = { cookie: `velora_session=${reporterSessionToken}` };
const adminHeaders = { cookie: `velora_session=${adminSessionToken}` };
const ownerHeaders = { cookie: `velora_session=${ownerSessionToken}` };
const deletionHeaders = { cookie: `velora_session=${deletionSessionToken}` };

try {
  await waitUntilReady();
  const openApi = await request('/openapi.json', undefined, 200);
  if (
    openApi.openapi !== '3.1.0' ||
    !openApi.paths?.['/api/v1/auth/telegram']?.post ||
    !openApi.paths?.['/api/v1/conversations/{conversationId}/generate']?.post ||
    !openApi.paths?.['/telegram/webhook']?.post ||
    !openApi.components?.schemas?.ApiError
  ) {
    throw new Error('Published OpenAPI contract is incomplete or malformed.');
  }
  const publicConfig = await cachedPublicRequest('/api/v1/config', 'MISS');
  if (publicConfig.body.appName !== 'VeloraAI' || 'dailyAiBudgetUsd' in publicConfig.body) {
    throw new Error('Public config cache is incomplete or exposes internal budget controls.');
  }
  await waitForPublicCacheHit('/api/v1/config');
  const firstRunInitData = signTelegramInitData(
    {
      id: firstRunTelegramId,
      first_name: 'First Run',
      username: `first_run_${firstRunTelegramId}`,
      language_code: 'en-US',
    },
    'integration-bot-token',
  );
  const firstRunAuthResponse = await fetch(`${baseUrl}/api/v1/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: firstRunInitData }),
  });
  const firstRunAuth = await firstRunAuthResponse.json();
  const firstRunCookie = firstRunAuthResponse.headers.get('set-cookie')?.split(';', 1)[0];
  if (
    firstRunAuthResponse.status !== 201 ||
    typeof firstRunAuth.user?.id !== 'string' ||
    typeof firstRunAuth.csrfToken !== 'string' ||
    !firstRunCookie
  ) {
    throw new Error(`First-run Telegram authentication failed: ${JSON.stringify(firstRunAuth)}.`);
  }
  const firstRunHeaders = { cookie: firstRunCookie };
  const firstRunMe = await request('/api/v1/me', { headers: firstRunHeaders }, 200);
  if (
    firstRunMe.onboardingCompleted !== false ||
    firstRunMe.locale !== 'en' ||
    firstRunMe.role !== 'USER'
  ) {
    throw new Error('A new Telegram user was not initialized with safe first-run defaults.');
  }
  const resumedAuthResponse = await fetch(`${baseUrl}/api/v1/auth/telegram`, {
    method: 'POST',
    headers: { ...firstRunHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ initData: firstRunInitData }),
  });
  const resumedAuth = await resumedAuthResponse.json();
  if (
    resumedAuthResponse.status !== 200 ||
    resumedAuth.user?.id !== firstRunAuth.user.id ||
    typeof resumedAuth.csrfToken !== 'string' ||
    resumedAuth.csrfToken === firstRunAuth.csrfToken
  ) {
    throw new Error(
      `A valid Telegram session could not recover after sessionStorage loss: ${JSON.stringify(resumedAuth)}.`,
    );
  }
  const firstRunCsrfToken = resumedAuth.csrfToken;
  const staleCsrfResponse = await fetch(`${baseUrl}/api/v1/settings`, {
    method: 'PATCH',
    headers: {
      ...firstRunHeaders,
      'content-type': 'application/json',
      'x-csrf-token': firstRunAuth.csrfToken,
    },
    body: JSON.stringify({ theme: 'dark' }),
  });
  const staleCsrfBody = await staleCsrfResponse.json();
  if (staleCsrfResponse.status !== 403 || staleCsrfBody.error?.code !== 'INVALID_CSRF') {
    throw new Error('Session recovery did not revoke the previous CSRF token.');
  }
  const firstRunCompletion = await request(
    '/api/v1/onboarding/complete',
    {
      method: 'POST',
      headers: {
        ...firstRunHeaders,
        'content-type': 'application/json',
        'x-csrf-token': firstRunCsrfToken,
      },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        policyAccepted: true,
        matureEnabled: false,
        persona: {
          name: 'First Persona',
          shortDescription: 'Created during the first-run integration flow.',
        },
      }),
    },
    201,
  );
  if (typeof firstRunCompletion.personaId !== 'string') {
    throw new Error('First-run onboarding did not create the selected persona.');
  }
  const firstRunDiscovery = await request(
    '/api/v1/discovery?sort=newest&limit=3&rating=SAFE',
    { headers: firstRunHeaders },
    200,
  );
  if (!firstRunDiscovery.items.some((item) => item.id === opaqueCharacterId)) {
    throw new Error('A new user did not receive a safe character recommendation.');
  }
  const firstRunConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: {
        ...firstRunHeaders,
        'content-type': 'application/json',
        'x-csrf-token': firstRunCsrfToken,
      },
      body: JSON.stringify({
        characterId: opaqueCharacterId,
        personaId: firstRunCompletion.personaId,
        idempotencyKey: `first-run-story:${randomUUID()}`,
      }),
    },
    201,
  );
  if (firstRunConversation.personaId !== firstRunCompletion.personaId) {
    throw new Error('The first story did not retain the persona created during onboarding.');
  }
  const firstRunMessages = await request(
    `/api/v1/conversations/${firstRunConversation.id}/messages`,
    { headers: firstRunHeaders },
    200,
  );
  if (firstRunMessages.items.length !== 1 || firstRunMessages.items[0]?.role !== 'ASSISTANT') {
    throw new Error('The first story did not expose its initial character message.');
  }
  const racedInitData = signTelegramInitData(
    {
      id: String(Number(firstRunTelegramId) + 1),
      first_name: 'Concurrent First Run',
      language_code: 'ru',
    },
    'integration-bot-token',
  );
  const racedAuthResponses = await Promise.all(
    Array.from({ length: 2 }, () =>
      fetch(`${baseUrl}/api/v1/auth/telegram`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: racedInitData }),
      }),
    ),
  );
  const racedAuthResults = await Promise.all(
    racedAuthResponses.map(async (response) => ({
      status: response.status,
      body: await response.json(),
    })),
  );
  const racedStatuses = racedAuthResults
    .map(({ status }) => status)
    .sort((left, right) => left - right);
  if (racedStatuses[0] !== 201 || racedStatuses[1] !== 409) {
    throw new Error(
      `Concurrent first-run auth was not serialized safely: ${JSON.stringify(racedAuthResults)}.`,
    );
  }
  const replayFailure = racedAuthResults.find(({ status }) => status === 409);
  if (replayFailure?.body?.error?.code !== 'INIT_DATA_REPLAYED') {
    throw new Error('Concurrent first-run auth did not return the stable replay error contract.');
  }
  const racedAuthWinner = racedAuthResults.find(({ status }) => status === 201);
  if (
    typeof racedAuthWinner?.body?.user?.id !== 'string' ||
    typeof racedAuthWinner.body.csrfToken !== 'string'
  ) {
    throw new Error('Concurrent first-run auth did not return one complete winning session.');
  }
  const me = await request('/api/v1/me', { headers }, 200);
  if (me.id !== userId || me.plan !== 'FREE' || me.onboardingCompleted !== false) {
    throw new Error('Authenticated /me is inconsistent.');
  }
  await request(
    '/api/v1/onboarding/complete',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        policyAccepted: true,
        matureEnabled: false,
        persona: null,
      }),
    },
    403,
  );
  await request(
    '/api/v1/onboarding/complete',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        policyAccepted: false,
      }),
    },
    400,
  );
  const onboardingKey = randomUUID();
  const onboarding = await request(
    '/api/v1/onboarding/complete',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        idempotencyKey: onboardingKey,
        policyAccepted: true,
        matureEnabled: false,
        persona: null,
      }),
    },
    201,
  );
  if (!onboarding.completed || onboarding.personaId !== null || onboarding.matureEnabled) {
    throw new Error('Safe-mode onboarding completion is inconsistent.');
  }
  const repeatedOnboarding = await request(
    '/api/v1/onboarding/complete',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        idempotencyKey: onboardingKey,
        policyAccepted: true,
        matureEnabled: false,
        persona: null,
      }),
    },
    200,
  );
  if (repeatedOnboarding.completedAt !== onboarding.completedAt) {
    throw new Error('Onboarding completion is not idempotent.');
  }
  const completedMe = await request('/api/v1/me', { headers }, 200);
  if (!completedMe.onboardingCompleted || completedMe.ageGateAccepted) {
    throw new Error('Safe onboarding state was not reflected by /me.');
  }
  const reporterOnboarding = await request(
    '/api/v1/onboarding/complete',
    {
      method: 'POST',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        policyAccepted: true,
        matureEnabled: true,
        persona: { name: 'Первый образ', shortDescription: 'Создан во время знакомства.' },
      }),
    },
    201,
  );
  if (!reporterOnboarding.personaId || !reporterOnboarding.matureEnabled) {
    throw new Error('Onboarding did not create the optional private persona or Mature choice.');
  }
  const reporterSettingsAfterOnboarding = await request(
    '/api/v1/settings',
    { headers: reporterHeaders },
    200,
  );
  if (!reporterSettingsAfterOnboarding.nsfwVisible) {
    throw new Error('Mature onboarding choice did not enable the guarded catalog setting.');
  }
  await request(
    '/api/v1/onboarding/complete',
    {
      method: 'POST',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        policyAccepted: true,
        matureEnabled: true,
        persona: { name: 'Не должен дублироваться' },
      }),
    },
    200,
  );
  const reporterPersonas = await request('/api/v1/personas', { headers: reporterHeaders }, 200);
  if (
    reporterPersonas.items.length !== 1 ||
    reporterPersonas.items[0]?.id !== reporterOnboarding.personaId ||
    !reporterPersonas.items[0]?.isDefault
  ) {
    throw new Error('Onboarding persona was duplicated or was not selected as the default.');
  }

  await request(
    '/api/v1/settings',
    { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' },
    403,
  );
  const settings = await request(
    '/api/v1/settings',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ theme: 'amoled', locale: 'en' }),
    },
    200,
  );
  if (settings.theme !== 'amoled' || settings.locale !== 'en') {
    throw new Error('Settings mutation was not persisted.');
  }

  const directImage = Buffer.alloc(24);
  directImage.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10], 0);
  directImage.write('IHDR', 12, 'ascii');
  directImage.writeUInt32BE(1_600, 16);
  directImage.writeUInt32BE(1_000, 20);
  const directUpload = await request(
    '/api/v1/media',
    {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'image/png',
        'x-csrf-token': csrfToken,
        'x-upload-name': encodeURIComponent('../../unsafe/avatar.png'),
      },
      body: directImage,
    },
    201,
  );
  if (
    directUpload.storageProvider !== 'R2' ||
    directUpload.originalName !== 'avatar.png' ||
    directUpload.width !== 1_600 ||
    directUpload.height !== 1_000
  ) {
    throw new Error('Direct R2 upload did not normalize its name or inspected geometry.');
  }
  const directContent = await fetch(`${baseUrl}${directUpload.contentUrl}`, { headers });
  if (
    directContent.status !== 200 ||
    directContent.headers.get('content-type') !== 'image/png' ||
    !directContent.headers.get('etag') ||
    Buffer.compare(Buffer.from(await directContent.arrayBuffer()), directImage) !== 0
  ) {
    throw new Error('Direct R2 media bytes were not served intact.');
  }
  const mimeMismatch = await request(
    '/api/v1/media',
    {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'image/jpeg',
        'x-csrf-token': csrfToken,
      },
      body: directImage,
    },
    415,
  );
  if (mimeMismatch.error?.code !== 'MEDIA_MIME_MISMATCH') {
    throw new Error('Direct upload MIME spoofing was not rejected.');
  }
  const directLibrary = await request('/api/v1/media', { headers }, 200);
  if (
    directLibrary.capabilities?.directUpload !== true ||
    !directLibrary.items.some((item) => item.id === directUpload.id)
  ) {
    throw new Error('R2 media library capability or uploaded object is missing.');
  }
  await request(
    `/api/v1/media/${directUpload.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  await request(`/api/v1/media/${directUpload.id}/content`, { headers }, 404);

  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: 700_000_000 + Math.floor(Math.random() * 100_000_000),
        message: {
          message_id: 700001,
          from: { id: Number(telegramId), first_name: 'Integration User', language_code: 'en' },
          chat: { id: Number(telegramId), type: 'private' },
          photo: [
            {
              file_id: 'integration-photo',
              file_unique_id: 'integration-photo-unique',
              width: 800,
              height: 600,
              file_size: 24,
            },
          ],
        },
      }),
    },
    200,
  );
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: 800_000_000 + Math.floor(Math.random() * 100_000_000),
        message: {
          message_id: 700002,
          from: { id: Number(telegramId), first_name: 'Integration User', language_code: 'en' },
          chat: { id: Number(telegramId), type: 'private' },
          photo: [
            {
              file_id: 'integration-photo',
              file_unique_id: 'integration-photo-unique',
              width: 800,
              height: 600,
              file_size: 24,
            },
          ],
        },
      }),
    },
    200,
  );
  const uploadedMedia = await request('/api/v1/media', { headers }, 200);
  const inspectedUpload = uploadedMedia.items.find(
    (item) => item.width === 800 && item.height === 600 && item.mimeType === 'image/png',
  );
  if (!inspectedUpload?.id) {
    throw new Error('Telegram image ingestion did not persist inspected byte dimensions.');
  }
  const avatarQueue = await request(
    '/api/v1/admin/moderation/cases?state=OPEN',
    { headers: ownerHeaders },
    200,
  );
  const avatarCases = avatarQueue.items.filter(
    (item) =>
      item.targetType === 'AVATAR' &&
      item.targetId === inspectedUpload.id &&
      item.reportId === null,
  );
  const avatarCase = avatarCases[0];
  if (!avatarCase?.id) {
    throw new Error('Uploaded Telegram image did not enter the system moderation queue.');
  }
  if (avatarCases.length !== 1) {
    throw new Error('Repeated Telegram image ingestion duplicated an active moderation case.');
  }
  await request(`/api/v1/admin/moderation/cases/${avatarCase.id}`, { headers }, 403);
  const avatarCaseDetail = await request(
    `/api/v1/admin/moderation/cases/${avatarCase.id}`,
    { headers: ownerHeaders },
    200,
  );
  if (
    avatarCaseDetail.evidence?.id !== inspectedUpload.id ||
    avatarCaseDetail.evidence?.moderationState !== 'PENDING'
  ) {
    throw new Error('Avatar moderation evidence did not expose the pending file metadata.');
  }
  const uploadedContent = await fetch(`${baseUrl}/api/v1/media/${inspectedUpload.id}/content`, {
    headers,
  });
  if (
    uploadedContent.status !== 200 ||
    uploadedContent.headers.get('content-type') !== 'image/png' ||
    (await uploadedContent.arrayBuffer()).byteLength !== 24
  ) {
    throw new Error('Inspected Telegram image could not be proxied through the owned media route.');
  }
  const moderatorContent = await fetch(`${baseUrl}/api/v1/media/${inspectedUpload.id}/content`, {
    headers: ownerHeaders,
  });
  if (moderatorContent.status !== 200 || (await moderatorContent.arrayBuffer()).byteLength !== 24) {
    throw new Error('Authorized moderation could not inspect pending Telegram image bytes.');
  }
  await request(
    `/api/v1/admin/moderation/cases/${avatarCase.id}/assign`,
    {
      method: 'POST',
      headers: { ...ownerHeaders, 'x-csrf-token': ownerCsrfToken },
    },
    200,
  );
  await request(
    `/api/v1/admin/moderation/cases/${avatarCase.id}/actions`,
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ action: 'NO_ACTION', reason: 'Safe image regression review.' }),
    },
    200,
  );
  const approvedMedia = await request('/api/v1/media', { headers }, 200);
  if (
    approvedMedia.items.find((item) => item.id === inspectedUpload.id)?.moderationState !==
    'APPROVED'
  ) {
    throw new Error('Approved system avatar review did not update the media state.');
  }
  await request(
    '/api/v1/profiles/me',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        displayName: 'Integration User',
        bio: '',
        avatarFileId: inspectedUpload.id,
        visibility: 'PUBLIC',
      }),
    },
    200,
  );
  const publicApprovedContent = await fetch(
    `${baseUrl}/api/v1/media/${inspectedUpload.id}/content`,
    { headers: reporterHeaders },
  );
  if (
    publicApprovedContent.status !== 200 ||
    (await publicApprovedContent.arrayBuffer()).byteLength !== 24
  ) {
    throw new Error('Approved publicly referenced avatar was not available to another user.');
  }
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: 900_000_000 + Math.floor(Math.random() * 90_000_000),
        message: {
          message_id: 700003,
          from: { id: Number(telegramId), first_name: 'Integration User', language_code: 'en' },
          chat: { id: Number(telegramId), type: 'private' },
          photo: [
            {
              file_id: 'integration-photo',
              file_unique_id: 'integration-photo-unique',
              width: 800,
              height: 600,
              file_size: 24,
            },
          ],
        },
      }),
    },
    200,
  );
  const repeatedAvatarQueue = await request(
    '/api/v1/admin/moderation/cases?state=OPEN',
    { headers: ownerHeaders },
    200,
  );
  const repeatedAvatarCase = repeatedAvatarQueue.items.find(
    (item) =>
      item.targetType === 'AVATAR' &&
      item.targetId === inspectedUpload.id &&
      item.reportId === null,
  );
  if (!repeatedAvatarCase?.id || repeatedAvatarCase.id === avatarCase.id) {
    throw new Error('Re-upload after approval did not create one fresh system avatar review.');
  }
  await request(
    `/api/v1/admin/moderation/cases/${repeatedAvatarCase.id}/assign`,
    {
      method: 'POST',
      headers: { ...ownerHeaders, 'x-csrf-token': ownerCsrfToken },
    },
    200,
  );
  await request(
    `/api/v1/admin/moderation/cases/${repeatedAvatarCase.id}/actions`,
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ action: 'CONTENT_REMOVE', reason: 'Unsafe image regression review.' }),
    },
    200,
  );
  const rejectedMedia = await request('/api/v1/media', { headers }, 200);
  if (
    rejectedMedia.items.find((item) => item.id === inspectedUpload.id)?.moderationState !==
    'REJECTED'
  ) {
    throw new Error('Rejected system avatar review did not update the media state.');
  }
  const rejectedPublicContent = await fetch(
    `${baseUrl}/api/v1/media/${inspectedUpload.id}/content`,
    { headers: reporterHeaders },
  );
  if (rejectedPublicContent.status !== 404) {
    throw new Error('Rejected avatar remained readable through a public profile reference.');
  }
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: 990_000_000 + Math.floor(Math.random() * 9_000_000),
        message: {
          message_id: 700004,
          from: { id: Number(telegramId), first_name: 'Integration User', language_code: 'en' },
          chat: { id: Number(telegramId), type: 'private' },
          photo: [
            {
              file_id: 'integration-photo',
              file_unique_id: 'integration-photo-unique',
              width: 800,
              height: 600,
              file_size: 24,
            },
          ],
        },
      }),
    },
    200,
  );
  const deletionQueue = await request(
    '/api/v1/admin/moderation/cases?state=OPEN',
    { headers: ownerHeaders },
    200,
  );
  const deletionCase = deletionQueue.items.find(
    (item) =>
      item.targetType === 'AVATAR' &&
      item.targetId === inspectedUpload.id &&
      item.reportId === null,
  );
  if (!deletionCase?.id) {
    throw new Error('Pending avatar deletion regression did not create a review case.');
  }
  await request(
    `/api/v1/media/${inspectedUpload.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const closedAvatarQueue = await request(
    '/api/v1/admin/moderation/cases?state=CLOSED',
    { headers: ownerHeaders },
    200,
  );
  if (!closedAvatarQueue.items.some((item) => item.id === deletionCase.id)) {
    throw new Error('Deleting pending media did not close its active system review.');
  }
  await request(`/api/v1/admin/moderation/cases/${avatarCase.id}`, { headers: ownerHeaders }, 404);

  const dataControls = await request('/api/v1/data-controls', { headers }, 200);
  if (
    dataControls.gracePeriodDays !== 7 ||
    dataControls.deletion !== null ||
    dataControls.export?.counts?.conversations !== 0 ||
    !dataControls.export?.resources?.includes('characters')
  ) {
    throw new Error('Initial data controls contract is inconsistent.');
  }
  const opaqueConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: opaqueCharacterId,
        idempotencyKey: `opaque-character:${randomUUID()}`,
      }),
    },
    201,
  );
  if (opaqueConversation.characterId !== opaqueCharacterId) {
    throw new Error('A server-issued opaque character ID could not start a conversation.');
  }
  const initialProfile = await request('/api/v1/profiles/me', { headers }, 200);
  if (
    !initialProfile.isOwn ||
    initialProfile.displayName !== 'Integration User' ||
    !Object.hasOwn(initialProfile, 'username') ||
    initialProfile.username !== null
  ) {
    throw new Error('Telegram user fallback did not initialize an owned product profile.');
  }
  await request(
    '/api/v1/profiles/me',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Независимый автор',
        bio: 'Публичное описание автора внутри Velora.',
        avatarFileId: mediaId,
        visibility: 'PUBLIC',
      }),
    },
    403,
  );
  const updatedProfile = await request(
    '/api/v1/profiles/me',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        displayName: 'Независимый автор',
        bio: 'Публичное описание автора внутри Velora.',
        avatarFileId: mediaId,
        visibility: 'PUBLIC',
      }),
    },
    200,
  );
  if (!updatedProfile.avatarPending || updatedProfile.avatarFileId !== mediaId) {
    throw new Error('Owned pending profile avatar was not persisted for its owner.');
  }
  const publicProfile = await request(
    `/api/v1/profiles/${userId}`,
    { headers: reporterHeaders },
    200,
  );
  if (
    publicProfile.displayName !== 'Независимый автор' ||
    publicProfile.avatarFileId !== null ||
    !publicProfile.avatarPending
  ) {
    throw new Error('Public profile leaked an unapproved avatar or lost safe metadata.');
  }
  await request(
    '/api/v1/profiles/me',
    {
      method: 'PATCH',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        displayName: 'Чужой файл',
        bio: '',
        avatarFileId: mediaId,
        visibility: 'PUBLIC',
      }),
    },
    400,
  );
  await request(
    '/api/v1/profiles/me',
    {
      method: 'PATCH',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        displayName: 'Проверяющий профиль',
        bio: 'Публичное описание для проверки модерации профиля.',
        avatarFileId: null,
        visibility: 'PUBLIC',
      }),
    },
    200,
  );
  await request(
    '/api/v1/profiles/me',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        displayName: 'Независимый автор',
        bio: 'Приватное описание.',
        avatarFileId: null,
        visibility: 'PRIVATE',
      }),
    },
    200,
  );
  await request(`/api/v1/profiles/${userId}`, { headers: reporterHeaders }, 404);
  await request(
    '/api/v1/profiles/me',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        displayName: 'Независимый автор',
        bio: 'Публичное описание автора внутри Velora.',
        avatarFileId: null,
        visibility: 'PUBLIC',
      }),
    },
    200,
  );
  const dataExport = await request('/api/v1/data-export', { headers }, 200);
  if (
    dataExport.formatVersion !== 2 ||
    dataExport.account?.id !== userId ||
    dataExport.account?.onboarding?.matureEnabled !== false ||
    dataExport.endpoints?.lorebooks !== '/api/v1/lorebooks' ||
    dataExport.profile?.displayName !== 'Независимый автор' ||
    dataExport.planAccess?.effective?.code !== 'FREE'
  ) {
    throw new Error('Portable data export manifest is inconsistent.');
  }
  await request(
    '/api/v1/support/requests',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'TECHNICAL',
        subject: 'CSRF regression',
        message: 'This request must be rejected because its CSRF token is missing.',
      }),
    },
    403,
  );
  const supportRequest = await request(
    '/api/v1/support/requests',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        category: 'TECHNICAL',
        subject: 'Не открывается диалог',
        message: 'После открытия диалога появляется код ошибки и пустой экран.',
      }),
    },
    201,
  );
  const ownSupport = await request('/api/v1/support/requests', { headers }, 200);
  if (ownSupport.items.length !== 1 || ownSupport.items[0]?.id !== supportRequest.id) {
    throw new Error('Private support request was not returned to its owner.');
  }
  await request('/api/v1/admin/support/requests', { headers }, 403);
  const supportQueue = await request(
    '/api/v1/admin/support/requests?state=OPEN',
    { headers: adminHeaders },
    200,
  );
  if (!supportQueue.items.some((item) => item.id === supportRequest.id)) {
    throw new Error('Administrator support queue is missing the new request.');
  }
  const resolvedSupport = await request(
    `/api/v1/admin/support/requests/${supportRequest.id}`,
    {
      method: 'PATCH',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({ state: 'RESOLVED', resolutionNote: 'Проверено и исправлено.' }),
    },
    200,
  );
  if (resolvedSupport.state !== 'RESOLVED' || resolvedSupport.resolvedAt === null) {
    throw new Error('Support resolution was not persisted.');
  }
  const exportWithSupport = await request('/api/v1/data-export', { headers }, 200);
  if (
    exportWithSupport.resources.supportRequests !== 1 ||
    exportWithSupport.supportRequests[0]?.message !== supportRequest.message
  ) {
    throw new Error('Owned support data is missing from portable export.');
  }
  await request(
    '/api/v1/data-controls/account-deletion',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'УДАЛИТЬ', idempotencyKey: randomUUID() }),
    },
    403,
  );
  const deletion = await request(
    '/api/v1/data-controls/account-deletion',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ confirmation: 'УДАЛИТЬ', idempotencyKey: randomUUID() }),
    },
    201,
  );
  if (
    deletion.state !== 'PENDING' ||
    deletion.cancellable !== true ||
    deletion.executeAfter - deletion.requestedAt !== 7 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('Deletion grace-period request is inconsistent.');
  }
  await request(
    '/api/v1/data-controls/account-deletion',
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const cancelledControls = await request('/api/v1/data-controls', { headers }, 200);
  if (cancelledControls.deletion?.state !== 'CANCELLED') {
    throw new Error('Account deletion cancellation was not persisted.');
  }
  await request(
    '/api/v1/data-controls/account-deletion',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ confirmation: 'УДАЛИТЬ', idempotencyKey: randomUUID() }),
    },
    409,
  );

  const publicFlags = await request('/api/v1/feature-flags', { headers }, 200);
  if (publicFlags.flags.public_reviews !== true || 'config' in publicFlags.flags) {
    throw new Error('Public feature flags are missing or expose internal configuration.');
  }
  await request('/api/v1/admin/operations/dashboard', { headers }, 403);
  const operationsDashboard = await request(
    '/api/v1/admin/operations/dashboard',
    { headers: adminHeaders },
    200,
  );
  if (
    operationsDashboard.users < 4 ||
    operationsDashboard.ownerAiUsage !== null ||
    operationsDashboard.planDistribution.FREE !== operationsDashboard.users ||
    typeof operationsDashboard.aiCostMicros24h !== 'number' ||
    operationsDashboard.capacityProjection?.metrics?.length !== 7 ||
    operationsDashboard.capacityProjection.automaticUpgradeEnabled !== false ||
    operationsDashboard.capacityProjection.runtimePolicy?.coreChatEnabled !== true ||
    operationsDashboard.capacityProjection.runtimePolicy?.status !== 'OK' ||
    !operationsDashboard.capacityProjection.metrics.some(
      (metric) => metric.key === 'workerRequests' && metric.freeLimit === 100_000,
    ) ||
    !operationsDashboard.capacityProjection.metrics.some(
      (metric) => metric.key === 'd1RowsRead' && metric.freeLimit === 5_000_000,
    ) ||
    !operationsDashboard.capacityProjection.metrics.some(
      (metric) => metric.key === 'd1RowsWritten' && metric.freeLimit === 100_000,
    ) ||
    !operationsDashboard.capacityProjection.metrics.some(
      (metric) => metric.key === 'queueOperations' && metric.freeLimit === 10_000,
    )
  ) {
    throw new Error('Privacy-safe operations dashboard or Free capacity forecast is inconsistent.');
  }
  const ownerOperationsDashboard = await request(
    '/api/v1/admin/operations/dashboard',
    { headers: ownerHeaders },
    200,
  );
  if (
    !ownerOperationsDashboard.ownerAiUsage ||
    ownerOperationsDashboard.ownerAiUsage.capsBalance?.estimatedRemainingCaps !== null ||
    ownerOperationsDashboard.ownerAiUsage.capsBalance?.status !==
      'PROVIDER_BALANCE_API_UNAVAILABLE' ||
    ownerOperationsDashboard.ownerAiUsage.configuredBudgetMicros.lifetime !== 100_000_000 ||
    ownerOperationsDashboard.ownerAiUsage.configuredBudgetMicros.remainingLifetime > 100_000_000 ||
    !Array.isArray(ownerOperationsDashboard.ownerAiUsage.perModelWeekly)
  ) {
    throw new Error('Owner-only AI usage or honest CAPS availability state is inconsistent.');
  }
  await request('/api/v1/admin/operations/ai-smoke', { headers }, 403);
  await request('/api/v1/admin/operations/ai-smoke', { headers: adminHeaders }, 403);
  const emptySmoke = await request(
    '/api/v1/admin/operations/ai-smoke',
    { headers: ownerHeaders },
    200,
  );
  const preservedV1 = emptySmoke.history?.find(
    (run) => run.runKey === 'BOTHUB_INITIAL_ROLEPLAY_V1',
  );
  if (
    emptySmoke.run !== null ||
    !preservedV1 ||
    preservedV1.state !== 'FAILED' ||
    emptySmoke.history?.some((run) => run.runKey === 'BOTHUB_INITIAL_ROLEPLAY_V3')
  ) {
    throw new Error('V1 evidence was not preserved while V3 remained available for consent.');
  }
  await request(
    '/api/v1/admin/operations/ai-smoke',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ confirmation: 'НЕ СОГЛАСЕН' }),
    },
    400,
  );
  requiredAiModelAvailable = false;
  await request(
    '/api/v1/admin/operations/ai-smoke',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС V3' }),
    },
    503,
  );
  if (aiSmokeRequests !== 0) {
    throw new Error('Missing required model reached the paid Chat Completions endpoint.');
  }
  const blockedSmoke = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    "SELECT COUNT(*) AS v3_runs FROM provider_smoke_runs WHERE run_key = 'BOTHUB_INITIAL_ROLEPLAY_V3';",
  ]);
  if (!blockedSmoke.includes('"v3_runs": 0')) {
    throw new Error('Model preflight failure consumed the immutable V3 run key.');
  }
  requiredAiModelAvailable = true;
  const smoke = await request(
    '/api/v1/admin/operations/ai-smoke',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС V3' }),
    },
    201,
  );
  if (
    smoke.run?.state !== 'COMPLETED' ||
    smoke.run.alreadyAttempted !== false ||
    typeof smoke.run.output !== 'string' ||
    smoke.run.output.length === 0 ||
    smoke.run.inputTokens !== 240 ||
    smoke.run.outputTokens !== 12 ||
    smoke.run.providerReportedCostMicros !== 200 ||
    smoke.run.conservativeCostMicros < 20_000 ||
    aiSmokeRequests !== 1
  ) {
    throw new Error('One-time provider smoke accounting is inconsistent.');
  }
  const repeatedSmoke = await request(
    '/api/v1/admin/operations/ai-smoke',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС V3' }),
    },
    200,
  );
  if (
    repeatedSmoke.run?.state !== 'COMPLETED' ||
    repeatedSmoke.run.alreadyAttempted !== true ||
    'output' in repeatedSmoke.run ||
    aiSmokeRequests !== 1
  ) {
    throw new Error('Repeated provider smoke caused another paid provider request.');
  }
  const smokeAudit = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT state, LENGTH(output_sha256) AS output_hash_length,
       output_length, error_code,
       (SELECT COUNT(*) FROM audit_logs WHERE target_id = run_key) AS audit_events
     FROM provider_smoke_runs WHERE run_key = 'BOTHUB_INITIAL_ROLEPLAY_V3';`,
  ]);
  for (const expected of [
    '"state": "COMPLETED"',
    '"output_hash_length": 64',
    '"error_code": null',
    '"audit_events": 2',
  ]) {
    if (!smokeAudit.includes(expected)) {
      throw new Error(`Provider smoke audit is missing ${expected}.`);
    }
  }

  await request('/api/v1/admin/operations/model-evals', { headers }, 403);
  await request('/api/v1/admin/operations/model-evals', { headers: adminHeaders }, 403);
  const emptyModelEvals = await request(
    '/api/v1/admin/operations/model-evals',
    { headers: ownerHeaders },
    200,
  );
  if (!Array.isArray(emptyModelEvals.items) || emptyModelEvals.items.length !== 0) {
    throw new Error('Roleplay model eval list exposed unrelated historical smoke rows.');
  }
  await request(
    '/api/v1/admin/operations/model-evals',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        modelProfileId: 'provider-model-id-must-not-be-accepted',
        confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС НА ПРОВЕРКУ МОДЕЛИ',
      }),
    },
    409,
  );
  if (modelEvalRequests !== 0) {
    throw new Error('Unknown stable model profile reached the paid provider endpoint.');
  }
  const modelEval = await request(
    '/api/v1/admin/operations/model-evals',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        modelProfileId: 'velora-free-roleplay',
        confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС НА ПРОВЕРКУ МОДЕЛИ',
      }),
    },
    201,
  );
  if (
    modelEval.run?.modelProfileId !== 'velora-free-roleplay' ||
    modelEval.run.displayName !== 'Lunaris Roleplay' ||
    modelEval.run.model !== 'l3-lunaris-8b' ||
    modelEval.run.state !== 'COMPLETED' ||
    modelEval.run.alreadyAttempted !== false ||
    'output' in modelEval.run ||
    modelEvalRequests !== 1
  ) {
    throw new Error('Bounded roleplay model eval result is inconsistent.');
  }
  const repeatedModelEval = await request(
    '/api/v1/admin/operations/model-evals',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        modelProfileId: 'velora-free-roleplay',
        confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС НА ПРОВЕРКУ МОДЕЛИ',
      }),
    },
    200,
  );
  if (repeatedModelEval.run?.alreadyAttempted !== true || modelEvalRequests !== 1) {
    throw new Error('Repeated model eval caused another paid provider request.');
  }
  await request('/api/v1/admin/operations/model-benchmarks', { headers }, 403);
  await request('/api/v1/admin/operations/model-benchmarks', { headers: adminHeaders }, 403);
  const emptyBenchmarks = await request(
    '/api/v1/admin/operations/model-benchmarks',
    { headers: ownerHeaders },
    200,
  );
  if (!Array.isArray(emptyBenchmarks.items) || emptyBenchmarks.items.length !== 0) {
    throw new Error('Roleplay benchmark list was not initially empty.');
  }
  const benchmark = await request(
    '/api/v1/admin/operations/model-benchmarks',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        modelProfileId: 'velora-free-roleplay',
        confirmation: 'ПОТРАТИТЬ 7 ЗАПРОСОВ НА RP-БЕНЧМАРК',
      }),
    },
    201,
  );
  if (
    benchmark.run?.state !== 'AWAITING_REVIEW' ||
    benchmark.run.modelProfileId !== 'velora-free-roleplay' ||
    benchmark.run.samples?.length !== 7 ||
    benchmark.run.completedScenarioCount !== 7 ||
    benchmark.run.alreadyAttempted !== false ||
    benchmarkRequests !== 7 ||
    benchmark.run.samples.some(
      (sample) =>
        typeof sample.output !== 'string' ||
        sample.output.length < 12 ||
        sample.outputSha256.length !== 64,
    )
  ) {
    throw new Error('Roleplay benchmark did not return seven transient review samples.');
  }
  const repeatedBenchmark = await request(
    '/api/v1/admin/operations/model-benchmarks',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        modelProfileId: 'velora-free-roleplay',
        confirmation: 'ПОТРАТИТЬ 7 ЗАПРОСОВ НА RP-БЕНЧМАРК',
      }),
    },
    200,
  );
  if (
    repeatedBenchmark.run?.alreadyAttempted !== true ||
    'samples' in repeatedBenchmark.run ||
    benchmarkRequests !== 7
  ) {
    throw new Error('Repeated roleplay benchmark caused provider spend or exposed stored prose.');
  }
  const benchmarkScores = Object.fromEntries(
    [
      'character_adherence',
      'persona_adherence',
      'narrative_quality',
      'russian_quality',
      'english_quality',
      'emotional_continuity',
      'memory_use',
      'lore_use',
      'formatting',
      'repetition_control',
      'verbosity_control',
      'latency',
      'cost',
      'consensual_mature_fictional_compatibility',
    ].map((criterion) => [criterion, 4]),
  );
  const reviewedBenchmark = await request(
    `/api/v1/admin/operations/model-benchmarks/${encodeURIComponent(benchmark.run.runKey)}/review`,
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ decision: 'APPROVED', scores: benchmarkScores }),
    },
    200,
  );
  if (
    reviewedBenchmark.run?.state !== 'APPROVED' ||
    Object.keys(reviewedBenchmark.run.scores ?? {}).length !== 14
  ) {
    throw new Error('Owner benchmark review did not persist all required scores.');
  }
  await request(
    `/api/v1/admin/operations/model-benchmarks/${encodeURIComponent(benchmark.run.runKey)}/review`,
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ decision: 'REJECTED', scores: benchmarkScores }),
    },
    409,
  );
  const benchmarkAudit = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT state, completed_scenario_count,
       json_array_length(scenario_evidence_json) AS evidence_count,
       instr(scenario_evidence_json, 'Архив') AS leaked_output,
       (SELECT COUNT(*) FROM roleplay_benchmark_scores scores
         WHERE scores.run_key = roleplay_benchmark_runs.run_key) AS score_count
     FROM roleplay_benchmark_runs
     WHERE run_key = 'BOTHUB_RP_BENCH_V1_velora-free-roleplay';`,
  ]);
  for (const expected of [
    '"state": "APPROVED"',
    '"completed_scenario_count": 7',
    '"evidence_count": 7',
    '"leaked_output": 0',
    '"score_count": 14',
  ]) {
    if (!benchmarkAudit.includes(expected)) {
      throw new Error(`Roleplay benchmark audit is missing ${expected}.`);
    }
  }
  await request('/api/v1/admin/operations/models', { headers }, 403);
  await request('/api/v1/admin/operations/models', { headers: adminHeaders }, 403);
  const modelControls = await request(
    '/api/v1/admin/operations/models',
    { headers: ownerHeaders },
    200,
  );
  if (
    modelControls.defaultModelProfileId !== 'velora-balanced' ||
    modelControls.items?.length !== 5 ||
    !['velora-deepseek-v3-0324'].every((id) =>
      modelControls.items.some((item) => item.modelProfileId === id),
    ) ||
    !modelControls.items.every(
      (item) =>
        item.health?.windowHours === 24 &&
        typeof item.health.requestCount === 'number' &&
        Array.isArray(item.health.recentErrors),
    )
  ) {
    throw new Error('Owner model controls or health metrics are incomplete.');
  }
  const updatedModel = await request(
    '/api/v1/admin/operations/models/velora-free-roleplay',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        displayName: 'Qwen RP Preview',
        descriptionRu: 'Экономичная ролевая модель для знакомства с Velora.',
        isDefault: true,
      }),
    },
    200,
  );
  if (!updatedModel.isDefault || updatedModel.displayName !== 'Qwen RP Preview') {
    throw new Error('Owner model update did not persist the requested fields.');
  }
  const updatedCatalog = await request('/api/v1/conversations/models/catalog', { headers }, 200);
  if (
    updatedCatalog.items?.find((item) => item.id === 'velora-free-roleplay')?.displayName !==
    'Qwen RP Preview'
  ) {
    throw new Error('Runtime model catalog did not use the D1 override.');
  }
  await request(
    '/api/v1/admin/operations/models/velora-free-context',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ fallbackIds: ['velora-free-roleplay'] }),
    },
    409,
  );
  await request(
    '/api/v1/admin/operations/models/velora-balanced',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ isDefault: true }),
    },
    200,
  );
  await request(
    '/api/v1/admin/operations/models/velora-free-context',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ enabled: false }),
    },
    200,
  );
  const catalogWithDisabledModel = await request(
    '/api/v1/conversations/models/catalog',
    { headers },
    200,
  );
  if (
    catalogWithDisabledModel.items?.find((item) => item.id === 'velora-free-context')?.available !==
    false
  ) {
    throw new Error('A disabled owner model remained selectable in the catalog.');
  }
  await request(
    '/api/v1/admin/operations/models/velora-free-context',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ enabled: true }),
    },
    200,
  );
  await request(
    '/api/v1/admin/operations/models/velora-free-roleplay',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        displayName: 'Lunaris Roleplay',
        descriptionRu:
          'Очень экономичная ролевая модель для коротких и средних сцен. Память Velora помогает сохранять важный контекст истории.',
      }),
    },
    200,
  );
  const modelEvalAudit = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT state, LENGTH(output_sha256) AS output_hash_length, output_length,
       (SELECT COUNT(*) FROM audit_logs WHERE target_id = run_key) AS audit_events
     FROM provider_smoke_runs
     WHERE run_key = 'BOTHUB_ROLEPLAY_EVAL_V3_velora-free-roleplay';`,
  ]);
  for (const expected of [
    '"state": "COMPLETED"',
    '"output_hash_length": 64',
    '"audit_events": 2',
  ]) {
    if (!modelEvalAudit.includes(expected)) {
      throw new Error(`Roleplay model eval audit is missing ${expected}.`);
    }
  }
  await request('/api/v1/admin/feature-flags', { headers: adminHeaders }, 403);
  const ownerFlags = await request('/api/v1/admin/feature-flags', { headers: ownerHeaders }, 200);
  if (
    ownerFlags.items.length !== 5 ||
    !ownerFlags.items.some((flag) => flag.key === 'public_reviews') ||
    !ownerFlags.items.some((flag) => flag.key === 'groups')
  ) {
    throw new Error('Owner feature flag catalog is incomplete.');
  }
  await request(
    '/api/v1/admin/feature-flags/public_reviews',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ enabled: true, rolloutPercent: 101 }),
    },
    400,
  );
  await request(
    '/api/v1/admin/feature-flags/public_reviews',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ enabled: false, rolloutPercent: 0 }),
    },
    200,
  );
  const disabledFlags = await request('/api/v1/feature-flags', { headers }, 200);
  if (disabledFlags.flags.public_reviews !== false) {
    throw new Error('Feature flag change did not take effect without redeploy.');
  }
  const disabledReviewResponse = await request(
    '/api/v1/discovery/not-a-character/reviews',
    { headers },
    403,
  );
  if (disabledReviewResponse.error?.code !== 'FEATURE_DISABLED') {
    throw new Error('Disabled public reviews were not enforced server-side.');
  }
  await request(
    '/api/v1/admin/feature-flags/public_reviews',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ enabled: true, rolloutPercent: 100 }),
    },
    200,
  );

  await request('/api/v1/admin/staff', { headers: adminHeaders }, 403);
  await request(
    '/api/v1/admin/staff',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        telegramId: String(Number(telegramId) + 1),
        role: 'MODERATOR',
      }),
    },
    201,
  );
  const appointedModerator = await request('/api/v1/me', { headers: reporterHeaders }, 200);
  if (appointedModerator.role !== 'MODERATOR') {
    throw new Error('Owner staff appointment did not update server-side RBAC.');
  }
  const moderatorUsers = await request(
    '/api/v1/admin/moderation/users',
    {
      headers: reporterHeaders,
    },
    200,
  );
  if (
    !moderatorUsers.items.some((item) => item.id === userId) ||
    moderatorUsers.items.some((item) => [ownerId, adminId, reporterId].includes(item.id))
  ) {
    throw new Error('Moderator user directory ignored the protected-role visibility boundary.');
  }
  const moderatorCharacters = await request(
    '/api/v1/admin/moderation/characters',
    {
      headers: reporterHeaders,
    },
    200,
  );
  if (moderatorCharacters.items.some((item) => item.id === opaqueCharacterId)) {
    throw new Error('Moderator character directory exposed a protected creator.');
  }
  await request(
    `/api/v1/admin/moderation/users/${userId}/state`,
    {
      method: 'PATCH',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({ state: 'BANNED' }),
    },
    200,
  );
  await request(
    `/api/v1/admin/moderation/users/${userId}/state`,
    {
      method: 'PATCH',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({ state: 'ACTIVE' }),
    },
    200,
  );
  await request(
    `/api/v1/admin/moderation/users/${ownerId}/state`,
    {
      method: 'PATCH',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({ state: 'BANNED' }),
    },
    403,
  );
  await request('/api/v1/admin/staff', { headers: reporterHeaders }, 403);
  const staff = await request('/api/v1/admin/staff', { headers: ownerHeaders }, 200);
  if (
    staff.items.length !== 1 ||
    staff.items[0]?.telegramId !== String(Number(telegramId) + 1) ||
    staff.items[0]?.role !== 'MODERATOR'
  ) {
    throw new Error('Owner staff catalog is incomplete or exposes an inconsistent role.');
  }
  await request(
    `/api/v1/admin/staff/${String(Number(telegramId) + 1)}`,
    {
      method: 'DELETE',
      headers: { ...ownerHeaders, 'x-csrf-token': ownerCsrfToken },
    },
    200,
  );
  const revokedModerator = await request('/api/v1/me', { headers: reporterHeaders }, 200);
  if (revokedModerator.role !== 'USER' || revokedModerator.plan !== 'FREE') {
    throw new Error('Staff revocation or expiration of non-renewing plan access is inconsistent.');
  }
  const staffAfterRevoke = await request('/api/v1/admin/staff', { headers: ownerHeaders }, 200);
  if (staffAfterRevoke.items.length !== 0) {
    throw new Error('Revoked moderator remained in the active owner staff catalog.');
  }

  const packs = await request('/api/v1/billing/packs', { headers }, 200);
  if (
    packs.paymentsEnabled !== true ||
    packs.recurringPayments !== false ||
    packs.currency !== 'XTR' ||
    packs.items[0]?.code !== 'fixture-pack'
  ) {
    throw new Error('One-time Stars pack catalog is inconsistent.');
  }
  await request(
    '/api/v1/billing/invoices',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        packCode: 'fixture-pack',
        termsAccepted: false,
        idempotencyKey: `invoice-invalid:${randomUUID()}`,
      }),
    },
    400,
  );
  await request(
    '/api/v1/admin/billing/packs',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        code: 'forbidden-pack',
        displayName: 'Forbidden',
        description: 'Must not be created by a regular user.',
        starsAmount: 1,
        creditAmountMicros: 1,
      }),
    },
    403,
  );
  await request('/api/v1/admin/billing/access-packs', { headers }, 403);
  await request('/api/v1/admin/billing/plans', { headers }, 403);
  const ownerPack = await request(
    '/api/v1/admin/billing/packs',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        code: ownerPackCode,
        displayName: 'Owner test pack',
        description: 'Inactive package for owner access regression.',
        starsAmount: 75,
        creditAmountMicros: 500000,
        active: false,
        sortOrder: 99,
      }),
    },
    201,
  );
  if (ownerPack.active !== false) throw new Error('Owner pack ignored its inactive safety state.');
  const activatedOwnerPack = await request(
    `/api/v1/admin/billing/packs/${ownerPackCode}`,
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ active: true, starsAmount: 80 }),
    },
    200,
  );
  if (activatedOwnerPack.active !== true || activatedOwnerPack.starsAmount !== 80) {
    throw new Error('Owner could not safely configure a one-time Stars pack.');
  }
  const ownerPacks = await request('/api/v1/admin/billing/packs', { headers: ownerHeaders }, 200);
  if (!ownerPacks.items.some((item) => item.code === ownerPackCode)) {
    throw new Error('Owner-configured pack is missing from the administrative catalog.');
  }
  await request(
    `/api/v1/admin/billing/packs/${ownerPackCode}`,
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ active: false }),
    },
    200,
  );
  const ownerAccessPack = await request(
    '/api/v1/admin/billing/access-packs',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        code: accessPackCode,
        displayName: 'Plus на 30 дней',
        description: 'Разовый доступ Plus без продления.',
        starsAmount: 120,
        planCode: 'PLUS',
        durationDays: 30,
        active: true,
        sortOrder: 10,
      }),
    },
    201,
  );
  if (
    ownerAccessPack.planCode !== 'PLUS' ||
    ownerAccessPack.durationDays !== 30 ||
    ownerAccessPack.recurring !== false
  ) {
    throw new Error('Owner access-pack configuration is inconsistent.');
  }
  const ownerPlans = await request('/api/v1/admin/billing/plans', { headers: ownerHeaders }, 200);
  const plusPlan = ownerPlans.items.find((item) => item.code === 'PLUS');
  if (!plusPlan || !plusPlan.entitlements.modelProfiles.includes('CREATIVE')) {
    throw new Error('Owner plan catalog is missing the typed Plus entitlements.');
  }
  const publicPlans = await request('/api/v1/billing/plans', { headers }, 200);
  const publicPlusPlan = publicPlans.items.find((item) => item.code === 'PLUS');
  if (
    !publicPlusPlan ||
    publicPlusPlan.entitlements.characterLimit !== plusPlan.entitlements.characterLimit
  ) {
    throw new Error('User pricing catalog does not expose the configured plan benefits.');
  }
  const publicAccessPacks = await request('/api/v1/billing/access-packs', { headers }, 200);
  const publicAccessPack = publicAccessPacks.items.find((item) => item.code === accessPackCode);
  if (
    !publicAccessPack ||
    publicAccessPack.starsAmount !== 120 ||
    publicAccessPack.recurring !== false
  ) {
    throw new Error('User pricing catalog does not expose the configured one-time Stars pack.');
  }
  const updatedPlusPlan = await request(
    '/api/v1/admin/billing/plans/PLUS',
    {
      method: 'PATCH',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({ displayName: 'Plus' }),
    },
    200,
  );
  if (updatedPlusPlan.displayName !== 'Plus') {
    throw new Error('Owner plan configuration update did not persist.');
  }
  await request('/api/v1/admin/billing/user-grants', { headers }, 403);
  const ownerGrantKey = `owner-user-grant:${randomUUID()}`;
  const ownerGrant = await request(
    '/api/v1/admin/billing/user-grants',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        targetId: String(Number(telegramId) + 3),
        planCode: 'PRO',
        durationDays: 30,
        creditAmountMicros: 1_000_000,
        reason: 'Owner grant integration regression',
        idempotencyKey: ownerGrantKey,
      }),
    },
    201,
  );
  if (
    ownerGrant.target.id !== ownerId ||
    ownerGrant.planCode !== 'PRO' ||
    ownerGrant.creditAmountMicros !== 1_000_000 ||
    ownerGrant.alreadyApplied !== false
  ) {
    throw new Error('Owner grant by Telegram ID returned an inconsistent result.');
  }
  const repeatedOwnerGrant = await request(
    '/api/v1/admin/billing/user-grants',
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        targetId: String(Number(telegramId) + 3),
        planCode: 'PRO',
        durationDays: 30,
        creditAmountMicros: 1_000_000,
        reason: 'Owner grant integration regression',
        idempotencyKey: ownerGrantKey,
      }),
    },
    200,
  );
  if (repeatedOwnerGrant.alreadyApplied !== true) {
    throw new Error('Owner grant idempotency replay was not recognized.');
  }
  const ownerAfterGrant = await request('/api/v1/me', { headers: ownerHeaders }, 200);
  if (ownerAfterGrant.plan !== 'PRO' || ownerAfterGrant.creditBalanceMicros !== 1_000_000) {
    throw new Error('Granted owner plan or credits did not become effective.');
  }
  const recentOwnerGrants = await request(
    '/api/v1/admin/billing/user-grants',
    { headers: ownerHeaders },
    200,
  );
  if (!recentOwnerGrants.items.some((item) => item.id === ownerGrant.id)) {
    throw new Error('Owner grant is missing from the audit-oriented grant list.');
  }
  await request(
    `/api/v1/admin/billing/user-grants/${ownerGrant.id}/access`,
    {
      method: 'DELETE',
      headers: { ...ownerHeaders, 'x-csrf-token': ownerCsrfToken },
    },
    200,
  );
  const ownerAfterRevoke = await request('/api/v1/me', { headers: ownerHeaders }, 200);
  if (ownerAfterRevoke.plan !== 'FREE' || ownerAfterRevoke.creditBalanceMicros !== 1_000_000) {
    throw new Error('Plan revocation incorrectly removed owner credits or left access active.');
  }
  const invoiceKey = `invoice:${randomUUID()}`;
  const invoice = await request(
    '/api/v1/billing/invoices',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        packCode: 'fixture-pack',
        termsAccepted: true,
        idempotencyKey: invoiceKey,
      }),
    },
    201,
  );
  if (
    invoice.recurring !== false ||
    invoice.starsAmount !== 50 ||
    invoice.creditAmountMicros !== 250000 ||
    invoice.invoiceUrl !== 'https://t.me/$integration-invoice'
  ) {
    throw new Error('Created Stars invoice does not match the configured one-time pack.');
  }
  const repeatedInvoice = await request(
    '/api/v1/billing/invoices',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        packCode: 'fixture-pack',
        termsAccepted: true,
        idempotencyKey: invoiceKey,
      }),
    },
    200,
  );
  if (repeatedInvoice.id !== invoice.id) throw new Error('Invoice creation is not idempotent.');
  const invoiceRequest = telegramRequests.find((item) => item.method === 'createInvoiceLink');
  const invoicePayload = invoiceRequest?.body?.payload;
  if (typeof invoicePayload !== 'string') throw new Error('Telegram invoice payload was not sent.');
  const telegramUserId = Number(telegramId);
  const telegramChargeId = `telegram-charge-${randomUUID()}`;
  const paymentUpdateBase = 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
  const englishTelegramUserId = 1_000_000_000 + Math.floor(Math.random() * 900_000_000);
  const commandRepliesBefore = telegramRequests.filter(
    (item) => item.method === 'sendMessage',
  ).length;
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase - 1,
        message: {
          message_id: 900000,
          from: {
            id: englishTelegramUserId,
            first_name: 'English',
            language_code: 'en-US',
          },
          chat: { id: englishTelegramUserId, type: 'private' },
          text: '/start',
        },
      }),
    },
    200,
  );
  const commandReplies = telegramRequests.filter((item) => item.method === 'sendMessage');
  const englishReply = commandReplies.at(-1)?.body;
  if (
    commandReplies.length !== commandRepliesBefore + 1 ||
    !englishReply?.text?.includes('Welcome to VeloraAI') ||
    englishReply?.reply_markup?.inline_keyboard?.[0]?.[0]?.text !== 'Open VeloraAI'
  ) {
    throw new Error('English Telegram locale did not produce a localized command reply.');
  }
  const productionSmokeMarker = `velora_smoke_${randomUUID().replaceAll('-', '')}`;
  const productionSmokeHash = hash(productionSmokeMarker);
  const forgedSmokeMarker = `velora_smoke_${randomUUID().replaceAll('-', '')}`;
  const forgedSmokeHash = hash(forgedSmokeMarker);
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase - 3,
        message: {
          message_id: 899998,
          from: { id: englishTelegramUserId, first_name: 'English', language_code: 'en' },
          chat: { id: englishTelegramUserId, type: 'private' },
          text: `/start ${forgedSmokeMarker}`,
        },
      }),
    },
    200,
  );
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase - 2,
        message: {
          message_id: 899999,
          from: { id: 1040929628, first_name: 'Owner', language_code: 'ru' },
          chat: { id: 1040929628, type: 'private' },
          text: `/start ${productionSmokeMarker}`,
        },
      }),
    },
    200,
  );
  const productionSmokeAudit = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT a.action, a.target_type, a.target_id, u.telegram_id AS telegramId, u.role,
       instr(a.metadata_json, '${productionSmokeMarker}') AS leaked_marker
     FROM audit_logs a JOIN users u ON u.id = a.actor_id
     WHERE a.action = 'TELEGRAM_PRODUCTION_SMOKE'
       AND a.target_id IN ('${productionSmokeHash}', '${forgedSmokeHash}');`,
  ]);
  for (const expected of [
    '"action": "TELEGRAM_PRODUCTION_SMOKE"',
    '"target_type": "TELEGRAM_WEBHOOK"',
    `"target_id": "${productionSmokeHash}"`,
    '"telegramId": "1040929628"',
    '"role": "OWNER"',
    '"leaked_marker": 0',
  ]) {
    if (!productionSmokeAudit.includes(expected)) {
      throw new Error(`Owner production smoke audit is missing ${expected}.`);
    }
  }
  if (productionSmokeAudit.includes(forgedSmokeHash)) {
    throw new Error('A non-owner created production smoke evidence.');
  }
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase,
        pre_checkout_query: {
          id: 'checkout-valid',
          from: { id: telegramUserId, first_name: 'Integration' },
          currency: 'XTR',
          total_amount: 50,
          invoice_payload: invoicePayload,
        },
      }),
    },
    200,
  );
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase + 1,
        pre_checkout_query: {
          id: 'checkout-forged',
          from: { id: telegramUserId, first_name: 'Integration' },
          currency: 'XTR',
          total_amount: 51,
          invoice_payload: invoicePayload,
        },
      }),
    },
    200,
  );
  const checkoutAnswers = telegramRequests.filter(
    (item) => item.method === 'answerPreCheckoutQuery',
  );
  if (checkoutAnswers[0]?.body?.ok !== true || checkoutAnswers[1]?.body?.ok !== false) {
    throw new Error('Pre-checkout did not distinguish the exact invoice from a forged amount.');
  }
  const successfulPaymentUpdate = {
    message_id: 900003,
    from: { id: telegramUserId, first_name: 'Integration' },
    chat: { id: telegramUserId, type: 'private' },
    successful_payment: {
      currency: 'XTR',
      total_amount: 50,
      invoice_payload: invoicePayload,
      telegram_payment_charge_id: telegramChargeId,
      provider_payment_charge_id: '',
    },
  };
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({ update_id: paymentUpdateBase + 2, message: successfulPaymentUpdate }),
    },
    200,
  );
  const balanceAfterPurchase = await request('/api/v1/me', { headers }, 200);
  if (balanceAfterPurchase.creditBalanceMicros !== 1250000) {
    throw new Error('Successful Stars payment did not grant the exact configured credits.');
  }
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({ update_id: paymentUpdateBase + 3, message: successfulPaymentUpdate }),
    },
    200,
  );
  const balanceAfterDuplicate = await request('/api/v1/me', { headers }, 200);
  if (balanceAfterDuplicate.creditBalanceMicros !== 1250000) {
    throw new Error('Duplicate Telegram charge granted credits twice.');
  }
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase + 4,
        message: {
          ...successfulPaymentUpdate,
          message_id: 900004,
          successful_payment: {
            ...successfulPaymentUpdate.successful_payment,
            telegram_payment_charge_id: `telegram-charge-recurring-${randomUUID()}`,
            is_recurring: true,
          },
        },
      }),
    },
    409,
  );
  const balanceAfterRecurringForgery = await request('/api/v1/me', { headers }, 200);
  if (balanceAfterRecurringForgery.creditBalanceMicros !== 1250000) {
    throw new Error('Forged recurring payment changed the one-time credit balance.');
  }
  const refundedPaymentUpdate = {
    message_id: 900005,
    from: { id: telegramUserId, first_name: 'Integration' },
    chat: { id: telegramUserId, type: 'private' },
    refunded_payment: {
      currency: 'XTR',
      total_amount: 50,
      invoice_payload: invoicePayload,
      telegram_payment_charge_id: telegramChargeId,
      provider_payment_charge_id: '',
    },
  };
  await request('/api/v1/admin/billing/payments', { headers }, 403);
  await request(
    `/api/v1/admin/billing/payments/${invoice.id}/refund`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        reason: 'Forbidden regular-user refund',
        idempotencyKey: `refund-forbidden:${randomUUID()}`,
      }),
    },
    403,
  );
  const ownerPayments = await request(
    '/api/v1/admin/billing/payments',
    { headers: ownerHeaders },
    200,
  );
  if (!ownerPayments.items.some((item) => item.id === invoice.id)) {
    throw new Error('Owner payment catalog omitted the completed Stars payment.');
  }
  const refundKey = `owner-refund:${randomUUID()}`;
  const ownerRefund = await request(
    `/api/v1/admin/billing/payments/${invoice.id}/refund`,
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        reason: 'Owner refund integration regression',
        idempotencyKey: refundKey,
      }),
    },
    201,
  );
  if (ownerRefund.state !== 'CONFIRMED' || ownerRefund.alreadySubmitted !== false) {
    throw new Error('Owner Stars refund did not reach a confirmed state.');
  }
  const repeatedOwnerRefund = await request(
    `/api/v1/admin/billing/payments/${invoice.id}/refund`,
    {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'content-type': 'application/json',
        'x-csrf-token': ownerCsrfToken,
      },
      body: JSON.stringify({
        reason: 'Owner refund integration regression',
        idempotencyKey: refundKey,
      }),
    },
    200,
  );
  if (repeatedOwnerRefund.state !== 'CONFIRMED' || repeatedOwnerRefund.alreadySubmitted !== true) {
    throw new Error('Owner Stars refund replay was not idempotent.');
  }
  const refundCalls = telegramRequests.filter((item) => item.method === 'refundStarPayment');
  if (
    refundCalls.length !== 1 ||
    refundCalls[0]?.body?.user_id !== telegramUserId ||
    refundCalls[0]?.body?.telegram_payment_charge_id !== telegramChargeId
  ) {
    throw new Error('Owner refund emitted an incorrect or duplicate Telegram API request.');
  }
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({ update_id: paymentUpdateBase + 5, message: refundedPaymentUpdate }),
    },
    200,
  );
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({ update_id: paymentUpdateBase + 6, message: refundedPaymentUpdate }),
    },
    200,
  );
  const balanceAfterRefund = await request('/api/v1/me', { headers }, 200);
  if (balanceAfterRefund.creditBalanceMicros !== 1000000) {
    throw new Error('Refund reversal was missing or duplicated.');
  }
  const paymentHistory = await request('/api/v1/billing/payments', { headers }, 200);
  if (paymentHistory.items[0]?.state !== 'REFUNDED') {
    throw new Error('Refunded payment state is not visible to its owner.');
  }
  await request(
    '/api/v1/settings',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ generationProfile: 'CREATIVE' }),
    },
    403,
  );

  const accessInvoiceKey = `access-invoice:${randomUUID()}`;
  const accessInvoice = await request(
    '/api/v1/billing/access-invoices',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        packCode: accessPackCode,
        termsAccepted: true,
        idempotencyKey: accessInvoiceKey,
      }),
    },
    201,
  );
  if (
    accessInvoice.kind !== 'PLAN_ACCESS' ||
    accessInvoice.planCode !== 'PLUS' ||
    accessInvoice.accessDurationDays !== 30 ||
    accessInvoice.recurring !== false
  ) {
    throw new Error('One-time plan access invoice is inconsistent.');
  }
  const accessInvoiceRequest = telegramRequests
    .filter((item) => item.method === 'createInvoiceLink')
    .at(-1);
  const accessInvoicePayload = accessInvoiceRequest?.body?.payload;
  if (typeof accessInvoicePayload !== 'string') {
    throw new Error('Telegram access invoice payload was not sent.');
  }
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase + 20,
        pre_checkout_query: {
          id: 'checkout-access-valid',
          from: { id: telegramUserId, first_name: 'Integration' },
          currency: 'XTR',
          total_amount: 120,
          invoice_payload: accessInvoicePayload,
        },
      }),
    },
    200,
  );
  const accessChargeId = `telegram-access-${randomUUID()}`;
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase + 21,
        message: {
          message_id: 900021,
          from: { id: telegramUserId, first_name: 'Integration' },
          chat: { id: telegramUserId, type: 'private' },
          successful_payment: {
            currency: 'XTR',
            total_amount: 120,
            invoice_payload: accessInvoicePayload,
            telegram_payment_charge_id: accessChargeId,
            provider_payment_charge_id: '',
          },
        },
      }),
    },
    200,
  );
  const plusMe = await request('/api/v1/me', { headers }, 200);
  if (
    plusMe.plan !== 'PLUS' ||
    plusMe.planDisplayName !== 'Plus' ||
    typeof plusMe.planAccessUntil !== 'number' ||
    !plusMe.planEntitlements.modelProfiles.includes('CREATIVE')
  ) {
    throw new Error('Paid non-renewing plan access was not reflected by /me.');
  }
  const grantedAccessHistory = await request('/api/v1/billing/payments', { headers }, 200);
  const grantedAccessPayment = grantedAccessHistory.items.find(
    (item) => item.id === accessInvoice.id,
  );
  if (
    grantedAccessPayment?.state !== 'GRANTED' ||
    grantedAccessPayment.validUntil !== plusMe.planAccessUntil ||
    grantedAccessPayment.autoRenew !== false
  ) {
    throw new Error(
      `Fixed-term access history does not expose GRANTED, validUntil and autoRenew=false: ${JSON.stringify(grantedAccessPayment)}`,
    );
  }
  const secondAccessInvoice = await request(
    '/api/v1/billing/access-invoices',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        packCode: accessPackCode,
        termsAccepted: true,
        idempotencyKey: `access-invoice:${randomUUID()}`,
      }),
    },
    201,
  );
  const secondAccessPayload = telegramRequests
    .filter((item) => item.method === 'createInvoiceLink')
    .at(-1)?.body?.payload;
  if (typeof secondAccessPayload !== 'string') {
    throw new Error('Second Telegram access invoice payload was not sent.');
  }
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase + 22,
        pre_checkout_query: {
          id: 'checkout-access-second',
          from: { id: telegramUserId, first_name: 'Integration' },
          currency: 'XTR',
          total_amount: secondAccessInvoice.starsAmount,
          invoice_payload: secondAccessPayload,
        },
      }),
    },
    200,
  );
  const secondAccessChargeId = `telegram-access-${randomUUID()}`;
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase + 23,
        message: {
          message_id: 900023,
          from: { id: telegramUserId, first_name: 'Integration' },
          chat: { id: telegramUserId, type: 'private' },
          successful_payment: {
            currency: 'XTR',
            total_amount: secondAccessInvoice.starsAmount,
            invoice_payload: secondAccessPayload,
            telegram_payment_charge_id: secondAccessChargeId,
            provider_payment_charge_id: '',
          },
        },
      }),
    },
    200,
  );
  const stackedPlusMe = await request('/api/v1/me', { headers }, 200);
  if (stackedPlusMe.planAccessUntil !== plusMe.planAccessUntil + 30 * 86_400_000) {
    throw new Error(
      `Repeated one-time access purchase did not extend the same plan: ${JSON.stringify({ first: plusMe.planAccessUntil, stacked: stackedPlusMe.planAccessUntil })}`,
    );
  }
  const firstAccessRefund = {
    currency: 'XTR',
    total_amount: 120,
    invoice_payload: accessInvoicePayload,
    telegram_payment_charge_id: accessChargeId,
    provider_payment_charge_id: '',
  };
  const repliesBeforeWebhookOnlyRefund = telegramRequests.filter(
    (item) => item.method === 'sendMessage',
  ).length;
  await request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'integration-webhook-secret',
      },
      body: JSON.stringify({
        update_id: paymentUpdateBase + 24,
        message: {
          message_id: 900024,
          from: { id: telegramUserId, first_name: 'Integration' },
          chat: { id: telegramUserId, type: 'private' },
          refunded_payment: firstAccessRefund,
        },
      }),
    },
    200,
  );
  const repliesAfterWebhookOnlyRefund = telegramRequests.filter(
    (item) => item.method === 'sendMessage',
  ).length;
  if (repliesAfterWebhookOnlyRefund !== repliesBeforeWebhookOnlyRefund + 1) {
    throw new Error('Webhook-only Stars refund was reversed but not acknowledged to the user.');
  }
  const compactedPlusMe = await request('/api/v1/me', { headers }, 200);
  if (
    compactedPlusMe.plan !== 'PLUS' ||
    compactedPlusMe.planAccessUntil !== plusMe.planAccessUntil
  ) {
    throw new Error('Refund left an artificial gap in stacked one-time access.');
  }

  const persona = await request(
    '/api/v1/personas',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        name: 'Алекс',
        avatarFileId: mediaId,
        personality: 'Спокойная и наблюдательная',
      }),
    },
    201,
  );
  if (typeof persona.id !== 'string' || persona.isDefault !== true) {
    throw new Error('First persona was not created as default.');
  }
  await request(
    `/api/v1/personas/${persona.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ visibility: 'PUBLIC' }),
    },
    409,
  );
  const list = await request('/api/v1/personas', { headers }, 200);
  if (!Array.isArray(list.items) || list.items.length !== 1) {
    throw new Error('Persona list does not contain the created item.');
  }
  const changed = await request(
    `/api/v1/personas/${persona.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ speakingStyle: 'Короткие образные фразы' }),
    },
    200,
  );
  if (changed.speakingStyle !== 'Короткие образные фразы') {
    throw new Error('Persona patch was not persisted.');
  }
  await request(
    `/api/v1/personas/${persona.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const emptyList = await request('/api/v1/personas', { headers }, 200);
  if (!Array.isArray(emptyList.items) || emptyList.items.length !== 0) {
    throw new Error('Deleted persona remains visible.');
  }
  const storyPersona = await request(
    '/api/v1/personas',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        name: 'Алекс',
        shortDescription: '{{user}} исследует архив вместе с {{char}}.',
        personality: 'Спокойная и наблюдательная',
      }),
    },
    201,
  );

  await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `UPDATE file_objects SET moderation_state = 'APPROVED' WHERE id = '${mediaId}';`,
  ]);

  const character = await request(
    '/api/v1/characters',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        name: characterName,
        avatarFileId: mediaId,
        avatarFocalX: 22,
        avatarFocalY: 78,
        tagline: 'Хранитель забытого архива',
        description: 'Хранитель, который знает слишком много забытых историй.',
        personality: 'Спокойный, внимательный и немного ироничный собеседник.',
        scenario: '{{char}} встречает {{user}} у входа в архив.',
        firstMessage: 'Ты всё-таки нашёл дорогу, {{user}}.',
        exampleDialogues: '{{user}}: Я готова, {{char}}.\n{{char}}: Тогда откроем архив.',
        systemInstructions: 'Всегда называй собеседника {{user}} и не выходи из роли.',
        postHistoryInstructions: 'Продолжи сцену для {{user}} без метакомментариев.',
        alternateGreetings: [
          '{{scenario}} Другой путь тоже привёл тебя сюда, {{user}}. Я {{char}}.',
        ],
        language: 'ru',
        contentRating: 'SAFE',
        tags: ['Архив', 'архив', 'Мистика'],
      }),
    },
    201,
  );
  if (
    character.version !== 1 ||
    character.tags.length !== 2 ||
    character.avatarFocalX !== 22 ||
    character.avatarFocalY !== 78
  ) {
    throw new Error('Versioned character or normalized tags were not created.');
  }
  const changedCharacter = await request(
    `/api/v1/characters/${character.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        baseVersion: 1,
        speechStyle: 'Неспешная образная речь',
        avatarFocalX: 31,
        avatarFocalY: 69,
      }),
    },
    200,
  );
  if (
    changedCharacter.version !== 2 ||
    changedCharacter.speechStyle !== 'Неспешная образная речь' ||
    changedCharacter.avatarFocalX !== 31 ||
    changedCharacter.avatarFocalY !== 69
  ) {
    throw new Error('Character version edit was not persisted.');
  }
  const characterGroup = await request(
    '/api/v1/character-groups',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        name: 'Архивная экспедиция',
        avatarFileId: mediaId,
        routingMode: 'MANUAL',
        characterIds: [character.id],
      }),
    },
    201,
  );
  if (
    characterGroup.members.length !== 1 ||
    characterGroup.members[0]?.characterId !== character.id
  ) {
    throw new Error('Character group members were not persisted.');
  }
  const groupList = await request('/api/v1/character-groups', { headers }, 200);
  if (!groupList.items.some((item) => item.id === characterGroup.id)) {
    throw new Error('Created character group is missing from the owner list.');
  }
  const groupConversation = await request(
    `/api/v1/character-groups/${characterGroup.id}/conversations`,
    {
      method: 'POST',
      headers: { ...headers, 'x-csrf-token': csrfToken },
    },
    201,
  );
  const groupConversationDetail = await request(
    `/api/v1/conversations/${groupConversation.conversationId}`,
    { headers },
    200,
  );
  if (
    groupConversationDetail.group?.id !== characterGroup.id ||
    groupConversationDetail.group.activeCharacterId !== character.id ||
    groupConversationDetail.characterName !== characterGroup.name
  ) {
    throw new Error('Group conversation did not expose its stable group snapshot.');
  }
  await request(
    `/api/v1/character-groups/${characterGroup.id}/conversations/${groupConversation.conversationId}/speaker`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ characterId: character.id }),
    },
    200,
  );
  await request(
    `/api/v1/characters/${character.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ baseVersion: 1, goals: 'This stale write must fail.' }),
    },
    409,
  );
  await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        idempotencyKey: `draft-normal:${randomUUID()}`,
      }),
    },
    404,
  );
  await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        characterId: character.id,
        preview: true,
        idempotencyKey: `foreign-draft-preview:${randomUUID()}`,
      }),
    },
    404,
  );
  const previewConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        preview: true,
        idempotencyKey: `draft-preview:${randomUUID()}`,
      }),
    },
    201,
  );
  if (previewConversation.isPreview !== true || !previewConversation.title.startsWith('Тест · ')) {
    throw new Error('Owner draft preview was not explicitly labelled as a private test chat.');
  }
  const previewCharacterProfile = await request(
    `/api/v1/conversations/${previewConversation.id}/character`,
    { headers },
    200,
  );
  if (
    previewCharacterProfile.id !== character.id ||
    typeof previewCharacterProfile.name !== 'string' ||
    typeof previewCharacterProfile.firstMessage !== 'string' ||
    !Array.isArray(previewCharacterProfile.tags) ||
    !Array.isArray(previewCharacterProfile.alternateGreetings) ||
    previewCharacterProfile.isOwner !== true ||
    typeof previewCharacterProfile.estimatedTokens !== 'number' ||
    'alternateGreetingsJson' in previewCharacterProfile
  ) {
    throw new Error('Chat character profile did not expose the owned character it is bound to.');
  }
  await request(
    `/api/v1/conversations/${previewConversation.id}/character`,
    { headers: reporterHeaders },
    404,
  );
  const previewList = await request('/api/v1/conversations', { headers }, 200);
  if (!previewList.items.some((item) => item.id === previewConversation.id && item.isPreview)) {
    throw new Error('Draft preview is missing its test-chat marker in the conversation list.');
  }
  const previewSummary = previewList.items.find((item) => item.id === previewConversation.id);
  if (
    previewList.totalCount !== previewList.items.length ||
    previewSummary?.personaName !== storyPersona.name ||
    previewSummary?.messageCount !== 1 ||
    previewSummary?.characterAvatarFocalX !== 31 ||
    previewSummary?.characterAvatarFocalY !== 69
  ) {
    throw new Error('Conversation list count, persona snapshot, or message count is inconsistent.');
  }
  const searchedPreviewList = await request(
    `/api/v1/conversations?q=${encodeURIComponent('Тест')}&sort=oldest&state=ALL`,
    { headers },
    200,
  );
  if (
    searchedPreviewList.totalCount !== 1 ||
    searchedPreviewList.items[0]?.id !== previewConversation.id
  ) {
    throw new Error('Server-backed conversation search did not return the matching preview chat.');
  }
  const escapedConversationSearch = await request(
    `/api/v1/conversations?q=${encodeURIComponent('%_')}`,
    { headers },
    200,
  );
  if (escapedConversationSearch.totalCount !== 0 || escapedConversationSearch.items.length !== 0) {
    throw new Error('Conversation search treated escaped LIKE metacharacters as wildcards.');
  }
  const archivedPreview = await request(
    `/api/v1/conversations/${previewConversation.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ state: 'ARCHIVED' }),
    },
    200,
  );
  if (archivedPreview.state !== 'ARCHIVED') {
    throw new Error('Conversation was not archived through its supported mutation.');
  }
  const archivedConversationList = await request(
    `/api/v1/conversations?state=ARCHIVED&q=${encodeURIComponent('Тест')}`,
    { headers },
    200,
  );
  if (
    archivedConversationList.totalCount !== 1 ||
    archivedConversationList.items[0]?.id !== previewConversation.id
  ) {
    throw new Error('Archived conversation is missing from the server-backed management view.');
  }
  const restoredPreview = await request(
    `/api/v1/conversations/${previewConversation.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ state: 'ACTIVE' }),
    },
    200,
  );
  if (restoredPreview.state !== 'ACTIVE') {
    throw new Error('Conversation was not restored after archive verification.');
  }
  const previewStats = await request('/api/v1/discovery/creator-stats/me', { headers }, 200);
  if (previewStats.chatsStarted !== 0) {
    throw new Error('Private draft preview polluted public creator chat statistics.');
  }
  const previewCharacterEdit = await request(
    `/api/v1/characters/${character.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        baseVersion: 2,
        firstMessage: 'Этот новый текст не должен менять уже открытый тестовый диалог.',
      }),
    },
    200,
  );
  if (previewCharacterEdit.version !== 3) {
    throw new Error('Character edit after preview creation did not create a new version.');
  }
  const previewMessages = await request(
    `/api/v1/conversations/${previewConversation.id}/messages`,
    { headers },
    200,
  );
  if (previewMessages.items[0]?.content !== `Ты всё-таки нашёл дорогу, ${storyPersona.name}.`) {
    throw new Error('Draft preview did not preserve its character/persona snapshot.');
  }
  const published = await request(
    `/api/v1/characters/${character.id}/publish`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ visibility: 'PUBLIC' }),
    },
    200,
  );
  if (published.publishState !== 'PUBLISHED') throw new Error('Character was not published.');
  const discovery = await request(
    `/api/v1/discovery?q=${encodeURIComponent(characterName)}&tags=%D0%B0%D1%80%D1%85%D0%B8%D0%B2`,
    { headers },
    200,
  );
  if (!Array.isArray(discovery.items) || discovery.items[0]?.id !== character.id) {
    throw new Error('Published character is missing from filtered discovery.');
  }
  if (discovery.items[0]?.avatarFocalX !== 31 || discovery.items[0]?.avatarFocalY !== 69) {
    throw new Error('Published discovery did not preserve the creator-selected focal point.');
  }
  if (discovery.totalCount !== 1) {
    throw new Error('Filtered discovery did not return the exact total result count.');
  }
  const tagCatalogue = await request(
    '/api/v1/discovery/tags/catalog?language=ru&rating=SAFE',
    { headers },
    200,
  );
  if (
    !tagCatalogue.items.some((item) => item.slug === 'архив' && item.usageCount === 1) ||
    !tagCatalogue.items.some((item) => item.slug === 'мистика' && item.usageCount === 1)
  ) {
    throw new Error('The D1-backed discovery tag catalogue or usage counts are incomplete.');
  }
  const includedTagDiscovery = await request(
    `/api/v1/discovery?includeTags=${encodeURIComponent('архив,мистика')}`,
    { headers },
    200,
  );
  if (includedTagDiscovery.totalCount !== 1 || includedTagDiscovery.items[0]?.id !== character.id) {
    throw new Error('Included discovery tags did not require every selected tag.');
  }
  const excludedTagDiscovery = await request(
    `/api/v1/discovery?excludeTags=${encodeURIComponent('мистика')}`,
    { headers },
    200,
  );
  if (
    excludedTagDiscovery.items.some((item) => item.id === character.id) ||
    !excludedTagDiscovery.items.some((item) => item.id === opaqueCharacterId)
  ) {
    throw new Error('Excluded discovery tags did not remove only matching characters.');
  }
  await request(
    `/api/v1/discovery?includeTags=${encodeURIComponent('архив')}&excludeTags=${encodeURIComponent('архив')}`,
    { headers },
    400,
  );
  const arabicCharacter = await request(
    `/api/v1/characters/${character.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ baseVersion: 3, language: 'ar' }),
    },
    200,
  );
  if (arabicCharacter.version !== 4 || arabicCharacter.language !== 'ar') {
    throw new Error('Expanded character language was not persisted through the supported API.');
  }
  const languageCatalogue = await request(
    '/api/v1/discovery/languages/catalog?rating=SAFE',
    { headers },
    200,
  );
  const expectedLanguageEntries = [
    ['ru', 'Русский', 'ltr'],
    ['en', 'English', 'ltr'],
    ['de', 'Deutsch', 'ltr'],
    ['fr', 'Français', 'ltr'],
    ['es', 'Español', 'ltr'],
    ['zh', '中文', 'ltr'],
    ['ja', '日本語', 'ltr'],
    ['ko', '한국어', 'ltr'],
    ['ar', 'العربية', 'rtl'],
    ['hi', 'हिन्दी', 'ltr'],
    ['other', 'Другой', 'ltr'],
  ];
  if (
    !expectedLanguageEntries.every(([code, nativeName, direction]) =>
      languageCatalogue.items.some(
        (item) =>
          item.code === code && item.nativeName === nativeName && item.direction === direction,
      ),
    ) ||
    !languageCatalogue.items.some((item) => item.code === 'ar' && item.usageCount === 1)
  ) {
    throw new Error('The D1-backed Unicode language catalogue or usage counts are incomplete.');
  }
  const arabicDiscovery = await request('/api/v1/discovery?languages=ar', { headers }, 200);
  if (arabicDiscovery.totalCount !== 1 || arabicDiscovery.items[0]?.id !== character.id) {
    throw new Error('Arabic discovery filter did not return the persisted Arabic character.');
  }
  const multiLanguageDiscovery = await request(
    '/api/v1/discovery?languages=ru,ar',
    { headers },
    200,
  );
  if (
    !multiLanguageDiscovery.items.some((item) => item.id === character.id) ||
    !multiLanguageDiscovery.items.some((item) => item.id === opaqueCharacterId)
  ) {
    throw new Error('Multi-language discovery did not use inclusive language semantics.');
  }
  await request('/api/v1/discovery?languages=ar,unknown', { headers }, 400);
  const groupCharacter = await request(
    `/api/v1/characters/${character.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ baseVersion: 4, groupSize: 'small' }),
    },
    200,
  );
  if (groupCharacter.version !== 5 || groupCharacter.groupSize !== 'small') {
    throw new Error('Character group size was not persisted through the supported API.');
  }
  const groupSizeCatalogue = await request(
    '/api/v1/discovery/group-sizes/catalog?rating=SAFE',
    { headers },
    200,
  );
  if (
    groupSizeCatalogue.enabled !== true ||
    groupSizeCatalogue.items.length !== 4 ||
    !groupSizeCatalogue.items.some((item) => item.code === 'small' && item.usageCount === 1)
  ) {
    throw new Error('The D1-backed group-size catalogue or usage counts are incomplete.');
  }
  const smallGroupDiscovery = await request('/api/v1/discovery?groupSizes=small', { headers }, 200);
  if (smallGroupDiscovery.totalCount !== 1 || smallGroupDiscovery.items[0]?.id !== character.id) {
    throw new Error('Group-size discovery filter did not return the persisted small group.');
  }
  await request('/api/v1/discovery?groupSizes=small,crowd', { headers }, 400);
  const newestDiscovery = await request('/api/v1/discovery?sort=newest&limit=30', { headers }, 200);
  const oldestDiscovery = await request('/api/v1/discovery?sort=oldest&limit=30', { headers }, 200);
  const newestDiscoveryIds = newestDiscovery.items.map((item) => item.id);
  const oldestDiscoveryIds = oldestDiscovery.items.map((item) => item.id);
  if (
    newestDiscovery.totalCount !== newestDiscoveryIds.length ||
    oldestDiscovery.totalCount !== oldestDiscoveryIds.length ||
    JSON.stringify(newestDiscoveryIds) !== JSON.stringify(oldestDiscoveryIds.reverse())
  ) {
    throw new Error('Discovery newest/oldest sort or exact total count is inconsistent.');
  }
  if (discovery.items[0]?.creatorName !== 'Независимый автор') {
    throw new Error('Discovery ignored the product-profile display name.');
  }
  const discoveryByProfileName = await request(
    `/api/v1/discovery?q=${encodeURIComponent('Независимый автор')}`,
    { headers },
    200,
  );
  if (discoveryByProfileName.items[0]?.id !== character.id) {
    throw new Error('Product-profile display name is not searchable.');
  }
  if (discovery.items[0]?.alternateGreetings?.length !== 1) {
    throw new Error('Alternative greetings are missing from discovery.');
  }
  const publicCharacter = await request(`/api/v1/discovery/${character.id}`, { headers }, 200);
  if ('systemInstructions' in publicCharacter || 'creatorNotes' in publicCharacter) {
    throw new Error('Public character response exposed hidden prompt fields.');
  }
  const firstPublicProfile = await cachedPublicRequest(
    `/api/v1/public/characters/${character.id}`,
    'MISS',
    headers,
  );
  if (
    firstPublicProfile.body.id !== character.id ||
    firstPublicProfile.body.likeCount !== 0 ||
    firstPublicProfile.body.creatorName !== 'Независимый автор' ||
    'liked' in firstPublicProfile.body ||
    'creatorId' in firstPublicProfile.body
  ) {
    throw new Error('Public cached character exposed personalized or private fields.');
  }
  await waitForPublicCacheHit(`/api/v1/public/characters/${character.id}`, headers);
  const firstTags = await cachedPublicRequest('/api/v1/public/tags', 'MISS', headers);
  if (!firstTags.body.items.some((tag) => tag.slug === 'архив')) {
    throw new Error('Public cached tag catalog is missing the published tag.');
  }
  await waitForPublicCacheHit('/api/v1/public/tags', headers);
  const firstTrending = await cachedPublicRequest('/api/v1/public/trending', 'MISS', headers);
  if (!firstTrending.body.items.some((item) => item.id === character.id)) {
    throw new Error('Public trending cache is missing the published character.');
  }
  await waitForPublicCacheHit('/api/v1/public/trending', headers);
  await request(
    `/api/v1/discovery/${character.id}/like`,
    { method: 'PUT', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  const duplicateLike = await request(
    `/api/v1/discovery/${character.id}/like`,
    { method: 'PUT', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  if (duplicateLike.likeCount !== 1 || duplicateLike.liked !== true) {
    throw new Error('Duplicate like bypassed the one-user-one-like constraint.');
  }
  const refreshedPublicProfile = await waitForPublicCacheMiss(
    `/api/v1/public/characters/${character.id}`,
    headers,
  );
  if (refreshedPublicProfile.body.likeCount !== 1) {
    throw new Error('Public profile cache was not invalidated after a like.');
  }
  await request(
    `/api/v1/discovery/${character.id}/bookmark`,
    { method: 'PUT', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  await request(
    `/api/v1/discovery/${character.id}/bookmark`,
    { method: 'PUT', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  await request(
    `/api/v1/discovery/${character.id}/review`,
    {
      method: 'PUT',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({ rating: 6, text: 'Invalid rating.' }),
    },
    400,
  );
  await request(
    `/api/v1/discovery/${character.id}/review`,
    {
      method: 'PUT',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({ rating: 4, text: 'Стабильный отзыв для regression-теста.' }),
    },
    200,
  );
  const reviewedCharacter = await request(
    `/api/v1/discovery/${character.id}`,
    { headers: reporterHeaders },
    200,
  );
  if (
    reviewedCharacter.liked !== true ||
    reviewedCharacter.bookmarked !== true ||
    reviewedCharacter.likeCount !== 1 ||
    reviewedCharacter.bookmarkCount !== 1 ||
    reviewedCharacter.reviewCount !== 1 ||
    reviewedCharacter.averageRating !== 4 ||
    reviewedCharacter.myRating !== 4
  ) {
    throw new Error('Character interaction state or aggregate counts are inconsistent.');
  }
  const reviews = await request(
    `/api/v1/discovery/${character.id}/reviews`,
    { headers: reporterHeaders },
    200,
  );
  if (reviews.items.length !== 1 || reviews.items[0]?.rating !== 4) {
    throw new Error('Public review list is incomplete.');
  }
  await request(
    `/api/v1/discovery/${character.id}/like`,
    { method: 'PUT', headers: { ...headers, 'x-csrf-token': csrfToken } },
    409,
  );
  const creatorStats = await request('/api/v1/discovery/creator-stats/me', { headers }, 200);
  if (
    creatorStats.characterCount !== 1 ||
    creatorStats.likes !== 1 ||
    creatorStats.bookmarks !== 1 ||
    creatorStats.reviews !== 1 ||
    creatorStats.averageRating !== 4 ||
    creatorStats.chatsStarted !== 0
  ) {
    throw new Error('Creator aggregate stats expose incorrect values.');
  }
  const foreignConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        characterId: character.id,
        idempotencyKey: `foreign-prompt-inspector:${randomUUID()}`,
      }),
    },
    201,
  );
  if (foreignConversation.promptInspectorAvailable !== false) {
    throw new Error('A reader was offered the hidden prompt inspector for another creator.');
  }
  await request(
    `/api/v1/conversations/${foreignConversation.id}/prompt-inspector`,
    { headers: reporterHeaders },
    403,
  );
  await request(
    `/api/v1/discovery/${character.id}/review`,
    { method: 'DELETE', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  await request(
    `/api/v1/discovery/${character.id}/review`,
    { method: 'DELETE', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  await request(
    `/api/v1/discovery/${character.id}/like`,
    { method: 'DELETE', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  const repeatedUnlike = await request(
    `/api/v1/discovery/${character.id}/like`,
    { method: 'DELETE', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  if (repeatedUnlike.likeCount !== 0 || repeatedUnlike.liked !== false) {
    throw new Error('Repeated unlike is not idempotent.');
  }
  await request(
    `/api/v1/discovery/${character.id}/like`,
    { method: 'PUT', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  const lorebook = await request(
    '/api/v1/lorebooks',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        name: 'Архив мира',
        description: 'Тестовая книга',
        visibility: 'PRIVATE',
      }),
    },
    201,
  );
  const loreEntry = await request(
    `/api/v1/lorebooks/${lorebook.id}/entries`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        title: 'Скрытая дверь',
        content: '{{char}} знает секретный проход, который заметил {{user}}.',
        keys: ['архив'],
        priority: 50,
        matchWholeWord: true,
      }),
    },
    201,
  );
  const changedLoreEntry = await request(
    `/api/v1/lorebooks/${lorebook.id}/entries/${loreEntry.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ tokenBudget: 120 }),
    },
    200,
  );
  if (changedLoreEntry.tokenBudget !== 120 || changedLoreEntry.keys[0] !== 'архив') {
    throw new Error('Lore entry patch corrupted its deterministic settings.');
  }
  const loreTransfer = await request(`/api/v1/lorebooks/${lorebook.id}/export`, { headers }, 200);
  if (
    loreTransfer.format !== 'velora-lorebook' ||
    loreTransfer.version !== 1 ||
    loreTransfer.book.name !== lorebook.name ||
    loreTransfer.entries.length !== 1 ||
    loreTransfer.entries[0]?.tokenBudget !== 120 ||
    'id' in loreTransfer.entries[0] ||
    JSON.stringify(loreTransfer).includes(lorebook.id)
  ) {
    throw new Error('Lorebook export is incomplete or leaked internal identifiers.');
  }
  await request(`/api/v1/lorebooks/${lorebook.id}/export`, { headers: reporterHeaders }, 404);
  const importKey = `lore-import:${randomUUID()}`;
  const importedLorebook = await request(
    '/api/v1/lorebooks/import',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ idempotencyKey: importKey, transfer: loreTransfer }),
    },
    201,
  );
  const repeatedImport = await request(
    '/api/v1/lorebooks/import',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ idempotencyKey: importKey, transfer: loreTransfer }),
    },
    200,
  );
  if (
    importedLorebook.id !== repeatedImport.id ||
    importedLorebook.importedEntries !== 1 ||
    repeatedImport.importedEntries !== 1
  ) {
    throw new Error('Lorebook import retry created a duplicate resource.');
  }
  await request(
    '/api/v1/lorebooks/import',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        idempotencyKey: importKey,
        transfer: { ...loreTransfer, book: { ...loreTransfer.book, name: 'Changed payload' } },
      }),
    },
    409,
  );
  const importedLorebookDetail = await request(
    `/api/v1/lorebooks/${importedLorebook.id}`,
    { headers },
    200,
  );
  if (
    importedLorebookDetail.visibility !== 'PRIVATE' ||
    importedLorebookDetail.entries.length !== 1 ||
    importedLorebookDetail.entries[0]?.content !== loreTransfer.entries[0]?.content
  ) {
    throw new Error('Imported lorebook was not private or lost validated entry data.');
  }
  const newestLorebooks = await request('/api/v1/lorebooks?sort=newest', { headers }, 200);
  const oldestLorebooks = await request('/api/v1/lorebooks?sort=oldest', { headers }, 200);
  const searchedLorebooks = await request(
    `/api/v1/lorebooks?q=${encodeURIComponent('Тестовая книга')}&sort=newest`,
    { headers },
    200,
  );
  if (
    JSON.stringify(newestLorebooks.items.map((item) => item.id)) !==
      JSON.stringify(oldestLorebooks.items.map((item) => item.id).reverse()) ||
    searchedLorebooks.items.length !== 2
  ) {
    throw new Error('Lorebook search/newest/oldest query did not reach deterministic D1 ordering.');
  }
  const beforeInvalidImport = await request('/api/v1/lorebooks', { headers }, 200);
  await request(
    '/api/v1/lorebooks/import',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        idempotencyKey: `invalid-lore-import:${randomUUID()}`,
        transfer: { ...loreTransfer, entries: [{ ...loreTransfer.entries[0], keys: [] }] },
      }),
    },
    400,
  );
  const afterInvalidImport = await request('/api/v1/lorebooks', { headers }, 200);
  if (afterInvalidImport.items.length !== beforeInvalidImport.items.length) {
    throw new Error('Invalid lorebook import partially created a book.');
  }
  await request(
    `/api/v1/characters/${character.id}/lorebooks/${lorebook.id}`,
    {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ enabled: true }),
    },
    200,
  );
  const conversationKey = `conversation:${randomUUID()}`;
  const conversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        greetingIndex: 1,
        idempotencyKey: conversationKey,
      }),
    },
    201,
  );
  const repeatedConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        greetingIndex: 1,
        idempotencyKey: conversationKey,
      }),
    },
    200,
  );
  if (conversation.id !== repeatedConversation.id) {
    throw new Error('Conversation creation is not idempotent.');
  }
  const initialBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (
    initialBranch.items.length !== 1 ||
    initialBranch.items[0]?.role !== 'ASSISTANT' ||
    initialBranch.items[0]?.isGreeting !== true ||
    initialBranch.items[0]?.editedByUser !== false ||
    initialBranch.items[0]?.origin !== 'CHARACTER_GREETING' ||
    initialBranch.items[0]?.contentFormat !== 'MARKDOWN' ||
    initialBranch.items[0]?.updatedAt !== initialBranch.items[0]?.createdAt ||
    initialBranch.items[0]?.content !==
      `${characterName} встречает Алекс у входа в архив. Другой путь тоже привёл тебя сюда, Алекс. Я ${characterName}.`
  ) {
    throw new Error('Conversation did not render the selected greeting with its persona snapshot.');
  }
  const initialGreeting = initialBranch.items[0];
  if (
    initialGreeting.variantCount !== publicCharacter.alternateGreetings.length + 1 ||
    initialGreeting.variantIds.length !== initialGreeting.variantCount ||
    initialGreeting.variantIndex !== 1 ||
    !initialGreeting.variantIds.includes(initialGreeting.id)
  ) {
    throw new Error(
      'A fresh conversation did not expose every character greeting as a browsable variant.',
    );
  }
  const otherGreetingId = initialGreeting.variantIds.find((id) => id !== initialGreeting.id);
  await request(
    `/api/v1/conversations/${conversation.id}/active-message/${otherGreetingId}?descend=0`,
    { method: 'PUT', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const switchedGreetingBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (
    switchedGreetingBranch.items.length !== 1 ||
    switchedGreetingBranch.items[0]?.id !== otherGreetingId ||
    switchedGreetingBranch.items[0]?.isGreeting !== true
  ) {
    throw new Error('Switching to another greeting variant did not change the opening scene.');
  }
  await request(
    `/api/v1/conversations/${conversation.id}/active-message/${initialGreeting.id}?descend=0`,
    { method: 'PUT', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const secondChatWithCharacter = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        greetingIndex: 0,
        idempotencyKey: `second-chat:${randomUUID()}`,
      }),
    },
    201,
  );
  const collapsedList = await request('/api/v1/conversations?state=ALL', { headers }, 200);
  const rowsForCharacter = collapsedList.items.filter(
    (item) => item.characterId === character.id && !item.isPreview,
  );
  if (rowsForCharacter.length !== 1) {
    throw new Error(
      `Starting another chat with the same character duplicated it in the list: ${rowsForCharacter.length} rows.`,
    );
  }
  if (
    rowsForCharacter[0].id !== secondChatWithCharacter.id ||
    rowsForCharacter[0].siblingCount !== 2 ||
    collapsedList.totalCount !== collapsedList.items.length
  ) {
    throw new Error('The collapsed conversation row did not describe its sibling chats.');
  }
  const siblings = await request(
    `/api/v1/conversations/${secondChatWithCharacter.id}/siblings`,
    { headers },
    200,
  );
  if (
    siblings.items.length !== 2 ||
    !siblings.items.some((item) => item.id === conversation.id && item.current === false) ||
    !siblings.items.some((item) => item.id === secondChatWithCharacter.id && item.current === true)
  ) {
    throw new Error('The chat switcher did not list both chats with the character.');
  }
  await request(
    `/api/v1/conversations/${secondChatWithCharacter.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const restoredList = await request('/api/v1/conversations?state=ALL', { headers }, 200);
  if (
    restoredList.items.filter((item) => item.characterId === character.id && !item.isPreview)[0]
      ?.id !== conversation.id
  ) {
    throw new Error('Deleting the newer chat did not surface the remaining one.');
  }
  const greetingOverrideText = 'В этом диалоге архив встречает тебя иначе.';
  const greetingOverride = await request(
    `/api/v1/conversations/${conversation.id}/messages/${initialGreeting.id}/edit`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: greetingOverrideText,
        idempotencyKey: `greeting-override:${randomUUID()}`,
      }),
    },
    201,
  );
  if (
    greetingOverride.content !== greetingOverrideText ||
    greetingOverride.isGreeting !== true ||
    greetingOverride.editedByUser !== true ||
    greetingOverride.origin !== 'USER_EDIT' ||
    greetingOverride.parentMessageId !== null
  ) {
    throw new Error('Greeting edit was not stored as a conversation-scoped root override.');
  }
  const publicCharacterAfterOverride = await request(
    `/api/v1/discovery/${character.id}`,
    { headers },
    200,
  );
  if (publicCharacterAfterOverride.firstMessage !== publicCharacter.firstMessage) {
    throw new Error('Conversation greeting override mutated the public character version.');
  }
  const balanceBeforeGreetingRegeneration = await request('/api/v1/me', { headers }, 200);
  const regeneratedGreetingResponse = await fetch(
    `${baseUrl}/api/v1/conversations/${conversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: greetingOverride.id,
        mode: 'GREETING',
        idempotencyKey: `regenerate-greeting:${randomUUID()}`,
      }),
    },
  );
  const regeneratedGreetingStream = await regeneratedGreetingResponse.text();
  if (
    regeneratedGreetingResponse.status !== 200 ||
    !regeneratedGreetingStream.includes('event: delta') ||
    !regeneratedGreetingStream.includes('event: done')
  ) {
    throw new Error(
      `Greeting regeneration failed: ${regeneratedGreetingResponse.status} ${regeneratedGreetingStream}`,
    );
  }
  const greetingBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  const regeneratedGreeting = greetingBranch.items.at(-1);
  if (
    greetingBranch.items.length !== 1 ||
    regeneratedGreeting?.isGreeting !== true ||
    regeneratedGreeting?.origin !== 'AI_GENERATION' ||
    regeneratedGreeting?.parentMessageId !== null ||
    regeneratedGreeting?.variantCount !== publicCharacter.alternateGreetings.length + 3 ||
    regeneratedGreeting?.variantIds.length !== publicCharacter.alternateGreetings.length + 3
  ) {
    throw new Error('Regenerated greeting was not exposed as an immutable root greeting variant.');
  }
  const publicCharacterAfterRegeneration = await request(
    `/api/v1/discovery/${character.id}`,
    { headers },
    200,
  );
  if (publicCharacterAfterRegeneration.firstMessage !== publicCharacter.firstMessage) {
    throw new Error('Greeting regeneration mutated the public character version.');
  }
  const balanceAfterGreetingRegeneration = await request('/api/v1/me', { headers }, 200);
  if (
    balanceAfterGreetingRegeneration.creditBalanceMicros !==
    balanceBeforeGreetingRegeneration.creditBalanceMicros
  ) {
    throw new Error(
      `Plan-backed generation unexpectedly changed the legacy credit ledger: before=${balanceBeforeGreetingRegeneration.creditBalanceMicros}, after=${balanceAfterGreetingRegeneration.creditBalanceMicros}.`,
    );
  }
  const updatedConversation = await request(
    `/api/v1/conversations/${conversation.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        modelProfile: 'CREATIVE',
        responseLength: 'DETAILED',
        temperature: 1.1,
        maxOutputTokens: 350,
        customInstructions: 'Пиши для {{user}} кинематографично.',
        personaMode: 'LIVE',
      }),
    },
    200,
  );
  if (
    updatedConversation.settings.modelProfile !== 'CREATIVE' ||
    updatedConversation.settings.responseLength !== 'DETAILED' ||
    updatedConversation.settings.maxOutputTokens !== 350 ||
    updatedConversation.settings.customInstructions !== 'Пиши для {{user}} кинематографично.'
  ) {
    throw new Error('Conversation-specific advanced settings were not persisted.');
  }
  const messageKey = `message:${randomUUID()}`;
  const userMessage = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ content: 'Я открываю дверь архива.', idempotencyKey: messageKey }),
    },
    201,
  );
  const repeatedMessage = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'Другой текст не должен сохраниться.',
        idempotencyKey: messageKey,
      }),
    },
    200,
  );
  if (userMessage.id !== repeatedMessage.id || repeatedMessage.content !== userMessage.content) {
    throw new Error('Message creation is not idempotent.');
  }
  const activeLore = await request(
    `/api/v1/conversations/${conversation.id}/lore/active`,
    { headers },
    200,
  );
  if (
    activeLore.entries.length !== 1 ||
    activeLore.entries[0]?.id !== loreEntry.id ||
    !activeLore.entries[0]?.content.includes(character.name)
  ) {
    throw new Error('Attached lore was not deterministically activated or templated.');
  }
  const conversationDetail = await request(
    `/api/v1/conversations/${conversation.id}`,
    { headers },
    200,
  );
  if (conversationDetail.promptInspectorAvailable !== true) {
    throw new Error('The character creator was not offered the prompt inspector.');
  }
  const promptInspector = await request(
    `/api/v1/conversations/${conversation.id}/prompt-inspector`,
    { headers },
    200,
  );
  if (
    promptInspector.character.name !== characterName ||
    promptInspector.selectedModel?.profileId !== conversationDetail.settings.modelProfileId ||
    promptInspector.selectedModel?.providerModelId !== 'deepseek-chat-v3.1' ||
    !promptInspector.character.systemInstructions.includes(storyPersona.name) ||
    promptInspector.lore[0]?.id !== loreEntry.id ||
    !promptInspector.lore[0]?.content.includes(storyPersona.name) ||
    promptInspector.recentMessages.at(-1)?.content !== userMessage.content ||
    promptInspector.tokenEstimates.totalInput <= 0 ||
    promptInspector.tokenEstimates.contextLimit !== 32000 ||
    !promptInspector.chatInstructions.includes('Preferred response length: detailed')
  ) {
    throw new Error('Prompt inspector does not reflect the exact active prompt assembly.');
  }
  const generationKey = `generation:${randomUUID()}`;
  const aiRequestCountBeforeGeneration = aiRequests.length;
  const generationResponse = await fetch(
    `${baseUrl}/api/v1/conversations/${conversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ parentMessageId: userMessage.id, idempotencyKey: generationKey }),
    },
  );
  const generationStream = await generationResponse.text();
  if (
    generationResponse.status !== 200 ||
    !generationResponse.headers.get('content-type')?.startsWith('text/event-stream') ||
    !generationStream.includes('event: delta') ||
    !generationStream.includes('Архив ') ||
    !generationStream.includes('event: done')
  ) {
    throw new Error(
      `Streaming generation failed: ${generationResponse.status} ${generationStream}\n${workerOutput}`,
    );
  }
  const fallbackAttempts = aiRequests
    .slice(aiRequestCountBeforeGeneration)
    .map((attempt) => attempt.model);
  if (
    JSON.stringify(fallbackAttempts) !==
    JSON.stringify(['deepseek-chat-v3.1', 'deepseek-chat-v3.1', 'deepseek-chat-v3-0324'])
  ) {
    throw new Error(
      `Transient generation did not follow the bounded fallback chain: ${JSON.stringify(fallbackAttempts)}`,
    );
  }
  const aiRequest = aiRequests.at(-1);
  if (
    aiRequest?.max_tokens !== 350 ||
    aiRequest?.temperature !== 1.1 ||
    !aiRequest.messages?.some(
      (message) =>
        message.role === 'system' && message.content.includes('Пиши для Алекс кинематографично.'),
    ) ||
    !aiRequest.messages?.some(
      (message) => message.role === 'user' && message.content === `Я готова, ${characterName}.`,
    ) ||
    !aiRequest.messages?.some(
      (message) =>
        message.role === 'system' && message.content.includes('Продолжи сцену для Алекс'),
    )
  ) {
    throw new Error(
      `Advanced roleplay prompt/settings were not sent correctly: ${JSON.stringify(aiRequest)}`,
    );
  }
  await request(
    `/api/v1/conversations/${conversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ parentMessageId: userMessage.id, idempotencyKey: generationKey }),
    },
    409,
  );
  if (aiRequests.length !== aiRequestCountBeforeGeneration + fallbackAttempts.length) {
    throw new Error('Repeated generation idempotency key caused another paid provider request.');
  }
  const generatedBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (
    generatedBranch.items.length !== 3 ||
    generatedBranch.items.at(-1)?.content !== 'Архив открылся.' ||
    generatedBranch.items.at(-1)?.status !== 'COMPLETED' ||
    generatedBranch.items.at(-1)?.isGreeting !== false ||
    generatedBranch.items.at(-1)?.origin !== 'AI_GENERATION' ||
    generatedBranch.items.at(-1)?.metadata?.includedLoreEntries?.[0] !== loreEntry.id
  ) {
    throw new Error('Completed AI response was not persisted on the active branch.');
  }
  const activeConversationList = await request(
    '/api/v1/conversations?state=ALL&sort=active',
    { headers },
    200,
  );
  const activeConversationIndex = activeConversationList.items.findIndex(
    (item) => item.id === conversation.id,
  );
  const previewConversationIndex = activeConversationList.items.findIndex(
    (item) => item.id === previewConversation.id,
  );
  if (
    activeConversationIndex < 0 ||
    previewConversationIndex < 0 ||
    activeConversationIndex >= previewConversationIndex ||
    activeConversationList.items[activeConversationIndex]?.messageCount !== 3 ||
    activeConversationList.items[previewConversationIndex]?.messageCount !== 1
  ) {
    throw new Error(
      'Most-active conversation sorting did not use deterministic server-side message counts.',
    );
  }
  const reactedMessage = generatedBranch.items.at(-1);
  if (typeof reactedMessage?.generationId !== 'string' || reactedMessage.reaction !== null) {
    throw new Error('Generated response did not expose its reaction identity and empty state.');
  }
  await request(
    `/api/v1/conversations/${conversation.id}/generations/${reactedMessage.generationId}/reaction`,
    {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ reaction: 'POSITIVE' }),
    },
    200,
  );
  await request(
    `/api/v1/conversations/${conversation.id}/generations/${reactedMessage.generationId}/reaction`,
    {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ reaction: 'POSITIVE' }),
    },
    200,
  );
  const reactedBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (reactedBranch.items.at(-1)?.reaction !== 'POSITIVE') {
    throw new Error('Saved response reaction was not restored with its generated message.');
  }
  const reactionCardinality = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT COUNT(*) AS reaction_count FROM message_generation_reactions
     WHERE generation_id = '${reactedMessage.generationId}' AND user_id = '${me.id}';`,
  ]);
  if (!reactionCardinality.includes('"reaction_count": 1')) {
    throw new Error(`Repeated response reaction created a duplicate: ${reactionCardinality}`);
  }
  await request(
    `/api/v1/conversations/${conversation.id}/generations/${reactedMessage.generationId}/reaction`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const clearedReactionBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (clearedReactionBranch.items.at(-1)?.reaction !== null) {
    throw new Error('Deleted response reaction remained attached to the generated message.');
  }
  const dashboardAfterGeneration = await request(
    '/api/v1/admin/operations/dashboard',
    { headers: adminHeaders },
    200,
  );
  if (dashboardAfterGeneration.productEvents24h < 6) {
    throw new Error('Server-authoritative product events are missing after roleplay activity.');
  }
  const ownerDashboardAfterGeneration = await request(
    '/api/v1/admin/operations/dashboard',
    { headers: ownerHeaders },
    200,
  );
  if (
    ownerDashboardAfterGeneration.ownerAiUsage.daily.requests < 1 ||
    ownerDashboardAfterGeneration.ownerAiUsage.weekly.requests <
      ownerDashboardAfterGeneration.ownerAiUsage.daily.requests ||
    ownerDashboardAfterGeneration.ownerAiUsage.lifetime.requests <
      ownerDashboardAfterGeneration.ownerAiUsage.weekly.requests ||
    !ownerDashboardAfterGeneration.ownerAiUsage.perModelWeekly.some(
      (usage) => usage.inputTokens > 0 && usage.outputTokens > 0,
    )
  ) {
    throw new Error('Owner AI usage windows or per-model weekly aggregates were not persisted.');
  }
  const balanceAfterGeneration = await request('/api/v1/me', { headers }, 200);
  if (balanceAfterGeneration.creditBalanceMicros !== 1_000_000) {
    throw new Error('Plan-backed generation unexpectedly debited the legacy credit ledger.');
  }
  const successfulProviderSpend = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT CASE WHEN provider_actual_cost_micros > actual_cost_micros
       AND provider_actual_cost_micros <= provider_estimated_cost_micros
       AND status = 'COMPLETED' THEN 1 ELSE 0 END AS provider_spend_accounted
     FROM ai_requests WHERE conversation_id = '${conversation.id}'
     ORDER BY created_at DESC LIMIT 1;`,
  ]);
  if (!successfulProviderSpend.includes('"provider_spend_accounted": 1')) {
    throw new Error('Retry/fallback provider spend was not kept separate from the user charge.');
  }
  const policyConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        idempotencyKey: `content-policy-conversation:${randomUUID()}`,
      }),
    },
    201,
  );
  const policyMessage = await request(
    `/api/v1/conversations/${policyConversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'CONTENT_POLICY_TEST: explicit provider policy response.',
        idempotencyKey: `content-policy-message:${randomUUID()}`,
      }),
    },
    201,
  );
  const policyBalanceBefore = (await request('/api/v1/me', { headers }, 200)).creditBalanceMicros;
  const policyProviderIndex = aiRequests.length;
  const policyResponse = await fetch(
    `${baseUrl}/api/v1/conversations/${policyConversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: policyMessage.id,
        idempotencyKey: `content-policy-generation:${randomUUID()}`,
      }),
    },
  );
  const policyStream = await policyResponse.text();
  if (
    policyResponse.status !== 200 ||
    !policyStream.includes('event: error') ||
    !policyStream.includes('BOTHUB_CONTENT_RESTRICTED') ||
    policyStream.includes('private provider diagnostic') ||
    policyStream.includes('event: done')
  ) {
    throw new Error(`Provider content restriction was not safely surfaced: ${policyStream}`);
  }
  if (aiRequests.length - policyProviderIndex !== 1) {
    throw new Error('A non-retryable provider content restriction incorrectly triggered fallback.');
  }
  const policyBalanceAfter = (await request('/api/v1/me', { headers }, 200)).creditBalanceMicros;
  if (policyBalanceAfter !== policyBalanceBefore) {
    throw new Error('A blocked generation debited user credits.');
  }
  const policyPersistence = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT status, error_code AS errorCode FROM ai_requests
     WHERE conversation_id = '${policyConversation.id}' ORDER BY created_at DESC LIMIT 1;`,
  ]);
  if (
    !policyPersistence.includes('"status": "FAILED"') ||
    !policyPersistence.includes('"errorCode": "BOTHUB_CONTENT_RESTRICTED"')
  ) {
    throw new Error(
      `Provider content restriction persistence is inconsistent: ${policyPersistence}`,
    );
  }
  const freeCatalog = await request('/api/v1/conversations/models/catalog', { headers }, 200);
  const nanoCatalogItem = freeCatalog.items.find((item) => item.id === 'velora-free-context');
  if (
    !nanoCatalogItem?.available ||
    !nanoCatalogItem.allowed ||
    nanoCatalogItem.providerLabel !== 'BotHub' ||
    nanoCatalogItem.costLabelRu !== 'Минимальный' ||
    'providerModelId' in nanoCatalogItem ||
    'price' in nanoCatalogItem
  ) {
    throw new Error('Smoke-validated Free model was not selectable in the server catalog.');
  }
  const freeConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        idempotencyKey: `free-conversation:${randomUUID()}`,
      }),
    },
    201,
  );
  const switchFirstMessage = await request(
    `/api/v1/conversations/${freeConversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'MODEL_SWITCH_TEST: first scene before switching models.',
        parentMessageId: freeConversation.activeMessageId,
        idempotencyKey: `model-switch-before:${randomUUID()}`,
      }),
    },
    201,
  );
  const beforeSwitchProviderIndex = aiRequests.length;
  const beforeSwitchResponse = await fetch(
    `${baseUrl}/api/v1/conversations/${freeConversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: switchFirstMessage.id,
        idempotencyKey: `model-switch-generation-before:${randomUUID()}`,
      }),
    },
  );
  const beforeSwitchStream = await beforeSwitchResponse.text();
  if (
    beforeSwitchResponse.status !== 200 ||
    !beforeSwitchStream.includes('event: done') ||
    aiRequests.slice(beforeSwitchProviderIndex).at(0)?.model !== 'deepseek-chat-v3.1'
  ) {
    throw new Error(
      `Pre-switch generation mismatch: ${JSON.stringify({
        status: beforeSwitchResponse.status,
        completed: beforeSwitchStream.includes('event: done'),
        errorCodes: [...beforeSwitchStream.matchAll(/"code":"([^"]+)"/gu)].map((match) => match[1]),
        models: aiRequests.slice(beforeSwitchProviderIndex).map((request) => request.model),
      })}`,
    );
  }
  const branchBeforeSwitch = await request(
    `/api/v1/conversations/${freeConversation.id}/messages`,
    { headers },
    200,
  );
  await request(
    `/api/v1/conversations/${freeConversation.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ modelProfileId: 'velora-free-context' }),
    },
    200,
  );
  const branchAfterSwitch = await request(
    `/api/v1/conversations/${freeConversation.id}/messages`,
    { headers },
    200,
  );
  if (
    JSON.stringify(branchAfterSwitch.items.map((item) => item.id)) !==
    JSON.stringify(branchBeforeSwitch.items.map((item) => item.id))
  ) {
    throw new Error('Switching the model changed the existing conversation history.');
  }
  const freeBalanceBefore = (await request('/api/v1/me', { headers }, 200)).creditBalanceMicros;
  let freeParentMessageId = branchAfterSwitch.items.at(-1)?.id;
  for (let freeIndex = 0; freeIndex < 3; freeIndex += 1) {
    const freeMessage = await request(
      `/api/v1/conversations/${freeConversation.id}/messages`,
      {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          content: `Секретный проход и бесплатная сцена ${String(freeIndex + 1)}.`,
          parentMessageId: freeParentMessageId,
          idempotencyKey: `free-message:${String(freeIndex)}:${randomUUID()}`,
        }),
      },
      201,
    );
    const freeResponse = await fetch(
      `${baseUrl}/api/v1/conversations/${freeConversation.id}/generate`,
      {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          parentMessageId: freeMessage.id,
          idempotencyKey: `free-generation:${String(freeIndex)}:${randomUUID()}`,
        }),
      },
    );
    const freeStream = await freeResponse.text();
    if (freeResponse.status !== 200 || !freeStream.includes('event: done')) {
      throw new Error(`Sponsored Free generation failed: ${freeResponse.status} ${freeStream}`);
    }
    if (freeIndex === 0 && aiRequests.at(-1)?.model !== 'mistral-nemo') {
      throw new Error('The first post-switch generation did not use the newly selected model.');
    }
    const activeFreeBranch = await request(
      `/api/v1/conversations/${freeConversation.id}/messages`,
      { headers },
      200,
    );
    freeParentMessageId = activeFreeBranch.items.at(-1)?.id;
  }
  const freeBalanceAfter = (await request('/api/v1/me', { headers }, 200)).creditBalanceMicros;
  if (freeBalanceAfter !== freeBalanceBefore) {
    throw new Error('Sponsored Free generation debited the user credit ledger.');
  }
  const sponsoredAccounting = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT
       (SELECT COUNT(*) FROM ai_requests WHERE user_id = '${userId}'
         AND model = 'mistral-nemo' AND billing_mode = 'SPONSORED_FREE'
        AND status = 'COMPLETED') AS sponsored_requests,
       (SELECT COUNT(*) FROM credit_transactions ct JOIN ai_requests ar
        ON ar.id = ct.reference_id WHERE ar.user_id = '${userId}'
         AND ar.model = 'mistral-nemo' AND ct.type = 'GENERATION_USAGE') AS user_debits;`,
  ]);
  if (
    !sponsoredAccounting.includes('"sponsored_requests": 3') ||
    !sponsoredAccounting.includes('"user_debits": 0')
  ) {
    throw new Error(`Sponsored Free accounting is inconsistent: ${sponsoredAccounting}`);
  }
  const fourthFreeMessage = await request(
    `/api/v1/conversations/${freeConversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'Секретный проход и четвёртая бесплатная сцена.',
        parentMessageId: freeParentMessageId,
        idempotencyKey: `free-message:fourth:${randomUUID()}`,
      }),
    },
    201,
  );
  const fourthFreeResponse = await fetch(
    `${baseUrl}/api/v1/conversations/${freeConversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: fourthFreeMessage.id,
        idempotencyKey: `free-generation:fourth:${randomUUID()}`,
      }),
    },
  );
  const fourthFreeStream = await fourthFreeResponse.text();
  if (fourthFreeResponse.status !== 200 || !fourthFreeStream.includes('event: done')) {
    throw new Error('The relaxed Free fair-use policy rejected the fourth request.');
  }
  const firstAssistant = generatedBranch.items.at(-1);
  const regeneratedResponse = await fetch(
    `${baseUrl}/api/v1/conversations/${conversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: userMessage.id,
        mode: 'REPLY',
        idempotencyKey: `regenerate:${randomUUID()}`,
      }),
    },
  );
  await regeneratedResponse.text();
  if (regeneratedResponse.status !== 200) throw new Error('Regenerate request failed.');
  const regeneratedBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  const secondAssistant = regeneratedBranch.items.at(-1);
  if (
    !firstAssistant ||
    !secondAssistant ||
    firstAssistant.id === secondAssistant.id ||
    secondAssistant.variantCount !== 2 ||
    secondAssistant.variantIndex !== 1 ||
    secondAssistant.variantIds[0] !== firstAssistant.id ||
    secondAssistant.generationGroupId !== firstAssistant.generationGroupId
  ) {
    throw new Error('Regenerated responses were not exposed as immutable sibling variants.');
  }
  await request(
    `/api/v1/conversations/${conversation.id}/active-message/${firstAssistant.id}`,
    { method: 'PUT', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const selectedBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (selectedBranch.items.at(-1)?.id !== firstAssistant.id) {
    throw new Error('Explicit branch selection did not update the active pointer.');
  }
  const continuedResponse = await fetch(
    `${baseUrl}/api/v1/conversations/${conversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: firstAssistant.id,
        mode: 'CONTINUE',
        idempotencyKey: `continue:${randomUUID()}`,
      }),
    },
  );
  const continuedBody = await continuedResponse.text();
  if (continuedResponse.status !== 200) {
    throw new Error(
      `Continue request failed: ${continuedResponse.status} ${continuedBody}\n${workerOutput}`,
    );
  }
  const continuationRequest = aiRequests.at(-1);
  if (
    !continuationRequest?.messages?.some(
      (message) =>
        message.role === 'system' &&
        message.content.includes('Продолжи непосредственно предыдущий ответ персонажа'),
    )
  ) {
    throw new Error('Continue did not add its internal, non-visible generation instruction.');
  }
  const continuedBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  const continuedAssistant = continuedBranch.items.at(-1);
  if (
    !continuedAssistant ||
    continuedAssistant.parentMessageId !== firstAssistant.id ||
    continuedBranch.items.some((item) => item.role === 'INTERNAL')
  ) {
    throw new Error('Continuation branch is invalid or exposed an internal message.');
  }
  await request(
    `/api/v1/conversations/${conversation.id}/active-message/${secondAssistant.id}?descend=1`,
    { method: 'PUT', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  await request(
    `/api/v1/conversations/${conversation.id}/active-message/${firstAssistant.id}?descend=1`,
    { method: 'PUT', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const restoredDescendantBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (restoredDescendantBranch.items.at(-1)?.id !== continuedAssistant.id) {
    throw new Error('Variant selection did not restore its latest existing descendant branch.');
  }
  const aiRequestCountBeforeAssistantEdit = aiRequests.length;
  const editedAssistant = await request(
    `/api/v1/conversations/${conversation.id}/messages/${continuedAssistant.id}/edit`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'Отредактированное продолжение архива.',
        idempotencyKey: `edit-assistant:${randomUUID()}`,
      }),
    },
    201,
  );
  if (
    editedAssistant.role !== 'ASSISTANT' ||
    editedAssistant.editedByUser !== true ||
    editedAssistant.origin !== 'USER_EDIT' ||
    editedAssistant.metadata.editedFromId !== continuedAssistant.id
  ) {
    throw new Error('Assistant edit did not create an immutable sibling branch.');
  }
  if (aiRequests.length !== aiRequestCountBeforeAssistantEdit) {
    throw new Error('Assistant editing unexpectedly called the LLM provider.');
  }
  const editedAssistantBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  const activeEditedAssistant = editedAssistantBranch.items.at(-1);
  if (
    activeEditedAssistant?.id !== editedAssistant.id ||
    activeEditedAssistant.variantCount !== 2 ||
    !activeEditedAssistant.variantIds.includes(continuedAssistant.id) ||
    !activeEditedAssistant.variantIds.includes(editedAssistant.id)
  ) {
    throw new Error('Assistant edit did not preserve its original auditable variant.');
  }
  const inspectorAfterAssistantEdit = await request(
    `/api/v1/conversations/${conversation.id}/prompt-inspector`,
    { headers },
    200,
  );
  if (inspectorAfterAssistantEdit.recentMessages.at(-1)?.content !== editedAssistant.content) {
    throw new Error('The assistant override was not selected for subsequent AI context.');
  }
  await request(
    `/api/v1/conversations/${conversation.id}/messages/${editedAssistant.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  await request(
    `/api/v1/conversations/${conversation.id}/messages/${editedAssistant.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const branchAfterDelete = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (
    branchAfterDelete.items.at(-1)?.id !== firstAssistant.id ||
    branchAfterDelete.items.some((item) => item.id === editedAssistant.id)
  ) {
    throw new Error('Deleting an active branch did not return to its nearest surviving parent.');
  }
  const memoryAfterBranchDelete = await request(
    `/api/v1/conversations/${conversation.id}/memory`,
    { headers },
    200,
  );
  if (
    memoryAfterBranchDelete.stale !== true ||
    memoryAfterBranchDelete.staleSinceMessageId !== editedAssistant.id
  ) {
    throw new Error('Deleting a branch did not invalidate conversation memory.');
  }
  const editedMessage = await request(
    `/api/v1/conversations/${conversation.id}/messages/${userMessage.id}/edit`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'Я осторожно открываю дверь архива.',
        idempotencyKey: `edit:${randomUUID()}`,
      }),
    },
    201,
  );
  if (
    editedMessage.id === userMessage.id ||
    editedMessage.metadata.editedFromId !== userMessage.id
  ) {
    throw new Error('Message edit did not create an immutable branch.');
  }
  const editedBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (
    editedBranch.items.length !== 2 ||
    editedBranch.items[1]?.id !== editedMessage.id ||
    editedBranch.items.some((item) => item.id === userMessage.id) ||
    !editedBranch.items[1]?.variantIds.includes(userMessage.id) ||
    !editedBranch.items[1]?.variantIds.includes(editedMessage.id)
  ) {
    throw new Error('Active branch did not switch to the edited user message.');
  }
  await request(
    `/api/v1/conversations/${conversation.id}/active-message/${userMessage.id}?descend=1`,
    { method: 'PUT', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const originalUserBranch = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    { headers },
    200,
  );
  if (!originalUserBranch.items.some((item) => item.id === userMessage.id)) {
    throw new Error('The original user branch could not be restored after an immutable edit.');
  }
  await request(
    `/api/v1/conversations/${conversation.id}/active-message/${editedMessage.id}`,
    { method: 'PUT', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const memory = await request(
    `/api/v1/conversations/${conversation.id}/memory`,
    {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        manualContext: 'MANUAL_FACT: Алекс боится высоты.',
        idempotencyKey: `memory:${randomUUID()}`,
      }),
    },
    201,
  );
  const restored = await request(
    `/api/v1/conversations/${conversation.id}/memory/versions/${memory.id}/restore`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ idempotencyKey: `restore:${randomUUID()}` }),
    },
    201,
  );
  if (restored.content !== memory.content || restored.sourceType !== 'RESTORE') {
    throw new Error('Memory restore did not create a new immutable version.');
  }
  const summaryKey = `summary:${randomUUID()}`;
  const summaryJob = await request(
    `/api/v1/conversations/${conversation.id}/memory/summarize`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ idempotencyKey: summaryKey }),
    },
    202,
  );
  const completedSummaryJob = await waitForMemoryJob(conversation.id, summaryJob.id, headers);
  if (completedSummaryJob.status !== 'COMPLETED' || completedSummaryJob.attempts !== 1) {
    throw new Error('Deterministic memory job did not complete exactly once.');
  }
  const repeatedSummaryJob = await request(
    `/api/v1/conversations/${conversation.id}/memory/summarize`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ idempotencyKey: summaryKey }),
    },
    202,
  );
  if (repeatedSummaryJob.id !== summaryJob.id || repeatedSummaryJob.status !== 'COMPLETED') {
    throw new Error('Duplicate memory request was not resolved idempotently.');
  }
  const summarizedMemory = await request(
    `/api/v1/conversations/${conversation.id}/memory`,
    { headers },
    200,
  );
  if (
    summarizedMemory.active?.sourceType !== 'AUTO_SUMMARY' ||
    summarizedMemory.manualContext !== 'MANUAL_FACT: Алекс боится высоты.' ||
    summarizedMemory.active.manualContext !== summarizedMemory.manualContext ||
    !summarizedMemory.autoSummary.includes('Я осторожно открываю дверь архива.') ||
    summarizedMemory.active.autoSummary !== summarizedMemory.autoSummary ||
    !summarizedMemory.active.content.includes('PINNED_MANUAL_CONTEXT:') ||
    !summarizedMemory.active.content.includes('AUTO_SUMMARY:') ||
    summarizedMemory.lastSummarizedMessageId !== editedMessage.id ||
    summarizedMemory.estimatedTokens < 1
  ) {
    throw new Error('Memory inspector or deterministic summary coverage is inconsistent.');
  }
  const inspectorAfterAutomaticMemory = await request(
    `/api/v1/conversations/${conversation.id}/prompt-inspector`,
    { headers },
    200,
  );
  if (
    inspectorAfterAutomaticMemory.character.name !== 'Мира' ||
    inspectorAfterAutomaticMemory.persona?.name !== 'Алекс' ||
    !inspectorAfterAutomaticMemory.memory.includes('MANUAL_FACT: Алекс боится высоты.') ||
    !inspectorAfterAutomaticMemory.memory.includes('Я осторожно открываю дверь архива.') ||
    inspectorAfterAutomaticMemory.lore[0]?.id !== loreEntry.id ||
    inspectorAfterAutomaticMemory.recentMessages.at(-1)?.content !== editedMessage.content ||
    !inspectorAfterAutomaticMemory.chatInstructions.includes('Пиши для Алекс кинематографично.') ||
    !inspectorAfterAutomaticMemory.chatInstructions.includes(
      'Preferred response length: detailed',
    ) ||
    inspectorAfterAutomaticMemory.selectedModel?.providerModelId !== 'deepseek-chat-v3.1'
  ) {
    throw new Error(
      'Final Mira/Alex prompt inspector lost persona, manual/auto memory, style or model.',
    );
  }
  const versionsAfterSummary = await request(
    `/api/v1/conversations/${conversation.id}/memory/versions`,
    { headers },
    200,
  );
  if (versionsAfterSummary.items.length !== 3) {
    throw new Error('Duplicate memory job created an extra immutable version.');
  }
  await request(
    `/api/v1/conversations/${conversation.id}/messages/${editedMessage.id}/edit`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: `${editedMessage.content} Ещё осторожнее.`,
        idempotencyKey: `historical-edit:${randomUUID()}`,
      }),
    },
    201,
  );
  const staleMemory = await request(
    `/api/v1/conversations/${conversation.id}/memory`,
    { headers },
    200,
  );
  if (staleMemory.stale !== true || staleMemory.staleSinceMessageId !== editedMessage.id)
    throw new Error('Historical branch edit did not mark memory stale.');
  await request(
    `/api/v1/conversations/${conversation.id}/memory/keep`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ idempotencyKey: `keep:${randomUUID()}` }),
    },
    200,
  );
  const keptMemory = await request(
    `/api/v1/conversations/${conversation.id}/memory`,
    { headers },
    200,
  );
  if (
    keptMemory.stale !== false ||
    keptMemory.staleSinceMessageId !== null ||
    keptMemory.active.id !== summarizedMemory.active.id
  ) {
    throw new Error(
      `Keep-current mutated the immutable memory version: ${JSON.stringify({ keptMemory, summarizedMemory })}`,
    );
  }
  const longConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        greetingIndex: 0,
        idempotencyKey: `long-memory:${randomUUID()}`,
      }),
    },
    201,
  );
  const longInitialBranch = await request(
    `/api/v1/conversations/${longConversation.id}/messages`,
    { headers },
    200,
  );
  const longRootId = longInitialBranch.items[0]?.id;
  if (typeof longRootId !== 'string') throw new Error('Long-memory root was not created.');
  const initialLongManualContext = 'PINNED_LONG_FACT: Черновой владелец печати.';
  const longManualContext = 'PINNED_LONG_FACT: Медная печать принадлежит Мире.';
  await request(
    `/api/v1/conversations/${longConversation.id}/memory`,
    {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        manualContext: initialLongManualContext,
        idempotencyKey: `long-memory-manual:${randomUUID()}`,
      }),
    },
    201,
  );
  await request(
    `/api/v1/conversations/${longConversation.id}/memory`,
    {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        manualContext: '',
        idempotencyKey: `long-memory-clear:${randomUUID()}`,
      }),
    },
    201,
  );
  const clearedLongMemory = await request(
    `/api/v1/conversations/${longConversation.id}/memory`,
    { headers },
    200,
  );
  if (clearedLongMemory.manualContext !== '') {
    throw new Error('The user could not remove pinned manual context.');
  }
  await request(
    `/api/v1/conversations/${longConversation.id}/memory`,
    {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        manualContext: longManualContext,
        idempotencyKey: `long-memory-rewrite:${randomUUID()}`,
      }),
    },
    201,
  );
  const longPrefix = `long${randomUUID().replaceAll('-', '')}`;
  const longHistorySql = `
    WITH RECURSIVE sequence(n) AS (
      VALUES(1) UNION ALL SELECT n + 1 FROM sequence WHERE n < 1200
    )
    INSERT INTO messages
      (id, conversation_id, role, content, status, parent_message_id, created_at)
    SELECT '${longPrefix}' || printf('%04d', n), '${longConversation.id}',
      CASE WHEN n % 2 = 0 THEN 'ASSISTANT' ELSE 'USER' END,
      'Long event ' || n || ': verified chronological detail', 'COMPLETED',
      CASE WHEN n = 1 THEN '${longRootId}' ELSE '${longPrefix}' || printf('%04d', n - 1) END,
      ${now} + n
    FROM sequence;
    UPDATE conversations SET active_leaf_message_id = '${longPrefix}1200', updated_at = ${now + 1200}
      WHERE id = '${longConversation.id}';`;
  await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    longHistorySql,
  ]);
  const longMemoryPreview = await request(
    `/api/v1/conversations/${longConversation.id}/memory/regenerate/preview`,
    {
      method: 'POST',
      headers: { ...headers, 'x-csrf-token': csrfToken },
    },
    200,
  );
  if (
    longMemoryPreview.manualContext !== longManualContext ||
    longMemoryPreview.messageCount !== 1201 ||
    longMemoryPreview.toMessageId !== `${longPrefix}1200` ||
    !longMemoryPreview.generatedAutoSummary.includes('Long event 600:') ||
    longMemoryPreview.currentAutoSummary !== ''
  ) {
    throw new Error('Full-memory preview mutated or omitted active-branch history.');
  }
  const longMemoryJob = await request(
    `/api/v1/conversations/${longConversation.id}/memory/regenerate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ idempotencyKey: `long-regenerate:${randomUUID()}` }),
    },
    202,
  );
  const completedLongMemoryJob = await waitForMemoryJob(
    longConversation.id,
    longMemoryJob.id,
    headers,
  );
  if (completedLongMemoryJob.status !== 'COMPLETED') {
    throw new Error(`Long hierarchical memory failed: ${JSON.stringify(completedLongMemoryJob)}`);
  }
  const longMemory = await request(
    `/api/v1/conversations/${longConversation.id}/memory`,
    { headers },
    200,
  );
  if (
    longMemory.active?.sourceType !== 'FULL_REGENERATION' ||
    longMemory.manualContext !== longManualContext ||
    longMemory.active.manualContext !== longManualContext ||
    longMemory.active.fromMessageId !== longRootId ||
    longMemory.active.toMessageId !== `${longPrefix}1200` ||
    !longMemory.autoSummary.includes('Long event 600:') ||
    !longMemory.autoSummary.includes('Long event 1200:')
  ) {
    throw new Error(
      'Hierarchical memory did not preserve full-branch coverage beyond 500 messages.',
    );
  }
  const tree = await request(
    `/api/v1/conversations/${conversation.id}/messages?view=tree`,
    { headers },
    200,
  );
  if (
    tree.items.length !== 9 + publicCharacter.alternateGreetings.length ||
    tree.items.some((item) => item.id === editedAssistant.id) ||
    !tree.items.some((item) => item.id === secondAssistant.id && item.variantCount === 2)
  ) {
    throw new Error('Conversation branch tree is incomplete or contains a deleted branch.');
  }
  const disposableConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        idempotencyKey: `disposable-conversation:${randomUUID()}`,
      }),
    },
    201,
  );
  const disposableMessage = await request(
    `/api/v1/conversations/${disposableConversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'SLOW_DELETE_TEST: открой архив.',
        idempotencyKey: `disposable-message:${randomUUID()}`,
      }),
    },
    201,
  );
  const balanceBeforeDeletingActiveGeneration = await request('/api/v1/me', { headers }, 200);
  const slowGeneration = await fetch(
    `${baseUrl}/api/v1/conversations/${disposableConversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: disposableMessage.id,
        idempotencyKey: `disposable-generation:${randomUUID()}`,
      }),
    },
  );
  await request(
    `/api/v1/conversations/${disposableConversation.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  await slowGeneration.text();
  await request(`/api/v1/conversations/${disposableConversation.id}`, { headers }, 404);
  const balanceAfterDeletingActiveGeneration = await request('/api/v1/me', { headers }, 200);
  if (
    balanceAfterDeletingActiveGeneration.creditBalanceMicros !==
    balanceBeforeDeletingActiveGeneration.creditBalanceMicros
  ) {
    throw new Error('Deleting a chat allowed its stopped generation to charge AI credits.');
  }
  const stoppedProviderSpend = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT CASE WHEN provider_actual_cost_micros > 0 AND COALESCE(actual_cost_micros, 0) = 0
       AND status = 'REFUNDED' THEN 1 ELSE 0 END AS stopped_provider_spend_accounted
     FROM ai_requests WHERE conversation_id = '${disposableConversation.id}'
     ORDER BY created_at DESC LIMIT 1;`,
  ]);
  if (!stoppedProviderSpend.includes('"stopped_provider_spend_accounted": 1')) {
    throw new Error('Stopped provider work was not retained while the user charge was refunded.');
  }

  const failingConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        idempotencyKey: `failing-conversation:${randomUUID()}`,
      }),
    },
    201,
  );
  const failingMessage = await request(
    `/api/v1/conversations/${failingConversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'FAIL_ALL_TEST',
        idempotencyKey: `failing-message:${randomUUID()}`,
      }),
    },
    201,
  );
  const balanceBeforeFailedGeneration = await request('/api/v1/me', { headers }, 200);
  const failedGeneration = await fetch(
    `${baseUrl}/api/v1/conversations/${failingConversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: failingMessage.id,
        idempotencyKey: `failing-generation:${randomUUID()}`,
      }),
    },
  );
  const failedGenerationStream = await failedGeneration.text();
  if (failedGeneration.status !== 200 || !failedGenerationStream.includes('event: error')) {
    throw new Error('Forced provider exhaustion did not terminate as a streamed error.');
  }
  const balanceAfterFailedGeneration = await request('/api/v1/me', { headers }, 200);
  if (
    balanceAfterFailedGeneration.creditBalanceMicros !==
    balanceBeforeFailedGeneration.creditBalanceMicros
  ) {
    throw new Error('A failed provider chain charged the user.');
  }
  const failedProviderSpend = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT status, actual_cost_micros, provider_actual_cost_micros,
       provider_estimated_cost_micros,
       CASE WHEN provider_actual_cost_micros > 0
       AND provider_actual_cost_micros <= provider_estimated_cost_micros
       AND COALESCE(actual_cost_micros, 0) = 0
       AND status = 'FAILED' THEN 1 ELSE 0 END AS failed_provider_spend_accounted
     FROM ai_requests WHERE conversation_id = '${failingConversation.id}'
     ORDER BY created_at DESC LIMIT 1;`,
  ]);
  if (!failedProviderSpend.includes('"failed_provider_spend_accounted": 1')) {
    throw new Error(
      `Failed provider attempts escaped the global spend accounting: ${failedProviderSpend}`,
    );
  }

  const partialFailureConversation = await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        characterId: character.id,
        personaId: storyPersona.id,
        idempotencyKey: `partial-failure-conversation:${randomUUID()}`,
      }),
    },
    201,
  );
  const partialFailureMessage = await request(
    `/api/v1/conversations/${partialFailureConversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'PARTIAL_FAILURE_TEST',
        idempotencyKey: `partial-failure-message:${randomUUID()}`,
      }),
    },
    201,
  );
  const balanceBeforePartialFailure = await request('/api/v1/me', { headers }, 200);
  const partialFailureResponse = await fetch(
    `${baseUrl}/api/v1/conversations/${partialFailureConversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: partialFailureMessage.id,
        idempotencyKey: `partial-failure-generation:${randomUUID()}`,
      }),
    },
  );
  const partialFailureStream = await partialFailureResponse.text();
  if (
    partialFailureResponse.status !== 200 ||
    !partialFailureStream.includes('event: delta') ||
    !partialFailureStream.includes('Partial answer retained.') ||
    !partialFailureStream.includes('event: error')
  ) {
    throw new Error(
      `Partial provider failure did not stream delta then error: ${partialFailureStream}`,
    );
  }
  const partialFailureBranch = await request(
    `/api/v1/conversations/${partialFailureConversation.id}/messages?view=active`,
    { headers },
    200,
  );
  const retainedPartialMessage = partialFailureBranch.items.at(-1);
  if (
    retainedPartialMessage?.content !== 'Partial answer retained.' ||
    retainedPartialMessage?.status !== 'FAILED'
  ) {
    throw new Error(
      `Failed partial generation was not retained: ${JSON.stringify(retainedPartialMessage)}`,
    );
  }
  const balanceAfterPartialFailure = await request('/api/v1/me', { headers }, 200);
  if (
    balanceAfterPartialFailure.creditBalanceMicros !==
    balanceBeforePartialFailure.creditBalanceMicros
  ) {
    throw new Error('A partially failed provider response charged the user.');
  }
  // Keep the concurrency-lock scenario independent from the many generation
  // cost fixtures above it. The dedicated budget-limit case below inserts its
  // own explicit spend row and still verifies the real 429 guard.
  runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `UPDATE ai_requests SET provider_actual_cost_micros = 0
     WHERE user_id = '${userId}' AND status IN ('COMPLETED', 'FAILED');`,
  ]);
  let acceptedConcurrentStreams = 0;
  let rejectedConcurrentStreams = 0;
  const concurrentStreamTiming = await timedBurst(4, async (index) => {
    const loadConversation = await request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          characterId: character.id,
          personaId: storyPersona.id,
          idempotencyKey: `load-conversation:${String(index)}:${randomUUID()}`,
        }),
      },
      201,
    );
    const loadMessage = await request(
      `/api/v1/conversations/${loadConversation.id}/messages`,
      {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          content: `Параллельная история ${String(index)} открывает архив и секретный проход.`,
          idempotencyKey: `load-message:${String(index)}:${randomUUID()}`,
        }),
      },
      201,
    );
    const response = await fetch(
      `${baseUrl}/api/v1/conversations/${loadConversation.id}/generate`,
      {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          parentMessageId: loadMessage.id,
          idempotencyKey: `load-generation:${String(index)}:${randomUUID()}`,
        }),
      },
    );
    const streamBody = await response.text();
    if (response.status === 200 && streamBody.includes('event: done')) {
      acceptedConcurrentStreams += 1;
      return;
    }
    if (response.status === 409 && streamBody.includes('GENERATION_IN_PROGRESS')) {
      rejectedConcurrentStreams += 1;
      return;
    }
    {
      throw new Error(
        `Concurrent stream ${String(index)} failed with ${String(response.status)}: ${streamBody}`,
      );
    }
  });
  if (acceptedConcurrentStreams !== 1 || rejectedConcurrentStreams !== 3) {
    throw new Error(
      `Per-user generation lock accepted ${String(acceptedConcurrentStreams)} and rejected ${String(rejectedConcurrentStreams)} requests instead of 1/3.`,
    );
  }
  const sessionHeaderPool = [headers, reporterHeaders, adminHeaders, ownerHeaders];
  const concurrentUserTiming = await timedBurst(40, async (index) => {
    const requestHeaders = sessionHeaderPool[index % sessionHeaderPool.length];
    const response = await fetch(`${baseUrl}/api/v1/me`, { headers: requestHeaders });
    if (response.status !== 200) {
      throw new Error(`Concurrent authenticated request failed with ${String(response.status)}.`);
    }
    await response.arrayBuffer();
  });
  const d1Timing = await timedBurst(40, async () => {
    const response = await fetch(`${baseUrl}/ready`);
    if (response.status !== 200) {
      throw new Error(`Concurrent D1 readiness request failed with ${String(response.status)}.`);
    }
    await response.arrayBuffer();
  });
  const searchTiming = await timedBurst(40, async (index) => {
    const requestHeaders = sessionHeaderPool[index % sessionHeaderPool.length];
    const response = await fetch(
      `${baseUrl}/api/v1/discovery?q=${encodeURIComponent(`load-${String(index % 5)}`)}`,
      { headers: requestHeaders },
    );
    if (response.status !== 200) {
      const responseBody = await response.text();
      throw new Error(
        `Concurrent search request failed with ${String(response.status)}: ${responseBody.slice(0, 500)}.`,
      );
    }
    await response.arrayBuffer();
  });
  for (const [name, timing, ceilingMs] of [
    ['authenticated', concurrentUserTiming, 5_000],
    ['d1-ready', d1Timing, 5_000],
    ['search', searchTiming, 7_500],
    ['ai-stream', concurrentStreamTiming, 10_000],
  ]) {
    if (timing.p95Ms > ceilingMs) {
      throw new Error(
        `${name} local load p95 ${timing.p95Ms.toFixed(1)}ms exceeded ${String(ceilingMs)}ms.`,
      );
    }
  }
  process.stdout.write(
    `Local load smoke passed: users=${formatTiming(concurrentUserTiming)}, D1=${formatTiming(d1Timing)}, search=${formatTiming(searchTiming)}, AI=${formatTiming(concurrentStreamTiming)}.\n`,
  );
  runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `INSERT INTO ai_requests
      (id, user_id, provider, model, purpose, estimated_cost_micros,
       provider_estimated_cost_micros, actual_cost_micros, provider_actual_cost_micros,
       status, idempotency_key, created_at, completed_at, billing_mode)
     VALUES ('${randomUUID()}', '${userId}', 'BOTHUB', 'budget-fixture', 'ROLEPLAY',
       0, 0, 0, 500000, 'COMPLETED', 'per-user-budget-${randomUUID()}',
       ${Date.now()}, ${Date.now()}, 'USER_CREDITS');`,
  ]);
  const budgetLimitedMessage = await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'Проверка отдельного дневного лимита пользователя.',
        idempotencyKey: `per-user-budget-message:${randomUUID()}`,
      }),
    },
    201,
    { transportRetries: 2 },
  );
  const budgetLimitError = await request(
    `/api/v1/conversations/${conversation.id}/generate`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        parentMessageId: budgetLimitedMessage.id,
        idempotencyKey: `per-user-budget-generation:${randomUUID()}`,
      }),
    },
    429,
  );
  if (budgetLimitError?.error?.code !== 'USER_DAILY_AI_BUDGET_EXHAUSTED') {
    throw new Error(`Unexpected per-user budget response: ${JSON.stringify(budgetLimitError)}`);
  }
  await request(
    `/api/v1/conversations/${conversation.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ state: 'ARCHIVED', title: 'Архивный путь' }),
    },
    200,
  );
  await request(
    `/api/v1/conversations/${conversation.id}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        content: 'Нельзя добавить в архив.',
        idempotencyKey: `message:${randomUUID()}`,
      }),
    },
    409,
  );
  await request(
    `/api/v1/conversations/${conversation.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  await request(`/api/v1/conversations/${conversation.id}`, { headers }, 404);

  await request(
    `/api/v1/blocks/${userId}`,
    { method: 'PUT', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  const blocks = await request('/api/v1/blocks', { headers: reporterHeaders }, 200);
  if (blocks.items.length !== 1 || blocks.items[0]?.userId !== userId) {
    throw new Error('Blocked-user list did not persist the relationship.');
  }
  await request(`/api/v1/profiles/${userId}`, { headers: reporterHeaders }, 404);
  const blockedDiscovery = await request(
    `/api/v1/discovery?q=${encodeURIComponent(characterName)}`,
    { headers: reporterHeaders },
    200,
  );
  if (blockedDiscovery.items.length !== 0) {
    throw new Error('Blocked creator remained visible in discovery.');
  }
  await request(`/api/v1/discovery/${character.id}`, { headers: reporterHeaders }, 404);
  await request(`/api/v1/public/characters/${character.id}`, { headers: reporterHeaders }, 404);
  const blockedTrending = await request(
    '/api/v1/public/trending',
    { headers: reporterHeaders },
    200,
  );
  if (blockedTrending.items.some((item) => item.id === character.id)) {
    throw new Error('Cached trending response bypassed a user block.');
  }
  await request(
    '/api/v1/conversations',
    {
      method: 'POST',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        characterId: character.id,
        idempotencyKey: `blocked-conversation:${randomUUID()}`,
      }),
    },
    404,
  );
  await request(
    `/api/v1/blocks/${userId}`,
    { method: 'DELETE', headers: { ...reporterHeaders, 'x-csrf-token': reporterCsrfToken } },
    200,
  );
  await request(`/api/v1/discovery/${character.id}`, { headers: reporterHeaders }, 200);

  await request('/api/v1/admin/moderation/cases', { headers }, 403);
  const report = await request(
    '/api/v1/reports',
    {
      method: 'POST',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        targetType: 'CHARACTER',
        targetId: character.id,
        reason: 'IMPERSONATION',
        description: 'Regression report for the moderation workflow.',
      }),
    },
    201,
  );
  const riskContext = await request(
    `/api/v1/admin/moderation/risk/${userId}`,
    { headers: adminHeaders },
    200,
  );
  if (
    riskContext.informationalOnly !== true ||
    riskContext.automaticSanction !== false ||
    riskContext.activeSignalCount !== 1 ||
    riskContext.items[0]?.sourceId !== report.id
  ) {
    throw new Error(
      'Report risk signal is missing or can incorrectly trigger an automatic sanction.',
    );
  }
  const activeAfterSignal = await request('/api/v1/me', { headers }, 200);
  if (activeAfterSignal.moderationState !== 'ACTIVE') {
    throw new Error('A single risk signal changed account state without moderator review.');
  }
  await request(
    '/api/v1/reports',
    {
      method: 'POST',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        targetType: 'CHARACTER',
        targetId: character.id,
        reason: 'SPAM',
      }),
    },
    409,
  );
  const queue = await request(
    '/api/v1/admin/moderation/cases?state=OPEN',
    { headers: adminHeaders },
    200,
  );
  if (queue.items.length !== 1 || queue.items[0]?.id !== report.caseId) {
    throw new Error('New report did not enter the moderator queue.');
  }
  await request(
    `/api/v1/admin/moderation/cases/${report.caseId}/assign`,
    { method: 'POST', headers: { ...adminHeaders, 'x-csrf-token': adminCsrfToken } },
    200,
  );
  await request(
    `/api/v1/admin/moderation/cases/${report.caseId}/actions`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({ action: 'CONTENT_HIDE', reason: 'Integration moderation decision.' }),
    },
    200,
  );
  const hiddenDiscovery = await request(
    `/api/v1/discovery?q=${encodeURIComponent(characterName)}`,
    { headers: reporterHeaders },
    200,
  );
  if (hiddenDiscovery.items.length !== 0) {
    throw new Error('Moderation-hidden character remains discoverable.');
  }
  const appeal = await request(
    '/api/v1/appeals',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        caseId: report.caseId,
        statement: 'Прошу пересмотреть ошибочное скрытие тестового персонажа.',
      }),
    },
    201,
  );
  await request(
    `/api/v1/admin/moderation/appeals/${appeal.id}/decision`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({ decision: 'OVERTURNED', reason: 'Evidence reviewed again.' }),
    },
    200,
  );
  const restoredDiscovery = await request(
    `/api/v1/discovery?q=${encodeURIComponent(characterName)}`,
    { headers: reporterHeaders },
    200,
  );
  if (restoredDiscovery.items[0]?.id !== character.id) {
    throw new Error('Overturned appeal did not restore the character state.');
  }
  const caseDetails = await request(
    `/api/v1/admin/moderation/cases/${report.caseId}`,
    { headers: adminHeaders },
    200,
  );
  if (
    caseDetails.state !== 'CLOSED' ||
    caseDetails.actions.length !== 1 ||
    caseDetails.appeals[0]?.status !== 'OVERTURNED' ||
    caseDetails.audit.length < 4
  ) {
    throw new Error('Moderation case, appeal, or append-only audit is incomplete.');
  }
  const audit = await request('/api/v1/admin/audit', { headers: adminHeaders }, 200);
  if (!audit.items.some((item) => item.targetId === report.caseId)) {
    throw new Error('Moderation events are missing from the audit endpoint.');
  }
  await request(
    '/api/v1/age-gate',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ confirmedAdult: true }),
    },
    200,
  );
  await request(
    '/api/v1/settings',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ nsfwVisible: true, safeSearch: false, matureImageBlur: true }),
    },
    200,
  );
  const matureCharacter = await request(
    '/api/v1/characters',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        name: matureCharacterName,
        tagline: 'Закрытая история для совершеннолетних',
        description:
          'Взрослая вымышленная история, которая до публикации должна пройти отдельную проверку.',
        personality: 'Взрослый спокойный персонаж с ясно обозначенными безопасными границами.',
        firstMessage: 'Перед началом истории договоримся о границах и взаимном согласии.',
        language: 'ru',
        contentRating: 'MATURE',
        tags: ['mature'],
      }),
    },
    201,
  );
  const pendingMature = await request(
    `/api/v1/characters/${matureCharacter.id}/publish`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ visibility: 'PUBLIC' }),
    },
    200,
  );
  if (pendingMature.publishState !== 'MODERATION_PENDING') {
    throw new Error('Mature character bypassed conservative moderation.');
  }
  await request(
    `/api/v1/characters/${matureCharacter.id}/publish`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ visibility: 'PUBLIC' }),
    },
    200,
  );
  const hiddenPendingMature = await request(
    `/api/v1/discovery?q=${encodeURIComponent(matureCharacterName)}&rating=ALL`,
    { headers },
    200,
  );
  if (hiddenPendingMature.items.some((item) => item.id === matureCharacter.id)) {
    throw new Error('Unreviewed Mature character appeared in discovery.');
  }
  const matureQueue = await request(
    '/api/v1/admin/moderation/cases?state=OPEN',
    { headers: adminHeaders },
    200,
  );
  const matureCases = matureQueue.items.filter(
    (item) => item.targetId === matureCharacter.id && item.reportId === null,
  );
  if (matureCases.length !== 1) {
    throw new Error('Repeated Mature publication did not create exactly one active review.');
  }
  const matureCaseId = matureCases[0].id;
  await request(
    `/api/v1/admin/moderation/cases/${matureCaseId}/assign`,
    { method: 'POST', headers: { ...adminHeaders, 'x-csrf-token': adminCsrfToken } },
    200,
  );
  await request(
    `/api/v1/admin/moderation/cases/${matureCaseId}/actions`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({ action: 'WARNING', reason: 'Invalid action regression.' }),
    },
    409,
  );
  await request(
    `/api/v1/admin/moderation/cases/${matureCaseId}/actions`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({ action: 'NO_ACTION', reason: 'Age and safety review passed.' }),
    },
    200,
  );
  const approvedMature = await request(
    `/api/v1/discovery?q=${encodeURIComponent(matureCharacterName)}&rating=ALL`,
    { headers },
    200,
  );
  if (!approvedMature.items.some((item) => item.id === matureCharacter.id)) {
    throw new Error('Approved Mature character did not enter discovery.');
  }
  const safeSearchSettings = await request(
    '/api/v1/settings',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ safeSearch: true }),
    },
    200,
  );
  if (!safeSearchSettings.safeSearch || !safeSearchSettings.matureImageBlur) {
    throw new Error('Mature discovery controls were not persisted.');
  }
  const safeSearchResult = await request(
    `/api/v1/discovery?q=${encodeURIComponent(matureCharacterName)}&rating=ALL`,
    { headers },
    200,
  );
  if (safeSearchResult.items.some((item) => item.id === matureCharacter.id)) {
    throw new Error('Safe Search did not filter Mature content at query time.');
  }
  if (!safeSearchResult.contentPreferences?.safeSearch) {
    throw new Error('Discovery did not report the effective server safety preference.');
  }
  await request(
    '/api/v1/settings',
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ safeSearch: false }),
    },
    200,
  );
  const changedMature = await request(
    `/api/v1/characters/${matureCharacter.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        baseVersion: matureCharacter.version,
        description:
          'Изменённая взрослая история должна снова пройти проверку до возвращения в каталог.',
      }),
    },
    200,
  );
  if (changedMature.publishState !== 'MODERATION_PENDING') {
    throw new Error('Editing an approved Mature character bypassed repeat review.');
  }
  await request(
    `/api/v1/characters/${matureCharacter.id}/unpublish`,
    { method: 'POST', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const matureQueueAfterCancel = await request(
    '/api/v1/admin/moderation/cases?state=OPEN',
    { headers: adminHeaders },
    200,
  );
  if (matureQueueAfterCancel.items.some((item) => item.targetId === matureCharacter.id)) {
    throw new Error('Cancelled Mature review remained in the active queue.');
  }
  await request(
    `/api/v1/characters/${matureCharacter.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const profileReport = await request(
    '/api/v1/reports',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        targetType: 'USER_PROFILE',
        targetId: reporterId,
        reason: 'IMPERSONATION',
        description: 'Profile content moderation and restoration regression.',
      }),
    },
    201,
  );
  await request(
    `/api/v1/admin/moderation/cases/${profileReport.caseId}/actions`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({
        action: 'CONTENT_REMOVE',
        reason: 'Remove unsafe profile presentation.',
      }),
    },
    200,
  );
  const moderatedOwnProfile = await request(
    '/api/v1/profiles/me',
    { headers: reporterHeaders },
    200,
  );
  if (moderatedOwnProfile.visibility !== 'PRIVATE' || moderatedOwnProfile.bio !== '') {
    throw new Error('Profile content moderation did not remove and hide the presentation.');
  }
  const profileAppeal = await request(
    '/api/v1/appeals',
    {
      method: 'POST',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        caseId: profileReport.caseId,
        statement: 'Please restore the test profile after reviewing its presentation again.',
      }),
    },
    201,
  );
  await request(
    `/api/v1/admin/moderation/appeals/${profileAppeal.id}/decision`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({ decision: 'OVERTURNED', reason: 'Profile evidence reviewed again.' }),
    },
    200,
  );
  const restoredPublicProfile = await request(`/api/v1/profiles/${reporterId}`, { headers }, 200);
  if (restoredPublicProfile.visibility !== 'PUBLIC') {
    throw new Error('Overturned appeal did not restore the profile presentation.');
  }
  const accountReport = await request(
    '/api/v1/reports',
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        targetType: 'USER_PROFILE',
        targetId: reporterId,
        reason: 'ABUSE_HARASSMENT',
        description: 'Account restriction and appeal recovery regression.',
      }),
    },
    201,
  );
  await request(
    `/api/v1/admin/moderation/cases/${accountReport.caseId}/actions`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({
        action: 'ACCOUNT_SUSPEND',
        reason: 'Temporary integration restriction.',
      }),
    },
    200,
  );
  const suspendedMe = await request('/api/v1/me', { headers: reporterHeaders }, 200);
  if (suspendedMe.moderationState !== 'SUSPENDED') {
    throw new Error('Suspended user cannot inspect the account state.');
  }
  await request('/api/v1/discovery', { headers: reporterHeaders }, 403);
  const accountAppeal = await request(
    '/api/v1/appeals',
    {
      method: 'POST',
      headers: {
        ...reporterHeaders,
        'content-type': 'application/json',
        'x-csrf-token': reporterCsrfToken,
      },
      body: JSON.stringify({
        caseId: accountReport.caseId,
        statement: 'Прошу пересмотреть временное ограничение тестового аккаунта.',
      }),
    },
    201,
  );
  await request(
    `/api/v1/admin/moderation/appeals/${accountAppeal.id}/decision`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'x-csrf-token': adminCsrfToken,
      },
      body: JSON.stringify({ decision: 'OVERTURNED', reason: 'Restriction regression cleared.' }),
    },
    200,
  );
  await request('/api/v1/discovery', { headers: reporterHeaders }, 200);

  const deletionR2Upload = await request(
    '/api/v1/media',
    {
      method: 'POST',
      headers: {
        ...deletionHeaders,
        'content-type': 'image/png',
        'x-csrf-token': deletionCsrfToken,
        'x-upload-name': 'erasure-proof.png',
      },
      body: directImage,
    },
    201,
  );
  const deletionR2Path = `velora-local-media/images/${deletionUserId}/${deletionR2Upload.id}.png`;
  if (localR2ObjectStatus(deletionR2Path) !== 0) {
    throw new Error('Account deletion R2 fixture was not persisted before erasure.');
  }

  const scheduled = await fetchAfterLocalWranglerAudit(`${baseUrl}/__scheduled?cron=*+*+*+*+*`);
  const scheduledBody = await scheduled.text();
  if (!scheduled.ok) throw new Error(`Scheduled deletion trigger failed: ${scheduled.status}.`);
  const expectedConfigurationMutations = [
    'setWebhook',
    'setMyCommands:default',
    'setMyCommands:ru',
    'setMyCommands:en',
    'setChatMenuButton',
    'setMyDescription',
    'setMyShortDescription',
  ];
  for (
    let attempt = 0;
    attempt < 100 &&
    (expectedConfigurationMutations.some(
      (mutation) => !telegramConfigurationMutations.includes(mutation),
    ) ||
      aiHealthChecks === 0);
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (
    telegramConfigurationMutations.length !== expectedConfigurationMutations.length ||
    expectedConfigurationMutations.some(
      (mutation) => !telegramConfigurationMutations.includes(mutation),
    )
  ) {
    throw new Error(
      `Telegram reconciliation did not apply the exact desired configuration: ${JSON.stringify(telegramConfigurationMutations)}`,
    );
  }
  const runtimeCapacityState = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT core_chat_enabled, observed_at > 0 AS refreshed
     FROM runtime_capacity_state WHERE state_key = 'cloudflare-free';`,
  ]);
  if (
    !runtimeCapacityState.includes('"core_chat_enabled": 1') ||
    !runtimeCapacityState.includes('"refreshed": 1')
  ) {
    throw new Error('Scheduled capacity policy did not persist a core-chat-safe runtime state.');
  }
  const reconciliationAudit = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT state, attempts, verified_at IS NOT NULL AS verified,
       LENGTH(desired_hash) AS hash_length, last_error_code
     FROM integration_reconciliations WHERE integration_key = 'telegram_bot';`,
  ]);
  for (const expected of [
    '"state": "READY"',
    '"attempts": 0',
    '"verified": 1',
    '"hash_length": 64',
    '"last_error_code": null',
  ]) {
    if (!reconciliationAudit.includes(expected)) {
      throw new Error(`Telegram reconciliation audit is missing ${expected}.`);
    }
  }
  let botHubReconciliationAudit = '';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    botHubReconciliationAudit = await runWranglerAudit([
      'd1',
      'execute',
      'velora-local',
      '--local',
      '--env',
      'local',
      '--command',
      `SELECT state, attempts, verified_at IS NOT NULL AS verified,
         LENGTH(desired_hash) AS hash_length, last_error_code
       FROM integration_reconciliations WHERE integration_key = 'bothub_provider';`,
    ]);
    if (botHubReconciliationAudit.includes('"state": "READY"')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const expected of [
    '"state": "READY"',
    '"attempts": 0',
    '"verified": 1',
    '"hash_length": 64',
    '"last_error_code": null',
  ]) {
    if (!botHubReconciliationAudit.includes(expected)) {
      throw new Error(`BotHub reconciliation audit is missing ${expected}.`);
    }
  }
  const botHubCapabilityAudit = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT provider, available_candidates_json, selected_model,
       LENGTH(catalog_sha256) AS catalog_hash_length, checked_at > 0 AS checked
     FROM provider_model_capabilities WHERE provider = 'BOTHUB';`,
  ]);
  for (const expected of [
    '"provider": "BOTHUB"',
    'deepseek-chat-v3.1',
    'l3-lunaris-8b',
    'mistral-nemo',
    '"selected_model": "deepseek-chat-v3.1"',
    '"catalog_hash_length": 64',
    '"checked": 1',
  ]) {
    if (!botHubCapabilityAudit.includes(expected)) {
      throw new Error(`BotHub capability audit is missing ${expected}.`);
    }
  }
  if (botHubCapabilityAudit.includes('other-model')) {
    throw new Error('BotHub capability audit persisted an unreviewed model identifier.');
  }
  const mutationCount = telegramConfigurationMutations.length;
  const healthCheckCount = aiHealthChecks;
  const repeatedScheduled = await fetchAfterLocalWranglerAudit(
    `${baseUrl}/__scheduled?cron=*+*+*+*+*`,
  );
  await repeatedScheduled.text();
  if (
    !repeatedScheduled.ok ||
    telegramConfigurationMutations.length !== mutationCount ||
    aiHealthChecks !== healthCheckCount
  ) {
    throw new Error('A completed external reconciliation repeated before its verification window.');
  }
  try {
    await waitForStatus('/api/v1/me', { headers: deletionHeaders }, 401);
  } catch (error) {
    const diagnostic = await fetch(`${baseUrl}/api/v1/data-controls`, {
      headers: deletionHeaders,
    });
    throw new Error(
      `${error.message} Scheduled response: ${scheduledBody}. Deletion state: ${await diagnostic.text()}.`,
      { cause: error },
    );
  }
  if (localR2ObjectStatus(deletionR2Path) === 0) {
    throw new Error('Account deletion left the user R2 object behind.');
  }
  const deletionAudit = await runWranglerAudit([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `SELECT u.deleted_at IS NOT NULL AS tombstoned,
      (SELECT COUNT(*) FROM sessions WHERE user_id = u.id) AS sessions,
      (SELECT COUNT(*) FROM personas WHERE user_id = u.id) AS personas,
      (SELECT COUNT(*) FROM onboarding_completions WHERE user_id = u.id) AS onboarding,
      (SELECT COUNT(*) FROM support_requests WHERE user_id = u.id) AS support_requests,
      (SELECT COUNT(*) FROM user_profiles WHERE user_id = u.id) AS user_profiles,
      (SELECT COUNT(*) FROM credit_transactions WHERE user_id = u.id) AS financial_records,
      (SELECT state FROM account_deletion_requests WHERE user_id = u.id) AS deletion_state
     FROM users u WHERE u.id = '${deletionUserId}';`,
  ]);
  for (const expected of [
    '"tombstoned": 1',
    '"sessions": 0',
    '"personas": 0',
    '"onboarding": 0',
    '"support_requests": 0',
    '"user_profiles": 0',
    '"financial_records": 1',
    '"deletion_state": "COMPLETED"',
  ]) {
    if (!deletionAudit.includes(expected)) {
      throw new Error(`Account erasure audit is missing ${expected}.`);
    }
  }
  const duplicate = await request(
    `/api/v1/characters/${character.id}/duplicate`,
    { method: 'POST', headers: { ...headers, 'x-csrf-token': csrfToken } },
    201,
  );
  if (
    duplicate.visibility !== 'PRIVATE' ||
    duplicate.version !== 1 ||
    duplicate.avatarFocalX !== 31 ||
    duplicate.avatarFocalY !== 69
  ) {
    throw new Error('Character duplicate is not an independent private draft.');
  }
  const newestCharacters = await request(
    '/api/v1/characters?sort=newest&visibility=ALL',
    { headers },
    200,
  );
  const oldestCharacters = await request(
    '/api/v1/characters?sort=oldest&visibility=ALL',
    { headers },
    200,
  );
  const privateCharacters = await request(
    `/api/v1/characters?q=${encodeURIComponent(characterName)}&sort=newest&visibility=PRIVATE`,
    { headers },
    200,
  );
  if (
    JSON.stringify(newestCharacters.items.map((item) => item.id)) !==
      JSON.stringify(oldestCharacters.items.map((item) => item.id).reverse()) ||
    privateCharacters.items.length !== 1 ||
    privateCharacters.items[0]?.id !== duplicate.id
  ) {
    throw new Error(
      'Owned character search/visibility/sort query did not reach deterministic D1 ordering.',
    );
  }
  await request(
    `/api/v1/characters/${character.id}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const characters = await request('/api/v1/characters', { headers }, 200);
  if (!Array.isArray(characters.items) || characters.items.length !== 1) {
    throw new Error('Character delete/list ownership flow is inconsistent.');
  }
  const discoveryAfterDelete = await request(
    `/api/v1/discovery?q=${encodeURIComponent(characterName)}`,
    { headers },
    200,
  );
  if (!Array.isArray(discoveryAfterDelete.items) || discoveryAfterDelete.items.length !== 0) {
    throw new Error('Deleted/private characters leaked into discovery.');
  }
  const media = await request('/api/v1/media', { headers }, 200);
  if (!Array.isArray(media.items) || media.items[0]?.id !== mediaId) {
    throw new Error('Owned Telegram media is missing from the media library.');
  }
  await request(
    `/api/v1/media/${mediaId}`,
    { method: 'DELETE', headers: { ...headers, 'x-csrf-token': csrfToken } },
    200,
  );
  const mediaAfterDelete = await request('/api/v1/media', { headers }, 200);
  if (!Array.isArray(mediaAfterDelete.items) || mediaAfterDelete.items.length !== 0) {
    throw new Error('Deleted media remains in the media library.');
  }
  let searchRateLimited = false;
  // Two full windows cover the legitimate fixed-window boundary burst.
  for (let attempt = 0; attempt < 130; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/v1/discovery`, { headers: reporterHeaders });
    if (response.status === 429) {
      const rawPayload = await response.text();
      let payload;
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        throw new Error(`Rate limit returned non-JSON payload: ${rawPayload.slice(0, 240)}`);
      }
      if (
        payload.error?.code !== 'RATE_LIMITED' ||
        !Array.isArray(payload.error?.details) ||
        payload.error.details[0]?.scope !== 'SEARCH'
      ) {
        throw new Error('Rate limit error does not expose the safe recovery contract.');
      }
      searchRateLimited = true;
      break;
    }
    if (response.status !== 200 || response.headers.get('x-ratelimit-limit') !== '60') {
      throw new Error('Search rate limit headers or successful requests are inconsistent.');
    }
  }
  if (!searchRateLimited) {
    throw new Error('Repeated search requests were not bounded server-side.');
  }
  await request(
    '/api/v1/auth/logout',
    { method: 'POST', headers: { ...headers, 'x-csrf-token': csrfToken } },
    204,
  );
  await request('/api/v1/me', { headers }, 401);
  process.stdout.write(
    'Local Worker auth/settings/persona/character/discovery/media/conversation/moderation integration passed.\n',
  );
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  throw new Error(`${message}\nRecent Wrangler output:\n${workerOutput}`, { cause: error });
} finally {
  const workerExit =
    worker.exitCode === null
      ? new Promise((resolve) => {
          worker.once('exit', resolve);
        })
      : Promise.resolve();
  worker.kill();
  await workerExit;
  await new Promise((resolve) => providerServer.close(resolve));
  if (!cleanupPersistenceRoot()) {
    process.stderr.write(
      `Warning: Windows still holds the isolated test directory; exit cleanup will retry: ${persistenceRoot}\n`,
    );
  }
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (worker.exitCode !== null) throw new Error(`Wrangler exited early.\n${workerOutput}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Startup connection failures are expected until workerd binds the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Wrangler did not become ready.\n${workerOutput}`);
}

async function cachedPublicRequest(pathname, expectedCacheStatus, requestHeaders) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...(requestHeaders ? { headers: requestHeaders } : {}),
  });
  const body = await response.json();
  if (response.status !== 200 || response.headers.get('x-velora-cache') !== expectedCacheStatus) {
    throw new Error(
      `Expected ${expectedCacheStatus} cache response from ${pathname}, received ${response.status}/${response.headers.get('x-velora-cache')}: ${JSON.stringify(body)}.`,
    );
  }
  return { body, cacheStatus: expectedCacheStatus };
}

async function waitForPublicCacheHit(pathname, requestHeaders) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...(requestHeaders ? { headers: requestHeaders } : {}),
    });
    await response.text();
    if (response.ok && response.headers.get('x-velora-cache') === 'HIT') return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Public cache never returned HIT for ${pathname}.`);
}

async function waitForPublicCacheMiss(pathname, requestHeaders) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...(requestHeaders ? { headers: requestHeaders } : {}),
    });
    const body = await response.json();
    if (response.ok && response.headers.get('x-velora-cache') === 'MISS') {
      return { body, cacheStatus: 'MISS' };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Public cache was not invalidated for ${pathname}.`);
}

async function waitForMemoryJob(conversationId, jobId, requestHeaders) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const job = await request(
      `/api/v1/conversations/${conversationId}/memory/jobs/${jobId}`,
      { headers: requestHeaders },
      200,
    );
    if (job.status === 'COMPLETED' || job.status === 'DEAD') return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Memory job ${jobId} did not finish in time.`);
}

async function waitForStatus(pathname, init, expectedStatus) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${pathname}`, init);
      lastStatus = response.status;
      await response.text();
      if (lastStatus === expectedStatus) return;
    } catch {
      // A local Wrangler D1 audit can briefly recycle the dev connection. The eventual status
      // remains mandatory, so only this bounded polling helper tolerates the transport gap.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${pathname} remained at status ${lastStatus}; expected ${expectedStatus}.`);
}

async function fetchAfterLocalWranglerAudit(url) {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Local Wrangler did not recover after a D1 audit.', { cause: lastError });
}

async function waitForStableLocalWrangler() {
  let consecutiveHealthyResponses = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      await response.text();
      consecutiveHealthyResponses = response.ok ? consecutiveHealthyResponses + 1 : 0;
      if (consecutiveHealthyResponses >= 2) return;
    } catch {
      consecutiveHealthyResponses = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error('Local Wrangler did not become stable after the D1 smoke audit.');
}

async function runWranglerAudit(argumentsList) {
  const output = runWrangler(argumentsList);
  await waitForStableLocalWrangler();
  return output;
}

async function request(pathname, init, expectedStatus, options = {}) {
  const transportRetries = options.transportRetries ?? 0;
  let response;
  let lastTransportError;
  for (let attempt = 0; attempt <= transportRetries; attempt += 1) {
    try {
      response = await fetch(`${baseUrl}${pathname}`, init);
      break;
    } catch (error) {
      lastTransportError = error;
      if (attempt === transportRetries) {
        throw new Error(`Transport failure while requesting ${pathname}.`, { cause: error });
      }
      await waitForStableLocalWrangler();
    }
  }
  if (!response) {
    throw new Error(`Transport failure while requesting ${pathname}.`, {
      cause: lastTransportError,
    });
  }
  const rawBody = response.status === 204 ? '' : await response.text();
  let body = null;
  if (response.status !== 204) {
    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      throw new Error(
        `Expected JSON from ${pathname}, received HTTP ${response.status} with body: ${rawBody.slice(0, 500)}`,
        { cause: error },
      );
    }
  }
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected ${expectedStatus} from ${pathname}, received ${response.status}: ${JSON.stringify(body)}\n${workerOutput}`,
    );
  }
  return body;
}

async function timedBurst(count, action) {
  const durations = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const startedAt = performance.now();
      await action(index);
      return performance.now() - startedAt;
    }),
  );
  durations.sort((left, right) => left - right);
  return {
    count,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: durations.at(-1) ?? 0,
  };
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1);
  return sortedValues[index] ?? 0;
}

function formatTiming(timing) {
  return `${String(timing.count)}@p50=${timing.p50Ms.toFixed(1)}ms/p95=${timing.p95Ms.toFixed(1)}ms/max=${timing.maxMs.toFixed(1)}ms`;
}
