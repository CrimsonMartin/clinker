-- Session hardening:
--  * users.tokens_valid_after: access tokens (JWT) issued before this instant are rejected.
--    Bumped by password change/reset and "sign out everywhere".
--  * refresh_tokens.family_id: every token minted by rotating a refresh token shares the family
--    of the token it replaced, so reuse of a rotated-away token can revoke the whole chain.

ALTER TABLE users ADD COLUMN tokens_valid_after timestamptz NOT NULL DEFAULT '-infinity';

ALTER TABLE refresh_tokens ADD COLUMN family_id uuid;
UPDATE refresh_tokens SET family_id = gen_random_uuid() WHERE family_id IS NULL;
ALTER TABLE refresh_tokens ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE refresh_tokens ALTER COLUMN family_id SET DEFAULT gen_random_uuid();
CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens (family_id);
