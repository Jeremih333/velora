-- Persist creator-selected character avatar crop without changing the source media object.
-- Percent coordinates keep rendering deterministic across cards, discovery and chat surfaces.
ALTER TABLE characters
ADD COLUMN avatar_focal_x REAL NOT NULL DEFAULT 50
CHECK (avatar_focal_x >= 0 AND avatar_focal_x <= 100);

ALTER TABLE characters
ADD COLUMN avatar_focal_y REAL NOT NULL DEFAULT 50
CHECK (avatar_focal_y >= 0 AND avatar_focal_y <= 100);
