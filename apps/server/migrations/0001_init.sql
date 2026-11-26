-- One row per player. Only a hash of the bearer token is stored.
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL
);

-- The whole game state (packages/game GameState) as JSON. `rev` guards against two uploads racing;
-- `write_id` marks which write landed, so day rows from a losing write are dropped in the same transaction.
CREATE TABLE games (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state       TEXT NOT NULL,
  rev         INTEGER NOT NULL,
  write_id    TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- One row per settled day: what the phone uploaded and what we answered, so a retried upload gets the same answer.
-- `filled` = the day was never uploaded and was settled as "not worn" when a later day arrived.
CREATE TABLE days (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  input       TEXT NOT NULL,
  response    TEXT,
  filled      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
