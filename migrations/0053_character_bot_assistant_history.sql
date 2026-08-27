-- Preserve both sides of every AI-avatar turn so later generations receive an
-- alternating conversation instead of a user-only transcript.
ALTER TABLE character_bot_group_events ADD COLUMN assistant_body TEXT;
