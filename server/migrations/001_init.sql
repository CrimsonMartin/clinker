-- Initial schema for the clinker sync API.
-- Emails are normalised to lower case by the application; the CHECK keeps it honest.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          bigserial PRIMARY KEY,
  token_hash  bytea NOT NULL UNIQUE,          -- sha256 of the opaque token
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);

CREATE TABLE password_reset_tokens (
  id          bigserial PRIMARY KEY,
  token_hash  bytea NOT NULL UNIQUE,          -- sha256 of the opaque token
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
CREATE INDEX password_reset_tokens_expires_at_idx ON password_reset_tokens (expires_at);

CREATE TABLE sync_docs (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data        jsonb NOT NULL,
  version     integer NOT NULL CHECK (version >= 1),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
