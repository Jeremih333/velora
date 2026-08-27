import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  katyaCharacter,
  katyaLorebook,
  worldLorebook,
} from './cold-embrace-analysis/katya-content.mjs';

const OWNER_ID = 'b102981e-8abc-4550-ae2b-5c31f47c2fa3';
const OWNER_TELEGRAM_ID = '1040929628';
const AVATAR_BOT_ID = '92ca981e-660d-4c4e-8c92-ed41de400dff';
const KATYA_TELEGRAM_BOT_ID = '8412821764';
const KATYA_TELEGRAM_USERNAME = 'katyaneyobot';
const APP_URL = process.env.PUBLIC_APP_URL ?? 'https://velora-app.carreljeremih.workers.dev';
const commands = [
  { command: 'start', description: 'Запустить персонажа' },
  { command: 'help', description: 'Настройка и помощь' },
  { command: 'info', description: 'О Кате и VeloraAI' },
  { command: 'memory', description: 'Память этого чата' },
  { command: 'model', description: 'Выбрать модель' },
  { command: 'clear', description: 'Очистить историю чата' },
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sql(value) {
  if (value === null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function telegram(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    ...(body instanceof FormData
      ? { body }
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    throw new Error(`Telegram ${method} failed with HTTP ${response.status}.`);
  }
  return result.result;
}

function encryptToken(token, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('CHILD_BOT_ENCRYPTION_KEY must contain 32 bytes.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`child-bot:${AVATAR_BOT_ID}`, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64') };
}

function webhookSecret(keyBase64) {
  return createHmac('sha256', Buffer.from(keyBase64, 'base64'))
    .update(`webhook:${AVATAR_BOT_ID}`, 'utf8')
    .digest('base64url');
}

function loreStatements(lorebook, now) {
  const statements = [
    `INSERT INTO lorebooks (id,owner_id,name,description,visibility,created_at,updated_at,deleted_at) VALUES (${sql(lorebook.id)},${sql(OWNER_ID)},${sql(lorebook.name)},${sql(lorebook.description)},'PRIVATE',${now},${now},NULL) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,visibility='PRIVATE',updated_at=excluded.updated_at,deleted_at=NULL;`,
  ];
  lorebook.entries.forEach(([title, keys, priority, content], position) => {
    const entryId = `${lorebook.id}-entry-${String(position + 1).padStart(2, '0')}`;
    statements.push(
      `INSERT INTO lorebook_entries (id,lorebook_id,title,content,keys_json,secondary_keys_json,enabled,priority,position,case_sensitive,match_whole_word,scan_depth,token_budget,created_at,updated_at) VALUES (${sql(entryId)},${sql(lorebook.id)},${sql(title)},${sql(content)},${sql(JSON.stringify(keys))},'[]',1,${priority},${position},0,0,80,360,${now},${now}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,keys_json=excluded.keys_json,secondary_keys_json='[]',enabled=1,priority=excluded.priority,position=excluded.position,case_sensitive=0,match_whole_word=0,scan_depth=80,token_budget=360,updated_at=excluded.updated_at;`,
    );
  });
  return statements;
}

async function prepareContent() {
  const token = required('TELEGRAM_BOT_TOKEN');
  const avatarPath = required('KATYA_AVATAR_PATH');
  const outputPath = required('KATYA_SQL_OUTPUT');
  const avatar = await readFile(avatarPath);

  const form = new FormData();
  form.set('chat_id', OWNER_TELEGRAM_ID);
  form.set('disable_notification', 'true');
  form.set(
    'caption',
    '✅ Портрет Кати из «Холодных объятий» добавлен в медиатеку VeloraAI и выбран аватаром персонажа.',
  );
  form.set('photo', new Blob([avatar], { type: 'image/png' }), 'katya-cold-embrace.png');
  const sent = await telegram(token, 'sendPhoto', form);
  const largest = sent.photo?.at(-1);
  if (!largest?.file_id || !largest.file_unique_id) {
    throw new Error('Telegram returned no photo ID for Katya avatar.');
  }

  const now = Date.now();
  const c = katyaCharacter;
  const statements = [
    `INSERT INTO file_objects (id,owner_id,storage_provider,provider_file_id,provider_unique_id,object_key,mime_type,original_name,byte_size,width,height,moderation_state,created_at,deleted_at) VALUES (${sql(c.fileId)},${sql(OWNER_ID)},'TELEGRAM',${sql(largest.file_id)},${sql(largest.file_unique_id)},NULL,'image/png','katya-cold-embrace.png',${avatar.length},${largest.width ?? 1254},${largest.height ?? 1254},'APPROVED',${now},NULL) ON CONFLICT(id) DO UPDATE SET provider_file_id=excluded.provider_file_id,provider_unique_id=excluded.provider_unique_id,mime_type=excluded.mime_type,original_name=excluded.original_name,byte_size=excluded.byte_size,width=excluded.width,height=excluded.height,moderation_state='APPROVED',deleted_at=NULL;`,
    `INSERT INTO characters (id,owner_id,active_version_id,avatar_file_id,avatar_focal_x,avatar_focal_y,visibility,publish_state,content_rating,language,language_code,group_size,created_at,updated_at,published_at,deleted_at) VALUES (${sql(c.id)},${sql(OWNER_ID)},${sql(c.versionId)},${sql(c.fileId)},50,38,'PUBLIC','PUBLISHED','SAFE','ru','ru','single',${now},${now},${now},NULL) ON CONFLICT(id) DO UPDATE SET active_version_id=excluded.active_version_id,avatar_file_id=excluded.avatar_file_id,avatar_focal_x=50,avatar_focal_y=38,visibility='PUBLIC',publish_state='PUBLISHED',content_rating='SAFE',language='ru',language_code='ru',group_size='single',updated_at=excluded.updated_at,published_at=COALESCE(characters.published_at,excluded.published_at),deleted_at=NULL;`,
    `INSERT INTO character_versions (id,character_id,version,name,tagline,description,personality,scenario,first_message,example_dialogues,creator_notes,speech_style,appearance,background,goals,behaviour_rules,system_instructions,post_history_instructions,alternate_greetings_json,created_at) VALUES (${sql(c.versionId)},${sql(c.id)},1,${sql(c.name)},${sql(c.tagline)},${sql(c.description)},${sql(c.personality)},${sql(c.scenario)},${sql(c.firstMessage)},${sql(c.examples)},'Создано владельцем VeloraAI по исходным сценариям мода «Холодные объятия». Фамилия не добавлена, поскольку в исходнике она не подтверждена.',${sql(c.speechStyle)},${sql(c.appearance)},${sql(c.background)},${sql(c.goals)},${sql(c.behaviourRules)},${sql(c.systemInstructions)},${sql(c.postHistoryInstructions)},${sql(JSON.stringify(c.alternateGreetings))},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,tagline=excluded.tagline,description=excluded.description,personality=excluded.personality,scenario=excluded.scenario,first_message=excluded.first_message,example_dialogues=excluded.example_dialogues,creator_notes=excluded.creator_notes,speech_style=excluded.speech_style,appearance=excluded.appearance,background=excluded.background,goals=excluded.goals,behaviour_rules=excluded.behaviour_rules,system_instructions=excluded.system_instructions,post_history_instructions=excluded.post_history_instructions,alternate_greetings_json=excluded.alternate_greetings_json;`,
    ...loreStatements(worldLorebook, now),
    ...loreStatements(katyaLorebook, now),
    `INSERT INTO character_lorebooks (character_id,lorebook_id,enabled) VALUES (${sql(c.id)},${sql(worldLorebook.id)},1) ON CONFLICT(character_id,lorebook_id) DO UPDATE SET enabled=1;`,
    `INSERT INTO character_lorebooks (character_id,lorebook_id,enabled) VALUES (${sql(c.id)},${sql(katyaLorebook.id)},1) ON CONFLICT(character_id,lorebook_id) DO UPDATE SET enabled=1;`,
  ];
  await writeFile(outputPath, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ prepared: true, characterId: c.id, worldEntries: worldLorebook.entries.length, personalEntries: katyaLorebook.entries.length, examples: c.examples.split('{{user}}:').length - 1 })}\n`,
  );
}

async function prepareLore() {
  const outputPath = required('KATYA_SQL_OUTPUT');
  const now = Date.now();
  const statements = [
    ...loreStatements(worldLorebook, now),
    ...loreStatements(katyaLorebook, now),
    `INSERT INTO character_lorebooks (character_id,lorebook_id,enabled) VALUES (${sql(katyaCharacter.id)},${sql(worldLorebook.id)},1) ON CONFLICT(character_id,lorebook_id) DO UPDATE SET enabled=1;`,
    `INSERT INTO character_lorebooks (character_id,lorebook_id,enabled) VALUES (${sql(katyaCharacter.id)},${sql(katyaLorebook.id)},1) ON CONFLICT(character_id,lorebook_id) DO UPDATE SET enabled=1;`,
  ];
  await writeFile(outputPath, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ prepared: true, worldEntries: worldLorebook.entries.length, personalEntries: katyaLorebook.entries.length })}\n`,
  );
}

