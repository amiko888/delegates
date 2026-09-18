-- =====================================================
--  delegates project — Supabase SQL Setup
--  Supabase Dashboard → SQL Editor-ში გაუშვი ეს სკრიპტი
-- =====================================================

-- 1. კლიკების ცხრილი
CREATE TABLE IF NOT EXISTS clicks (
  delegate_id INTEGER      PRIMARY KEY,
  count       INTEGER      NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 2. ადმინ პარამეტრების ცხრილი (პაროლის hash-ის შესანახად)
CREATE TABLE IF NOT EXISTS admin_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 3. ატომური increment ფუნქცია (race condition-გარეშე)
CREATE OR REPLACE FUNCTION increment_click(did INTEGER)
RETURNS void
LANGUAGE sql AS $$
  INSERT INTO clicks (delegate_id, count, updated_at)
  VALUES (did, 1, now())
  ON CONFLICT (delegate_id) DO UPDATE
    SET count      = clicks.count + 1,
        updated_at = now();
$$;

-- =====================================================
--  შენიშვნა: Service Role key-ს ვიყენებთ Netlify Functions-ში,
--  ამიტომ RLS პოლიტიკები ავტომატურად bypass ხდება.
--  RLS-ის ჩართვა საჭირო არ არის.
-- =====================================================

