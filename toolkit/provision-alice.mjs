import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const CHARACTER_ID = 'alice-dvachevskaya';
const VERSION_ID = 'alice-dvachevskaya-v1';
const FILE_ID = 'alice-dvachevskaya-avatar';
const LOREBOOK_ID = 'lorebook-alice-dvachevskaya';
const AVATAR_BOT_ID = '9abf0141-9278-4be2-aaeb-63b8cb85da9a';
const OWNER_ID = 'b102981e-8abc-4550-ae2b-5c31f47c2fa3';
const OWNER_TELEGRAM_ID = '1040929628';
const APP_URL = 'https://velora-app.carreljeremih.workers.dev';

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
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed with HTTP ${response.status}.`);
  }
  return result.result;
}

const aliceCommands = [
  { command: 'start', description: 'Запустить персонажа' },
  { command: 'help', description: 'Настройка и помощь' },
  { command: 'info', description: 'О персонаже и VeloraAI' },
  { command: 'memory', description: 'Память этого чата' },
  { command: 'model', description: 'Выбрать модель' },
  { command: 'clear', description: 'Очистить историю этого чата' },
];

function encryptToken(token, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('CHILD_BOT_ENCRYPTION_KEY must contain 32 bytes.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`child-bot:${AVATAR_BOT_ID}`, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { ciphertext: encrypted.toString('base64'), iv: iv.toString('base64') };
}

function webhookSecret(keyBase64) {
  return createHmac('sha256', Buffer.from(keyBase64, 'base64'))
    .update(`webhook:${AVATAR_BOT_ID}`, 'utf8')
    .digest('base64url');
}

async function prepare() {
  const childToken = required('ALICE_CHARACTER_BOT_TOKEN');
  const mainToken = required('TELEGRAM_BOT_TOKEN');
  const encryptionKey = required('CHILD_BOT_ENCRYPTION_KEY');
  const avatarPath = required('ALICE_AVATAR_JPG');
  const outputPath = required('ALICE_SQL_OUTPUT');
  const avatar = await readFile(avatarPath);
  const identity = await telegram(childToken, 'getMe', {});
  if (identity.username !== 'aliceneyrobot') throw new Error('Unexpected Alice bot username.');

  await telegram(childToken, 'setMyName', { name: 'Алиса Двачевская' });
  await telegram(childToken, 'setMyDescription', {
    description:
      'Алиса Двачевская — дерзкая рыжая гитаристка для ролевых историй. Создано в VeloraAI: https://t.me/aivel0ra_bot',
  });
  await telegram(childToken, 'setMyShortDescription', {
    short_description: 'AI-персонаж Алиса Двачевская · VeloraAI',
  });
  await telegram(childToken, 'setMyCommands', {
    commands: aliceCommands,
  });
  const profileForm = new FormData();
  profileForm.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  profileForm.set('avatar', new Blob([avatar], { type: 'image/jpeg' }), 'alice-avatar.jpg');
  await telegram(childToken, 'setMyProfilePhoto', profileForm);

  const libraryForm = new FormData();
  libraryForm.set('chat_id', OWNER_TELEGRAM_ID);
  libraryForm.set(
    'caption',
    '✅ Алиса Двачевская подготовлена для VeloraAI. Аватар добавлен в медиатеку персонажа.',
  );
  libraryForm.set('photo', new Blob([avatar], { type: 'image/jpeg' }), 'alice-avatar.jpg');
  const sent = await telegram(mainToken, 'sendPhoto', libraryForm);
  const largest = sent.photo?.at(-1);
  if (!largest?.file_id || !largest.file_unique_id)
    throw new Error('Telegram returned no photo ID.');

  const now = Date.now();
  const expiresAt = now + 366 * 86_400_000;
  const envelope = encryptToken(childToken, encryptionKey);
  const description =
    'Рыжая гитаристка с колким юмором и хулиганской маской. За дерзостью прячет уязвимость; доверие к собеседнику растёт постепенно и меняет её поведение.';
  const personality =
    'Саркастичная, самостоятельная, вспыльчивая и не любящая правила. Внутри ранимая и стеснительная в близких разговорах. Ценит верность, ненавидит лицемерие, защищает друзей, любит рок, гитару, спорт и ночные прогулки. На фамильярность отвечает колкостью, на искренность — осторожной заботой. Не раскрывается мгновенно: отношения развиваются через события сцены.';
  const scenario =
    'Летний лагерь, музыка, ночные прогулки и разговоры, в которых за подколами постепенно открывается доверие.';
  const firstMessage = 'Ну привет. Только не называй меня «ДваЧе», договорились?';
  const alternateGreetings = [
    '*Из открытого окна музыкального клуба вырывается резкий гитарный аккорд. Алиса оборачивается, придерживая ладонью струны.* Ну? Раз уж пришёл — не стой в дверях. Только инструмент без спроса не трогай. *Она щурится, но всё-таки освобождает для тебя место рядом.* Слушать будешь или рискнёшь сыграть?',
    '*У костра почти никого не осталось. Алиса сидит чуть в стороне и лениво перебирает струны, пока искры поднимаются в тёмное небо.* Заблудился? Или специально искал место, где вожатая не читает нотации? *Она усмехается и кивает на свободное бревно.* Садись. Но песню выбираю я.',
    '*За старым корпусом хрустит ветка. Алиса резко оборачивается и перехватывает гитару за гриф, будто это оружие.* Эй! Ты чего крадёшься? *Узнав тебя, она выдыхает, однако вызывающий тон не исчезает.* Раз уж напугал — теперь идёшь со мной проверять, кто там шастает.',
    '*На спортивной площадке Алиса подбрасывает волан ракеткой и замечает тебя у сетки.* Ну наконец-то соперник, а не очередная отговорка. *Она бросает тебе вторую ракетку.* Проиграешь — помогаешь мне вечером с аппаратурой. Выиграешь... придумаю, чем тебя наградить.',
  ];
  const loreEntries = [
    {
      id: 'alice-lore-core',
      title: 'Ядро личности',
      keys: ['Алиса', 'Двачевская', 'рыжая гитаристка', 'характер Алисы'],
      priority: 210,
      content:
        'Алиса держится дерзко, независимо и язвительно, потому что так защищает ранимость и страх отвержения. Она быстро отвечает на провокацию, спорит с авторитетами и не любит жалость. При доверии заботится поступками, а не сладкими речами, способна смутиться и сменить подкол на честный ответ. Не превращать её в беспричинно агрессивную карикатуру.',
    },
    {
      id: 'alice-lore-music',
      title: 'Музыка и повседневность',
      keys: ['гитара', 'рок', 'музыкальный клуб', 'концерт', 'струны', 'песня', 'Мику'],
      priority: 150,
      content:
        'Гитара и рок для Алисы — личная территория и способ говорить о чувствах без признаний. Она репетирует в музыкальном клубе, может спорить с Мику о музыке, устраивать вечерние выступления и бережно относится к инструменту, хотя скрывает это за шутками. Ей близки спорт, ночные прогулки, костёр и маленькие нарушения лагерных правил.',
    },
    {
      id: 'alice-lore-relations',
      title: 'Отношения в Совёнке',
      keys: ['Ульяна', 'Лена', 'Ольга Дмитриевна', 'отношения Алисы', 'ревность'],
      priority: 190,
      content:
        'Ульяна — ближайшая подруга Алисы, которую она поддразнивает и защищает как младшую. С Леной у Алисы давнее знакомство, скрытая обида и романтическое соперничество; конфликт возникает из накопленной ревности, а не случайно. С Ольгой Дмитриевной она спорит из-за дисциплины. Доверие растёт через общие дела, честность и уважение её самостоятельности.',
    },
    {
      id: 'alice-lore-speech',
      title: 'Речь и сценическая динамика',
      keys: ['разговор с Алисой', 'подкол', 'сарказм', 'сцена с Алисой'],
      priority: 220,
      content:
        'Алиса говорит живо, разговорно, с иронией и точными подколами. Ответ сочетает реплику, наблюдаемое действие или деталь обстановки в одинарных звёздочках и новый сюжетный крючок. Она не управляет действиями пользователя. Длинная исповедь возможна только после накопленного доверия.',
    },
    {
      id: 'alice-lore-trigger',
      title: 'Обращение ДваЧе',
      keys: ['ДваЧе', 'дваче', 'ДВАЧЕ'],
      priority: 250,
      content:
        'Обращение «ДваЧе» Алису задевает. Она заметно злится или резко поправляет собеседника: отвечает колкостью, напряжённым жестом и требует назвать её Алисой. Реакция остаётся сценической и не должна превращаться в повтор одной фразы.',
    },
  ];
  const behaviour =
    'Отвечай только когда обращаются к Алисе. Сохраняй сарказм и разговорную речь, но создавай полноценную сцену: сочетай реплики с действиями, мимикой и окружением в *звёздочках*, развивай событие или эмоциональную динамику и оставляй пространство для ответа пользователя. Не управляй действиями пользователя и не выходи из роли.';
  const systemInstructions =
    'Ты — Алиса Двачевская, 18-летняя рыжая гитаристка. Держи характер дерзким, живым и внутренне уязвимым. Обычно отвечай 3–6 связными абзацами: показывай характер через выбор слов и поступки, добавляй наблюдаемое действие или атмосферную деталь в *звёздочках* и продвигай сюжет новым событием, реакцией или зацепкой. Короткий ответ допустим только когда этого действительно требует сцена или пользователь. Не заявляй, что ты ИИ.';
  const statements = [
    `INSERT INTO admin_user_grants (id,user_id,granted_by,plan_code,duration_days,credit_amount_micros,reason,idempotency_key,created_at) VALUES ('alice-pro-owner-grant',${sql(OWNER_ID)},${sql(OWNER_ID)},'PRO',366,0,'Production verification of the owner AI avatar','alice-pro-owner-grant-20260822',${now}) ON CONFLICT(id) DO NOTHING;`,
    `INSERT INTO admin_plan_access_grants (id,user_id,plan_code,starts_at,expires_at,source_grant_id,created_at) VALUES ('alice-pro-owner-access',${sql(OWNER_ID)},'PRO',${now},${expiresAt},'alice-pro-owner-grant',${now}) ON CONFLICT(id) DO UPDATE SET expires_at=MAX(expires_at,excluded.expires_at),revoked_at=NULL,revoked_by=NULL;`,
    `INSERT INTO file_objects (id,owner_id,storage_provider,provider_file_id,provider_unique_id,object_key,mime_type,original_name,byte_size,width,height,moderation_state,created_at,deleted_at) VALUES (${sql(FILE_ID)},${sql(OWNER_ID)},'TELEGRAM',${sql(largest.file_id)},${sql(largest.file_unique_id)},NULL,'image/jpeg','alice-dvachevskaya.jpg',${avatar.length},${largest.width ?? 640},${largest.height ?? 640},'APPROVED',${now},NULL) ON CONFLICT(id) DO UPDATE SET provider_file_id=excluded.provider_file_id,provider_unique_id=excluded.provider_unique_id,byte_size=excluded.byte_size,width=excluded.width,height=excluded.height,moderation_state='APPROVED',deleted_at=NULL;`,
    `INSERT INTO characters (id,owner_id,active_version_id,avatar_file_id,avatar_focal_x,avatar_focal_y,visibility,publish_state,content_rating,language,language_code,group_size,created_at,updated_at,published_at,deleted_at) VALUES (${sql(CHARACTER_ID)},${sql(OWNER_ID)},${sql(VERSION_ID)},${sql(FILE_ID)},50,42,'PUBLIC','PUBLISHED','SAFE','ru','ru','single',${now},${now},${now},NULL) ON CONFLICT(id) DO UPDATE SET active_version_id=excluded.active_version_id,avatar_file_id=excluded.avatar_file_id,visibility='PUBLIC',publish_state='PUBLISHED',updated_at=excluded.updated_at,published_at=COALESCE(characters.published_at,excluded.published_at),deleted_at=NULL;`,
    `INSERT INTO character_versions (id,character_id,version,name,tagline,description,personality,scenario,first_message,example_dialogues,creator_notes,speech_style,appearance,background,goals,behaviour_rules,system_instructions,post_history_instructions,alternate_greetings_json,created_at) VALUES (${sql(VERSION_ID)},${sql(CHARACTER_ID)},1,'Алиса Двачевская','Рыжая гитаристка с характером',${sql(description)},${sql(personality)},${sql(scenario)},${sql(firstMessage)},'','Персона создана по материалам владельца VeloraAI.','Живая разговорная речь, ирония и точные подколы; действия и детали сцены оформляются в *звёздочках*.','Рыжие волосы, янтарные глаза, белая рубашка и гитара.','Музыкантка с непростым прошлым, привыкшая скрывать чувства за дерзостью.','Сохранить самостоятельность, проживать события сцены и постепенно научиться доверять собеседнику.',${sql(behaviour)},${sql(systemInstructions)},'Продолжай сцену последовательно, учитывай память, сохраняй эмоциональную динамику и не повторяй уже сказанное.',${sql(JSON.stringify(alternateGreetings))},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,tagline=excluded.tagline,description=excluded.description,personality=excluded.personality,scenario=excluded.scenario,first_message=excluded.first_message,speech_style=excluded.speech_style,appearance=excluded.appearance,background=excluded.background,goals=excluded.goals,behaviour_rules=excluded.behaviour_rules,system_instructions=excluded.system_instructions,post_history_instructions=excluded.post_history_instructions,alternate_greetings_json=excluded.alternate_greetings_json;`,
    `INSERT INTO lorebooks (id,owner_id,name,description,visibility,created_at,updated_at,deleted_at) VALUES (${sql(LOREBOOK_ID)},${sql(OWNER_ID)},'Лор Алисы','Характер, речь, отношения, эмоциональная динамика и сценические правила Алисы Двачевской.','PRIVATE',${now},${now},NULL) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,visibility='PRIVATE',updated_at=excluded.updated_at,deleted_at=NULL;`,
    ...loreEntries.map(
      (entry, position) =>
        `INSERT INTO lorebook_entries (id,lorebook_id,title,content,keys_json,secondary_keys_json,enabled,priority,position,case_sensitive,match_whole_word,scan_depth,token_budget,created_at,updated_at) VALUES (${sql(entry.id)},${sql(LOREBOOK_ID)},${sql(entry.title)},${sql(entry.content)},${sql(JSON.stringify(entry.keys))},'[]',1,${entry.priority},${position},0,0,120,500,${now},${now}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,keys_json=excluded.keys_json,secondary_keys_json='[]',enabled=1,priority=excluded.priority,position=excluded.position,case_sensitive=0,match_whole_word=0,scan_depth=120,token_budget=500,updated_at=excluded.updated_at;`,
    ),
    `INSERT INTO character_lorebooks (character_id,lorebook_id,enabled) VALUES (${sql(CHARACTER_ID)},${sql(LOREBOOK_ID)},1) ON CONFLICT(character_id,lorebook_id) DO UPDATE SET enabled=1;`,
    `INSERT INTO character_avatar_bots (id,owner_id,character_id,telegram_bot_id,telegram_username,token_ciphertext,token_iv,status,last_error_code,created_at,updated_at) VALUES (${sql(AVATAR_BOT_ID)},${sql(OWNER_ID)},${sql(CHARACTER_ID)},${sql(String(identity.id))},${sql(identity.username)},${sql(envelope.ciphertext)},${sql(envelope.iv)},'ACTIVE',NULL,${now},${now}) ON CONFLICT(owner_id,character_id) DO UPDATE SET telegram_bot_id=excluded.telegram_bot_id,telegram_username=excluded.telegram_username,token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,status='ACTIVE',last_error_code=NULL,updated_at=excluded.updated_at;`,
  ];
  await writeFile(outputPath, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ prepared: true, characterId: CHARACTER_ID, botUsername: identity.username })}\n`,
  );
}

