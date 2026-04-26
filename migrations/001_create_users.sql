CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  credits INTEGER DEFAULT 0,
  referral_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code);