async function prepareCharacterDelta() {
  const outputPath = required('KATYA_SQL_OUTPUT');
  const c = katyaCharacter;
  const statement = `UPDATE character_versions SET name=${sql(c.name)},tagline=${sql(c.tagline)},description=${sql(c.description)},personality=${sql(c.personality)},scenario=${sql(c.scenario)},first_message=${sql(c.firstMessage)},example_dialogues=${sql(c.examples)},speech_style=${sql(c.speechStyle)},appearance=${sql(c.appearance)},background=${sql(c.background)},goals=${sql(c.goals)},behaviour_rules=${sql(c.behaviourRules)},system_instructions=${sql(c.systemInstructions)},post_history_instructions=${sql(c.postHistoryInstructions)},alternate_greetings_json=${sql(JSON.stringify(c.alternateGreetings))} WHERE id=${sql(c.versionId)} AND character_id=${sql(c.id)};`;
  await writeFile(outputPath, `${statement}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ prepared: true, characterId: c.id, alternateGreetings: c.alternateGreetings.length })}\n`,
  );
}

async function prepareBot() {
  const token = required('KATYA_CHARACTER_BOT_TOKEN');
  const encryptionKey = required('CHILD_BOT_ENCRYPTION_KEY');
  const avatarPath = required('KATYA_AVATAR_PATH');
  const outputPath = required('KATYA_BOT_SQL_OUTPUT');
  const avatar = await readFile(avatarPath);
  const identity = await telegram(token, 'getMe', {});

  await telegram(token, 'setMyName', { name: 'Катя · Холодные объятия' });
  await telegram(token, 'setMyDescription', {
    description:
      'Катя — ответственная и живая пионерка из мода «Холодные объятия». Общение с памятью и Lorebook в VeloraAI: https://t.me/aivel0ra_bot',
  });
  await telegram(token, 'setMyShortDescription', {
    short_description: 'AI-персонаж Катя · Холодные объятия · VeloraAI',
  });
  await telegram(token, 'setMyCommands', { commands });

  const profileForm = new FormData();
  profileForm.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  profileForm.set('avatar', new Blob([avatar], { type: 'image/png' }), 'katya-avatar.png');
  await telegram(token, 'setMyProfilePhoto', profileForm);

  const now = Date.now();
  const envelope = encryptToken(token, encryptionKey);
  const statement = `INSERT INTO character_avatar_bots (id,owner_id,character_id,telegram_bot_id,telegram_username,token_ciphertext,token_iv,status,last_error_code,created_at,updated_at) VALUES (${sql(AVATAR_BOT_ID)},${sql(OWNER_ID)},${sql(katyaCharacter.id)},${sql(String(identity.id))},${sql(identity.username)},${sql(envelope.ciphertext)},${sql(envelope.iv)},'ACTIVE',NULL,${now},${now}) ON CONFLICT(owner_id,character_id) DO UPDATE SET telegram_bot_id=excluded.telegram_bot_id,telegram_username=excluded.telegram_username,token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,status='ACTIVE',last_error_code=NULL,updated_at=excluded.updated_at;`;
  await writeFile(outputPath, `${statement}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ prepared: true, characterId: katyaCharacter.id, botUsername: identity.username })}\n`,
  );
}

