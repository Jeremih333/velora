-- Greeting variants in both surfaces.
--
-- Conversations created before greetings were stored as sibling messages hold a
-- single greeting row, so the chat can never offer the alternates the character
-- actually defines. The flag below marks a conversation whose greeting siblings
-- are known to be materialised; older rows default to 0 and are repaired once,
-- on read, where the persona snapshot needed to render the templates is at hand.
ALTER TABLE conversations ADD COLUMN greetings_backfilled INTEGER NOT NULL DEFAULT 0;

-- Avatar bots already paged through greetings with an inline keyboard, but the
-- choice was never stored, so the model kept continuing the first greeting no
-- matter which one the reader had picked. The selection is per chat, because the
-- same bot serves many private chats and groups independently.
CREATE TABLE character_bot_greeting_selections (
  avatar_bot_id TEXT NOT NULL REFERENCES character_avatar_bots(id) ON DELETE CASCADE,
  telegram_chat_id TEXT NOT NULL,
  greeting_index INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (avatar_bot_id, telegram_chat_id)
) WITHOUT ROWID;
