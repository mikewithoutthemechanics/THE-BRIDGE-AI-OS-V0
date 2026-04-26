-- 003_unify_users.sql
-- Consolidate all user data into single PostgreSQL users table

-- Create unified users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE NULL,
  login_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}'
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- Insert trigger for updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_users_updated_at();

-- Sessions table for JWT management
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Audit log for user actions
CREATE TABLE IF NOT EXISTS user_audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_audit_user_id ON user_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_action ON user_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_user_audit_created ON user_audit_log(created_at);

-- Migration queries (execute after data export):
-- INSERT INTO users (email, username, password_hash, created_at, metadata)
-- SELECT ... FROM sqlite_users_data ...
-- INSERT INTO users ... FROM empeleni_users_data ...
-- INSERT INTO users ... FROM other_user_sources ...