async function prepareBotOffline() {
  const token = required('KATYA_CHARACTER_BOT_TOKEN');
  const encryptionKey = required('CHILD_BOT_ENCRYPTION_KEY');
  const outputPath = required('KATYA_BOT_SQL_OUTPUT');
  const now = Date.now();
  const envelope = encryptToken(token, encryptionKey);
  const statement = `INSERT INTO character_avatar_bots (id,owner_id,character_id,telegram_bot_id,telegram_username,token_ciphertext,token_iv,status,last_error_code,created_at,updated_at) VALUES (${sql(AVATAR_BOT_ID)},${sql(OWNER_ID)},${sql(katyaCharacter.id)},${sql(KATYA_TELEGRAM_BOT_ID)},${sql(KATYA_TELEGRAM_USERNAME)},${sql(envelope.ciphertext)},${sql(envelope.iv)},'ACTIVE',NULL,${now},${now}) ON CONFLICT(owner_id,character_id) DO UPDATE SET telegram_bot_id=excluded.telegram_bot_id,telegram_username=excluded.telegram_username,token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,status='ACTIVE',last_error_code=NULL,updated_at=excluded.updated_at;`;
  await writeFile(outputPath, `${statement}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ prepared: true, characterId: katyaCharacter.id, botUsername: KATYA_TELEGRAM_USERNAME, network: false })}\n`,
  );
}

