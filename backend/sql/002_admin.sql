-- Admin role and default admin user (admin@admin.com). Idempotent.
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('sales', 'admin'));

INSERT INTO app_user (name, email, password_hash, role)
VALUES ('Administrator', 'admin@admin.com', '$2b$10$kxsY5r3FTqB8.vYHe6f05OPabQ843moyKRJb/9GX9kfkwWOkNDirO', 'admin')
ON CONFLICT DO NOTHING;
