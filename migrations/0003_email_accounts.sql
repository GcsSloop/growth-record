PRAGMA foreign_keys=off;

CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT,
  password_salt TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO users_new (
  id,
  email,
  phone,
  username,
  password_hash,
  password_salt,
  role,
  status,
  display_name,
  created_at,
  updated_at,
  last_login_at,
  must_change_password
)
SELECT
  id,
  NULL,
  phone,
  username,
  password_hash,
  password_salt,
  role,
  status,
  display_name,
  created_at,
  updated_at,
  last_login_at,
  must_change_password
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

PRAGMA foreign_keys=on;