async function activateWebhook() {
  const token = required('KATYA_CHARACTER_BOT_TOKEN');
  const encryptionKey = required('CHILD_BOT_ENCRYPTION_KEY');
  const url = `${APP_URL}/telegram/character-bots/${AVATAR_BOT_ID}`;
  await telegram(token, 'setWebhook', {
    url,
    secret_token: webhookSecret(encryptionKey),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  const info = await telegram(token, 'getWebhookInfo', {});
  if (info.url !== url) throw new Error('Katya webhook URL was not confirmed.');
  process.stdout.write(
    `${JSON.stringify({ activated: true, url, pending: info.pending_update_count })}\n`,
  );
}

async function smokeInfo() {
  const encryptionKey = required('CHILD_BOT_ENCRYPTION_KEY');
  const uniqueId = Date.now();
  const response = await fetch(`${APP_URL}/telegram/character-bots/${AVATAR_BOT_ID}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': webhookSecret(encryptionKey),
    },
    body: JSON.stringify({
      update_id: uniqueId,
      message: {
        message_id: uniqueId,
        from: { id: Number(OWNER_TELEGRAM_ID), is_bot: false },
        chat: { id: Number(OWNER_TELEGRAM_ID), type: 'private' },
        text: '/info',
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true || body?.result !== 'processed') {
    const code = typeof body?.error?.code === 'string' ? body.error.code : 'UNKNOWN';
    throw new Error(`Katya command smoke failed with HTTP ${response.status} (${code}).`);
  }
  process.stdout.write(`${JSON.stringify({ processed: true, command: '/info' })}\n`);
}

if (process.argv[2] === 'prepare-content') await prepareContent();
else if (process.argv[2] === 'prepare-lore') await prepareLore();
else if (process.argv[2] === 'prepare-character-delta') await prepareCharacterDelta();
else if (process.argv[2] === 'prepare-bot') await prepareBot();
else if (process.argv[2] === 'prepare-bot-offline') await prepareBotOffline();
else if (process.argv[2] === 'webhook') await activateWebhook();
else if (process.argv[2] === 'smoke-info') await smokeInfo();
else
  throw new Error(
    'Use prepare-content, prepare-lore, prepare-character-delta, prepare-bot, prepare-bot-offline, webhook or smoke-info.',
  );
