#!/usr/bin/env node
// Chrome Web Store client (API v1.1 — needs no publisher ID).
//
//   node scripts/chrome-store.mjs check               # read-only: token + item status
//   node scripts/chrome-store.mjs publish <file.zip>  # upload, then submit for review/publish
//
// Env: CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN, CHROME_EXTENSION_ID
import fs from 'node:fs';

const API = 'https://www.googleapis.com/chromewebstore/v1.1/items';
const UPLOAD = 'https://www.googleapis.com/upload/chromewebstore/v1.1/items';

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

const missing = ['CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN', 'CHROME_EXTENSION_ID']
  .filter((n) => !process.env[n]);
if (missing.length) fail(`Missing repository secret(s): ${missing.join(', ')}`);
const id = process.env.CHROME_EXTENSION_ID;

async function token() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CHROME_CLIENT_ID,
      client_secret: process.env.CHROME_CLIENT_SECRET,
      refresh_token: process.env.CHROME_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail(`Chrome OAuth refresh failed (${body.error}: ${body.error_description || ''}). The refresh token is expired ` +
      'or revoked (tokens from an OAuth consent screen in "Testing" mode expire after 7 days; set it to ' +
      '"In production") — mint a new one and update CHROME_REFRESH_TOKEN.');
  }
  return body.access_token;
}

async function call(url, init, at) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${at}`, 'x-goog-api-version': '2' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`Chrome Web Store API ${res.status}: ${JSON.stringify(body.error || body)}`);
  return body;
}

const [cmd, file] = process.argv.slice(2);
const at = await token();

if (cmd === 'check') {
  const item = await call(`${API}/${id}?projection=DRAFT`, {}, at);
  console.log(`Chrome Web Store OK — item found, current version ${item.crxVersion}, upload state ${item.uploadState}.`);
  // Read-only view of what the public sees: the published item and the public listing page.
  const pubRes = await fetch(`${API}/${id}?projection=PUBLISHED`, { headers: { Authorization: `Bearer ${at}`, 'x-goog-api-version': '2' } });
  const pubItem = await pubRes.json().catch(() => ({}));
  console.log(pubRes.ok && pubItem.crxVersion
    ? `Chrome published version: ${pubItem.crxVersion}`
    : `Chrome published version: none yet (${pubRes.status} ${pubItem.error?.message || ''})`.trim());
  const page = await fetch(`https://chromewebstore.google.com/detail/${id}`, { redirect: 'follow' });
  console.log(`Chrome public listing page: HTTP ${page.status}${page.ok ? ' (live)' : ' (not public yet)'}`);
} else if (cmd === 'publish') {
  if (!file) fail('usage: chrome-store.mjs publish <file.zip>');
  let item = await call(`${UPLOAD}/${id}?uploadType=media`, { method: 'PUT', body: fs.readFileSync(file) }, at);
  for (let i = 0; item.uploadState === 'IN_PROGRESS' && i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    item = await call(`${API}/${id}?projection=DRAFT`, {}, at);
  }
  if (item.uploadState !== 'SUCCESS') {
    // A version still in review (or approved but not yet live) blocks new uploads. That's
    // expected with publish-on-every-merge: skip this one; the next merge after review lands.
    if ((item.itemError || []).some((e) => e.error_code === 'ITEM_NOT_UPDATABLE')) {
      console.log('::warning::Chrome Web Store is still reviewing the previous version, so this ' +
        'version was not uploaded. The next push to main after the review finishes will publish.');
      process.exit(0);
    }
    fail(`Upload failed: ${JSON.stringify(item.itemError || item)}`);
  }
  console.log(`Uploaded version ${item.crxVersion}.`);
  const pub = await call(`${API}/${id}/publish`, { method: 'POST', headers: { 'Content-Length': '0' } }, at);
  console.log(`Publish status: ${(pub.status || []).join(', ')} ${(pub.statusDetail || []).join(' ')}`);
  if (!(pub.status || []).some((s) => s === 'OK' || s === 'ITEM_PENDING_REVIEW')) fail('Publish was not accepted.');
} else {
  fail('usage: chrome-store.mjs check | publish <file.zip>');
}