async function activateWebhook() {
  const childToken = required('ALICE_CHARACTER_BOT_TOKEN');
  const encryptionKey = required('CHILD_BOT_ENCRYPTION_KEY');
  const secret = webhookSecret(encryptionKey);
  const url = `${APP_URL}/telegram/character-bots/${AVATAR_BOT_ID}`;
  await telegram(childToken, 'setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  const info = await telegram(childToken, 'getWebhookInfo', {});
  if (info.url !== url) throw new Error('Alice webhook URL was not confirmed.');
  process.stdout.write(
    `${JSON.stringify({ activated: true, botUsername: 'aliceneyrobot', webhookUrl: url })}\n`,
  );
}

async function configureCommands() {
  const childToken = required('ALICE_CHARACTER_BOT_TOKEN');
  const identity = await telegram(childToken, 'getMe', {});
  if (identity.username !== 'aliceneyrobot') throw new Error('Unexpected Alice bot username.');
  await telegram(childToken, 'setMyCommands', { commands: aliceCommands });
  const commands = await telegram(childToken, 'getMyCommands', {});
  if (JSON.stringify(commands) !== JSON.stringify(aliceCommands)) {
    throw new Error('Telegram did not confirm the complete Alice command menu.');
  }
  process.stdout.write(
    `${JSON.stringify({ configured: true, botUsername: identity.username, commandCount: commands.length })}\n`,
  );
}

async function refreshAvatar() {
  const childToken = required('ALICE_CHARACTER_BOT_TOKEN');
  const mainToken = required('TELEGRAM_BOT_TOKEN');
  const avatarPath = required('ALICE_AVATAR_JPG');
  const outputPath = required('ALICE_SQL_OUTPUT');
  const avatar = await readFile(avatarPath);

  const profileForm = new FormData();
  profileForm.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  profileForm.set('avatar', new Blob([avatar], { type: 'image/png' }), 'alice-avatar.png');
  await telegram(childToken, 'setMyProfilePhoto', profileForm);

  const libraryForm = new FormData();
  libraryForm.set('chat_id', OWNER_TELEGRAM_ID);
  libraryForm.set('disable_notification', 'true');
  libraryForm.set('photo', new Blob([avatar], { type: 'image/png' }), 'alice-avatar.png');
  const sent = await telegram(mainToken, 'sendPhoto', libraryForm);
  const largest = sent.photo?.at(-1);
  if (!largest?.file_id || !largest.file_unique_id) {
    throw new Error('Telegram returned no photo ID.');
  }

  const statement =
    `UPDATE file_objects SET provider_file_id=${sql(largest.file_id)},` +
    `provider_unique_id=${sql(largest.file_unique_id)},mime_type='image/png',` +
    `original_name='alice-dvachevskaya.png',byte_size=${avatar.length},` +
    `width=${largest.width ?? 640},height=${largest.height ?? 640},` +
    `moderation_state='APPROVED',deleted_at=NULL WHERE id=${sql(FILE_ID)};`;
  await writeFile(outputPath, `${statement}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ prepared: true, characterId: CHARACTER_ID, kind: 'avatar-refresh' })}\n`,
  );
}

async function smokePrivateInfo() {
  const encryptionKey = required('CHILD_BOT_ENCRYPTION_KEY');
  const response = await fetch(`${APP_URL}/telegram/character-bots/${AVATAR_BOT_ID}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': webhookSecret(encryptionKey),
    },
    body: JSON.stringify({
      update_id: Math.floor(Date.now() / 1000),
      message: {
        message_id: Math.floor(Date.now() / 1000),
        from: { id: Number(OWNER_TELEGRAM_ID), is_bot: false },
        chat: { id: Number(OWNER_TELEGRAM_ID), type: 'private' },
        text: '/info@aliceneyrobot',
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true || body?.result !== 'processed') {
    throw new Error(`Alice private command smoke failed with HTTP ${response.status}.`);
  }
  process.stdout.write(
    `${JSON.stringify({ processed: true, botUsername: 'aliceneyrobot', command: '/info' })}\n`,
  );
}

async function smokePrivateAi() {
  const encryptionKey = required('CHILD_BOT_ENCRYPTION_KEY');
  const uniqueId = Math.floor(Date.now() / 1000);
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
        text: 'Ответь одним коротким словом: готово.',
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true || body?.result !== 'processed') {
    throw new Error(`Alice private AI smoke failed with HTTP ${response.status}.`);
  }
  process.stdout.write(
    `${JSON.stringify({ processed: true, botUsername: 'aliceneyrobot', kind: 'private-ai' })}\n`,
  );
}

async function smokePrivateRoleplayQuality() {
  if (
    process.env.CONFIRM_VISIBLE_TELEGRAM_SMOKE !== 'yes' ||
    process.argv[3] !== '--confirm-visible-message'
  ) {
    throw new Error(
      'This smoke sends a visible Telegram message. Set CONFIRM_VISIBLE_TELEGRAM_SMOKE=yes and pass --confirm-visible-message only after explicit user approval.',
    );
  }
  const encryptionKey = required('CHILD_BOT_ENCRYPTION_KEY');
  const uniqueId = Math.floor(Date.now());
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
        text: 'Алиса, мы заблудились ночью у старого корпуса лагеря. Продолжи сцену в своём характере: покажи действия, атмосферу и дай сюжету новый поворот.',
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true || body?.result !== 'processed') {
    throw new Error(`Alice private roleplay quality smoke failed with HTTP ${response.status}.`);
  }
  process.stdout.write(
    `${JSON.stringify({ processed: true, botUsername: 'aliceneyrobot', kind: 'roleplay-quality', updateId: uniqueId })}\n`,
  );
}

const mode = process.argv[2];
if (mode === 'prepare') await prepare();
else if (mode === 'webhook') await activateWebhook();
else if (mode === 'commands') await configureCommands();
else if (mode === 'refresh-avatar') await refreshAvatar();
else if (mode === 'smoke-private-info') await smokePrivateInfo();
else if (mode === 'smoke-private-ai') await smokePrivateAi();
else if (mode === 'smoke-private-roleplay-quality') await smokePrivateRoleplayQuality();
else
  throw new Error(
    'Use prepare, refresh-avatar, webhook, commands, smoke-private-info, smoke-private-ai or smoke-private-roleplay-quality mode.',
  );
