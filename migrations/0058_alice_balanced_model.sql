-- Alice is the owner-operated reference Character Bot. Keep its explicit model on the
-- production-validated DeepSeek route instead of the economical Free showcase model.
-- Other Character Bots and user conversation settings are intentionally unchanged.
UPDATE character_avatar_bots
SET model_profile_id = 'velora-balanced',
    updated_at = unixepoch() * 1000
WHERE id = '9abf0141-9278-4be2-aaeb-63b8cb85da9a'
  AND owner_id = 'b102981e-8abc-4550-ae2b-5c31f47c2fa3';
