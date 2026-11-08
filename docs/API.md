# Clinker Sync API (self-hosted) — contract v1

Base URL is configured at build time via `API_BASE_URL` (default `https://clinker.lanerate.io`).
All bodies are JSON. All errors: `{ "error": { "code": "<string>", "message": "<string>" } }`.

## Auth
Access token: JWT (HS256), 15 min TTL, sent as `Authorization: Bearer <accessToken>`. `iat` has millisecond
precision. Every authenticated request checks that the user still exists and that the token was issued after the
user's last password change / reset / logout-all (`users.tokens_valid_after`); otherwise 401 `unauthorized`.
Refresh token: opaque random string (stored hashed server-side), 30 day TTL, rotated on every refresh. Tokens minted by
rotation share a *family* with the token they replaced. Presenting an already-rotated token again within 10 s of its
rotation (e.g. two extension pages refreshing at once) just gets 401 `invalid_refresh_token`; presenting it later is
treated as theft: the whole family is revoked and the user's outstanding access tokens are invalidated (other
families, i.e. other logins, keep their refresh tokens), and the response is the same 401.

| Method | Path | Body | Success |
|---|---|---|---|
| POST | /v1/auth/register | `{email, password}` (password >= 8 chars) | 201 `AuthResponse` · 409 `email_taken` · 403 `registration_closed` (registration disabled or `MAX_USERS` reached) |
| POST | /v1/auth/login | `{email, password}` | 200 `AuthResponse` · 401 `invalid_credentials` |
| POST | /v1/auth/refresh | `{refreshToken}` | 200 `AuthResponse` · 401 `invalid_refresh_token` |
| POST | /v1/auth/logout | `{refreshToken}` | 204 (revokes that refresh token) |
| POST | /v1/auth/password | `{currentPassword, newPassword}` (auth; newPassword >= 8 chars) | 200 `AuthResponse` (fresh pair for the caller) · 403 `invalid_password`. Revokes all refresh tokens and access tokens of the user and any outstanding reset links. Rate-limited like login. |
| POST | /v1/auth/logout-all | — (auth) | 204. Revokes all of the user's refresh tokens and access tokens ("sign out everywhere"), including the caller's. |
| POST | /v1/auth/password-reset/request | `{email}` | 202 always (sends mail if SMTP configured; no-op otherwise) |
| POST | /v1/auth/password-reset/confirm | `{token, password}` | 204 · 400 `invalid_token` (also signs out every session) |
| GET | /v1/me | — | 200 `{user: User}` |
| DELETE | /v1/me | `{password}` | 204 (deletes user + data; store policy requirement) · 400 `invalid_request` if missing · 403 `invalid_password`. Rate-limited like login. |

`AuthResponse = { user: User, accessToken: string, accessTokenExpiresAt: ISO8601, refreshToken: string }`
`User = { id: string(uuid), email: string, createdAt: ISO8601 }`

Wrong current passwords on authenticated routes are 403 `invalid_password` (not 401) so clients don't mistake them for
an expired access token. Every response carries `X-Content-Type-Options: nosniff`.

Accepted risk: `POST /v1/auth/register` answers 409 `email_taken` for an existing address, which lets a caller test
whether an email has an account (rate-limited per IP). This is kept deliberately until email verification exists;
the login and password-reset endpoints do not reveal account existence.

## Sync (one JSON document per user — replaces Firestore `users/{uid}`)
| Method | Path | Body | Success |
|---|---|---|---|
| GET | /v1/sync | — | 200 `SyncDoc` · 404 `not_found` if user never uploaded |
| PUT | /v1/sync | `{data: object, baseVersion: number \| null}` | 200 `SyncDoc` · 409 `version_conflict` with body `{error, current: SyncDoc}` when baseVersion != stored version (baseVersion null = force overwrite) · 429 `rate_limited` (`SYNC_RATE_LIMIT_MAX`, default 30 PUTs/min per user) |

`SyncDoc = { data: object, version: number, updatedAt: ISO8601 }`
`data` is opaque to the server (the extension stores `{ tabsData, tabsMetadata, citationTree, ... }`). Max body 5 MB.

## Metadata (reference manager)
| Method | Path | Body | Success |
|---|---|---|---|
| GET | /v1/meta/doi/{doi} | — | 200 `CslItem` · 400 `invalid_doi` · 404 `doi_not_found` · 502 `upstream_error` · 429 `rate_limited` |

Auth required. `{doi}` is a DOI (`10.1234/abc`), optionally prefixed with `doi:` or `https://doi.org/`; clients should
`encodeURIComponent` it, but unencoded slashes are accepted (the route is `/v1/meta/doi/*`). After decoding, DOIs
containing `.`/`..` path segments, `?`, `#`, `\`, whitespace or control characters are rejected with 400 `invalid_doi`.
Upstream requests percent-encode each DOI path segment, never follow redirects automatically (at most 3 redirects are
followed, and only to `https://` URLs on an allowlist of DOI registry hosts: doi.org, dx.doi.org, api/data.crossref.org,
api/data.datacite.org, data.crosscite.org, data.medra.org, japanlinkcenter.org), and stream response bodies with a 2 MB cap.
The server fetches `https://doi.org/{doi}` with `Accept: application/vnd.citationstyles.csl+json` and falls back to
`https://api.crossref.org/works/{doi}`, then normalizes to CSL-JSON: only known CSL fields are kept, markup is stripped,
array-valued Crossref fields become strings, Crossref types are mapped to CSL types, `DOI` is the requested DOI and
`URL` defaults to `https://doi.org/{doi}`. `source` is `"doi.org"` or `"crossref"`.
Results are cached in memory (LRU, 5000 entries) for 24 h (not-found for 1 h); responses carry
`Cache-Control: private, max-age=86400`. Rate limit `META_RATE_LIMIT_MAX` (default 60) requests/min/IP.

`CslItem = { type, title, author?: [{family, given} | {literal}], editor?, issued?: {"date-parts": [[y, m?, d?]]}, "container-title"?, volume?, issue?, page?, DOI, URL, ISBN?, ISSN?, publisher?, "publisher-place"?, abstract?, language?, source }`

## Server config (public)
| Method | Path | Body | Success |
|---|---|---|---|
| GET | /v1/config | — | 200 `{passwordReset: boolean, registrationOpen: boolean}` |

No auth. `passwordReset` is true only when the server can send reset mail (SMTP configured); clients should hide
"Forgot password?" otherwise. `registrationOpen` is false when `REGISTRATION_ENABLED=false` or the account count has
reached `MAX_USERS` (0 = unlimited). Rate-limited per IP like the metadata route.

## Ops
GET /healthz → 200 `{ok:true}` (no DB) · GET /readyz → 200 when DB reachable.
CORS: allow origins `chrome-extension://*`, `moz-extension://*`, plus `CORS_EXTRA_ORIGINS`. Rate-limit auth routes (e.g. 10/min/IP).
Rate-limit keys: the client IP is taken from `CF-Connecting-IP` only when the connecting peer is a Cloudflare edge
(published ranges, hard-coded server-side); otherwise the peer address is used. IPv6 clients are grouped per /64.
