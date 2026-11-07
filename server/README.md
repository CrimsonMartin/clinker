# clinker-api

Self-hosted auth + sync backend for the Citation Linker browser extension. Replaces Firebase
Auth + Firestore. Implements the contract in [`../docs/API.md`](../docs/API.md).

Stack: Node 22, TypeScript, Fastify 5, Postgres (`pg`), argon2id password hashing, HS256 JWT
access tokens (`jose`), opaque rotating refresh tokens (stored as SHA-256 hashes), nodemailer.

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | – | `postgres://user:pass@host:5432/db` (add `?sslmode=require` for remote DBs) |
| `JWT_SECRET` | yes | – | ≥ 32 bytes. `openssl rand -base64 48` |
| `PORT` | no | `8080` | |
| `HOST` | no | `0.0.0.0` | |
| `CORS_EXTRA_ORIGINS` | no | – | Comma-separated extra allowed origins. `chrome-extension://*` and `moz-extension://*` are always allowed. |
| `SMTP_URL` | no | – | nodemailer URL, e.g. `smtps://user:pass@smtp.example.com:465`. Unset = password-reset mail disabled (endpoint still returns 202). |
| `MAIL_FROM` | if `SMTP_URL` | – | e.g. `Citation Linker <no-reply@lanerate.io>` |
| `PUBLIC_BASE_URL` | no | `https://clinker.lanerate.io` | Used to build the reset link `<base>/reset-password#token=…` |
| `LOG_LEVEL` | no | `info` | pino level |
| `TRUST_PROXY` | no | `true` | Trust `X-Forwarded-*` from the ingress. |
| `AUTH_RATE_LIMIT_MAX` | no | `10` | Requests/minute/IP on each `/v1/auth/*` route. Keyed on `CF-Connecting-IP` when present, else the client IP. |
| `META_RATE_LIMIT_MAX` | no | `60` | Requests/minute/IP on `GET /v1/meta/doi/*` (DOI metadata lookups; results cached in memory for 24 h). |

The process exits immediately with a clear message if required variables are missing or invalid.

## Behaviour notes

- **Migrations** in `migrations/NNN_name.sql` run automatically at startup (tracked in
  `schema_migrations`, guarded by a Postgres advisory lock so several replicas can start at
  once). Startup retries the DB for ~60 s before giving up.
- **Emails** are trimmed and lower-cased; uniqueness is on the lower-cased value.
- **Refresh tokens** are single use: `/v1/auth/refresh` revokes the presented token and issues
  a new one. A concurrent second refresh with the same token gets 401, so the client should
  serialise refreshes. A password reset revokes all of the user's refresh tokens.
- **Sync PUT** (`baseVersion`):
  - `null`: force write (create or overwrite), version becomes `old + 1` (or 1).
  - `0`: create-only; 409 if a document already exists.
  - `n`: succeeds only if the stored version is `n`; otherwise 409
    `{error:{code:"version_conflict"}, current: SyncDoc | null}` (`current` is `null` only when
    there is no stored doc and `n > 0`).
  - Body limit 5 MiB (413 `payload_too_large`). Other routes are limited to 64 KiB.
  - `data` must be a JSON object; strings containing `\u0000` are rejected (400) because
    Postgres `jsonb` cannot store them. `jsonb` does not preserve key order.
- **Password reset**: `POST /v1/auth/password-reset/request` mails a link to
  `GET /reset-password`, a small self-contained HTML page served by this API that reads the
  token from the URL fragment and calls `/v1/auth/password-reset/confirm`. Tokens expire after
  1 hour and are single use.
- Error envelope everywhere: `{ "error": { "code", "message" } }`. Extra codes beyond the
  contract: `invalid_request` (400 validation), `unauthorized` (401 missing/bad access token),
  `rate_limited` (429), `payload_too_large` (413), `not_found` (404), `internal_error` (500).
- Expired / revoked tokens are purged hourly.

## Local development

```sh
cd server
npm install

# Postgres for dev/tests
docker run -d --rm --name clinker-test-pg -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine

export DATABASE_URL=postgres://postgres:test@localhost:55432/postgres
export JWT_SECRET=$(openssl rand -base64 48)
npm run dev            # tsx watch, http://localhost:8080

npm run typecheck
npm run build && npm start
```

## Tests

Integration tests (vitest + `fastify.inject`) run against a real Postgres. They truncate the
tables, so use a throwaway database.

```sh
docker run -d --rm --name clinker-test-pg -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine
TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test
docker stop clinker-test-pg
```

Coverage: register/login/logout, refresh rotation (including concurrent reuse and expiry),
password reset flow, account deletion cascade, rate limiting, CORS, sync optimistic concurrency
(conflicts, force overwrite, concurrent writers, 5 MiB limit, validation), and 401 on every
protected route for missing/malformed/expired/wrong-key tokens.

## Docker

```sh
docker build -t clinker-api .
docker run --rm -p 8080:8080 --read-only \
  -e DATABASE_URL=postgres://postgres:test@host.docker.internal:55432/postgres \
  --add-host=host.docker.internal:host-gateway \
  -e JWT_SECRET=$(openssl rand -base64 48) clinker-api
curl localhost:8080/healthz
```

The image runs as uid 1000 (`node`) and works with a read-only root filesystem.
CI (`deploy/github-workflow-api-image.yml`) tests, builds and pushes
`ghcr.io/crimsonmartin/clinker-api:{latest,sha-<short>}`. Deployment: see `../deploy/README.md`.
