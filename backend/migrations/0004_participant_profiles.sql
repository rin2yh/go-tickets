CREATE TABLE participant_profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 100),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
