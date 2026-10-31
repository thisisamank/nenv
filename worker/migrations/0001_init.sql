CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  public_key TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL DEFAULT 'unknown device',
  cli_version TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE device_codes (
  device_code_hash TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE environments (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, name)
);

CREATE TABLE memberships (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('reader', 'editor', 'admin')),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE environment_keys (
  project_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_key TEXT NOT NULL,
  PRIMARY KEY (project_id, environment, user_id),
  FOREIGN KEY (project_id, environment) REFERENCES environments(project_id, name) ON DELETE CASCADE
);

CREATE TABLE secret_versions (
  project_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  ephemeral_public_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  restored_from INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, environment, name, version),
  FOREIGN KEY (project_id, environment) REFERENCES environments(project_id, name) ON DELETE CASCADE
);

CREATE TABLE secrets (
  project_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  name TEXT NOT NULL,
  active_version INTEGER NOT NULL,
  PRIMARY KEY (project_id, environment, name),
  FOREIGN KEY (project_id, environment, name, active_version)
    REFERENCES secret_versions(project_id, environment, name, version)
);

CREATE TABLE policies (
  project_id TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, environment, name)
);

CREATE TABLE compliance_reports (
  token_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  compliant INTEGER NOT NULL,
  report TEXT NOT NULL,
  reported_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (token_hash, project_id, environment)
);
