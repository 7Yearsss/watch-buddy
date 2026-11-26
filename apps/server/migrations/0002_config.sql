-- Remote config (docs/design/10): engine numbers, event calendar. Old versions stay forever so any day can be replayed
-- with the config that settled it. Exactly one row is active.
CREATE TABLE configs (
  version     TEXT PRIMARY KEY,
  body        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX configs_one_active ON configs(active) WHERE active = 1;

ALTER TABLE days ADD COLUMN config_version TEXT;
