CREATE TABLE IF NOT EXISTS app_user (
  user_id       SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'sales',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_email_key ON app_user (lower(email));

ALTER TABLE customer ADD COLUMN IF NOT EXISTS sales_user_id INTEGER REFERENCES app_user(user_id);
CREATE INDEX IF NOT EXISTS customer_sales_user_id_idx ON customer (sales_user_id);
