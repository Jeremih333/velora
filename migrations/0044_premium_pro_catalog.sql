-- Immutable migration: user-facing Premium/Pro plans with monthly and annual Stars access.
-- Internal PLUS code is retained for backwards-compatible grants and payment history.
UPDATE plans
SET display_name = 'Premium', active = 1, rank = 10, updated_at = unixepoch() * 1000
WHERE code = 'PLUS';

UPDATE plans
SET display_name = 'Pro', active = 1, rank = 20, updated_at = unixepoch() * 1000
WHERE code = 'PRO';

-- Historical credit ledger rows stay intact, but credits are no longer sold to users.
UPDATE credit_packs SET active = 0, updated_at = unixepoch() * 1000 WHERE active = 1;
UPDATE access_packs SET active = 0, updated_at = unixepoch() * 1000;

INSERT INTO access_packs
  (code, display_name, description, stars_amount, plan_code, duration_days,
   active, sort_order, created_at, updated_at)
VALUES
  ('premium-monthly', 'Premium · месяц',
   'Расширенный выбор моделей, больше памяти и высокий fair-use на 30 дней.',
   599, 'PLUS', 30, 1, 10, unixepoch() * 1000, unixepoch() * 1000),
  ('premium-annually', 'Premium · год',
   'Premium на 365 дней по сниженной годовой цене.',
   5990, 'PLUS', 365, 1, 11, unixepoch() * 1000, unixepoch() * 1000),
  ('pro-monthly', 'Pro · месяц',
   'Все модели, максимальный fair-use и AI-аватары персонажей для групп на 30 дней.',
   1499, 'PRO', 30, 1, 20, unixepoch() * 1000, unixepoch() * 1000),
  ('pro-annually', 'Pro · год',
   'Pro на 365 дней по сниженной годовой цене.',
   9999, 'PRO', 365, 1, 21, unixepoch() * 1000, unixepoch() * 1000);
