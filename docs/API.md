# Clinker Sync API (self-hosted) — contract v1

Base URL is configured at build time via `API_BASE_URL` (default `https://clinker.lanerate.io`).
All bodies are JSON. All errors: `{ "error": { "code": "<string>", "message": "<string>" } }`.

## Auth
Access token: JWT (HS256), 15 min TTL, sent as `Authorization: Bearer <accessToken>`.
Refresh token: opaque random string (stored hashed server-side), 30 day TTL, rotated on every refresh.

| Method | Path | Body | Success |
|---|---|---|---|
| POST | /v1/auth/register | `{email, password}` (password >= 8 chars) | 201 `AuthResponse` · 409 `email_taken` |
| POST | /v1/auth/login | `{email, password}` | 200 `AuthResponse` · 401 `invalid_credentials` |
| POST | /v1/auth/refresh | `{refreshToken}` | 200 `AuthResponse` · 401 `invalid_refresh_token` |
| POST | /v1/auth/logout | `{refreshToken}` | 204 (revokes that refresh token) |
| POST | /v1/auth/password-reset/request | `{email}` | 202 always (sends mail if SMTP configured; no-op otherwise) |
| POST | /v1/auth/password-reset/confirm | `{token, password}` | 204 · 400 `invalid_token` |
| GET | /v1/me | — | 200 `{user: User}` |
| DELETE | /v1/me | — | 204 (deletes user + data; store policy requirement) |

`AuthResponse = { user: User, accessToken: string, accessTokenExpiresAt: ISO8601, refreshToken: string }`
`User = { id: string(uuid), email: string, createdAt: ISO8601 }`

## Sync (one JSON document per user — replaces Firestore `users/{uid}`)
| Method | Path | Body | Success |
|---|---|---|---|
| GET | /v1/sync | — | 200 `SyncDoc` · 404 `not_found` if user never uploaded |
| PUT | /v1/sync | `{data: object, baseVersion: number \| null}` | 200 `SyncDoc` · 409 `version_conflict` with body `{error, current: SyncDoc}` when baseVersion != stored version (baseVersion null = force overwrite) |

`SyncDoc = { data: object, version: number, updatedAt: ISO8601 }`
`data` is opaque to the server (the extension stores `{ tabsData, tabsMetadata, citationTree, ... }`). Max body 5 MB.

## Ops
GET /healthz → 200 `{ok:true}` (no DB) · GET /readyz → 200 when DB reachable.
CORS: allow origins `chrome-extension://*`, `moz-extension://*`, plus `CORS_EXTRA_ORIGINS`. Rate-limit auth routes (e.g. 10/min/IP).
