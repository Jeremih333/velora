ALTER TABLE lorebooks ADD COLUMN cover_media_file_id TEXT REFERENCES file_objects(id);

CREATE INDEX idx_lorebooks_cover_media
ON lorebooks(cover_media_file_id)
WHERE cover_media_file_id IS NOT NULL;
