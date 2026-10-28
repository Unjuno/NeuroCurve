-- NeuroCurve ChatGPT Sites D1 storage. No personal drafts, no training data.
-- Important: REVOKED shares are also recorded in a separate R2 binding.
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  delete_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER
);
CREATE INDEX IF NOT EXISTS shares_expires ON shares(expires);
CREATE TABLE IF NOT EXISTS limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  until_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created INTEGER NOT NULL
);
