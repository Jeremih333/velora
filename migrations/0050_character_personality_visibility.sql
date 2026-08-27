ALTER TABLE characters
ADD COLUMN personality_visible INTEGER NOT NULL DEFAULT 0
CHECK (personality_visible IN (0, 1));
