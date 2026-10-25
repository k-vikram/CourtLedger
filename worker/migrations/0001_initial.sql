PRAGMA foreign_keys = ON;

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'scorer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  system_owner INTEGER NOT NULL DEFAULT 0 CHECK (system_owner IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX one_system_owner ON members(system_owner) WHERE system_owner = 1;

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  revoked_at TEXT,
  created_by TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL
);

CREATE INDEX invites_member ON invites(member_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX sessions_member ON sessions(member_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  played_at TEXT NOT NULL,
  team_a_player_1 TEXT NOT NULL REFERENCES players(id),
  team_a_player_2 TEXT NOT NULL REFERENCES players(id),
  team_b_player_1 TEXT NOT NULL REFERENCES players(id),
  team_b_player_2 TEXT NOT NULL REFERENCES players(id),
  score_a INTEGER CHECK (score_a BETWEEN 0 AND 30),
  score_b INTEGER CHECK (score_b BETWEEN 0 AND 30),
  winner TEXT NOT NULL CHECK (winner IN ('A', 'B')),
  command TEXT CHECK (length(command) <= 500),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  CHECK (team_a_player_1 <> team_a_player_2),
  CHECK (team_a_player_1 <> team_b_player_1),
  CHECK (team_a_player_1 <> team_b_player_2),
  CHECK (team_a_player_2 <> team_b_player_1),
  CHECK (team_a_player_2 <> team_b_player_2),
  CHECK (team_b_player_1 <> team_b_player_2),
  CHECK ((score_a IS NULL AND score_b IS NULL) OR (score_a IS NOT NULL AND score_b IS NOT NULL))
);

CREATE INDEX matches_active_date ON matches(deleted_at, played_at DESC);
CREATE INDEX matches_updated ON matches(updated_at, created_at);

CREATE TABLE idempotency_keys (
  key_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  resource_id TEXT,
  response_body TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idempotency_expiry ON idempotency_keys(expires_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_member_id TEXT REFERENCES members(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  outcome TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX audit_created ON audit_events(created_at DESC);
CREATE INDEX audit_actor ON audit_events(actor_member_id, created_at DESC);

CREATE TABLE rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL
);

INSERT INTO players (id, display_name, created_at) VALUES
  ('bharat', 'Bharat', datetime('now')),
  ('gaurav', 'Gaurav', datetime('now')),
  ('shibbu', 'Shibbu', datetime('now')),
  ('vikram', 'Vikram', datetime('now')),
  ('sushil', 'Sushil', datetime('now')),
  ('hitesh', 'Hitesh', datetime('now')),
  ('sagar', 'Sagar', datetime('now'));

INSERT INTO members (id, display_name, role, active, system_owner, created_at, updated_at)
VALUES ('owner-vikram', 'Vikram', 'owner', 1, 1, datetime('now'), datetime('now'));

