-- PostgreSQL migration for existing databases. Back up the database first.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_expires_at TIMESTAMP;
