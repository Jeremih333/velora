CREATE TABLE user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('WELCOME', 'SYSTEM', 'BILLING', 'MODERATION')),
  title_ru TEXT NOT NULL,
  body_ru TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_en TEXT NOT NULL,
  action_tab TEXT CHECK (action_tab IN ('discover', 'chats', 'characters', 'billing', 'settings', 'profile')),
  dedup_key TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, dedup_key)
) STRICT;

CREATE INDEX idx_user_notifications_unread
ON user_notifications(user_id, read_at, created_at DESC);

INSERT INTO user_notifications
  (id, user_id, kind, title_ru, body_ru, title_en, body_en, action_tab, dedup_key, created_at)
SELECT
  'welcome:' || id,
  id,
  'WELCOME',
  'Добро пожаловать в VeloraAI',
  'Создай персонажа или выбери историю в каталоге — твои диалоги и настройки сохраняются автоматически.',
  'Welcome to VeloraAI',
  'Create a character or choose a story from the catalogue — your chats and settings are saved automatically.',
  'discover',
  'welcome-v1',
  updated_at
FROM users
WHERE deleted_at IS NULL
ON CONFLICT(user_id, dedup_key) DO NOTHING;
