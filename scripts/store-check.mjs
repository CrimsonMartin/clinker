#!/usr/bin/env node
// Read-only check that the store credentials in CI still work. Publishes nothing.
//
//   node scripts/store-check.mjs chrome   # needs CHROME_* env
//   node scripts/store-check.mjs firefox  # needs FIREFOX_API_KEY / FIREFOX_API_SECRET
//
// Exits non-zero with a clear message when a credential is missing or rejected.
import crypto from 'node:crypto';
import fs from 'node:fs';

const target = process.argv[2];

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) fail(`Missing repository secret(s): ${missing.join(', ')}`);
}

async function checkChrome() {
  need('CHROME_EXTENSION_ID', 'CHROME_PUBLISHER_ID', 'CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN');
  const { default: chromeWebstoreUpload } = await import('chrome-webstore-upload');
  const store = chromeWebstoreUpload({
    extensionId: process.env.CHROME_EXTENSION_ID,
    publisherId: process.env.CHROME_PUBLISHER_ID,
    clientId: process.env.CHROME_CLIENT_ID,
    clientSecret: process.env.CHROME_CLIENT_SECRET,
    refreshToken: process.env.CHROME_REFRESH_TOKEN,
  });
  let token;
  try {
    token = await store.fetchToken();
  } catch (e) {
    fail(`Chrome OAuth refresh failed (${e.message}). The refresh token is probably expired or revoked — ` +
      'regenerate it (https://github.com/fregante/chrome-webstore-upload-keys) and update CHROME_REFRESH_TOKEN.');
  }
  try {
    const status = await store.get(token);
    console.log('Chrome Web Store item status:');
    console.log(JSON.stringify(status, null, 2));
  } catch (e) {
    fail(`Chrome Web Store API rejected the status call (${e.message}). Check CHROME_EXTENSION_ID / CHROME_PUBLISHER_ID ` +
      'and that the OAuth client\'s Google Cloud project has the Chrome Web Store API enabled.');
  }
}

function amoJwt(key, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: key, jti: crypto.randomUUID(), iat, exp: iat + 60 })}`;
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}

async function checkFirefox() {
  need('FIREFOX_API_KEY', 'FIREFOX_API_SECRET');
  const id = JSON.parse(fs.readFileSync('manifest.json', 'utf8')).browser_specific_settings.gecko.id;
  const res = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(id)}/`, {
    headers: { Authorization: `JWT ${amoJwt(process.env.FIREFOX_API_KEY, process.env.FIREFOX_API_SECRET)}` },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    fail(`AMO rejected the API credentials (${res.status}: ${body.detail || ''}). ` +
      'Generate new ones at https://addons.mozilla.org/developers/addon/api/key/ and update FIREFOX_API_KEY / FIREFOX_API_SECRET.');
  }
  if (res.status === 404) {
    console.log(`AMO: add-on ${id} not found for this account — the first 'web-ext sign' will create it.`);
    return;
  }
  if (!res.ok) fail(`AMO API error ${res.status}: ${JSON.stringify(body)}`);
  console.log(`AMO add-on ${id}: slug=${body.slug} status=${body.status} ` +
    `current listed version=${body.current_version?.version ?? 'none'} disabled_by_user=${body.is_disabled}`);
}

if (target === 'chrome') await checkChrome();
else if (target === 'firefox') await checkFirefox();
else fail('usage: store-check.mjs chrome|firefox');
