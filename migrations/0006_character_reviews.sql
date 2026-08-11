CREATE TABLE character_reviews (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL DEFAULT '' CHECK (length(review_text) <= 1000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, character_id)
) WITHOUT ROWID;

CREATE INDEX idx_character_reviews_character
  ON character_reviews(character_id, updated_at DESC);
