import type { FastifyInstance } from 'fastify';

// Public privacy policy for the Citation Linker extension, linked from the Chrome Web
// Store and Firefox Add-ons listings. Keep in sync with what the extension and API store.
const UPDATED = '2026-11-07';

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy · Citation Linker</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 720px; margin: 6vh auto; padding: 0 16px; color: #1f2328; background: #fff; }
  h1 { font-size: 1.6rem; margin-bottom: 0; }
  h2 { font-size: 1.15rem; margin-top: 2em; }
  .muted { color: #59636e; }
  code { font-size: .9em; }
  @media (prefers-color-scheme: dark) { body { background: #0d1117; color: #e6edf3; } .muted { color: #9198a1; } }
</style>
</head>
<body>
<h1>Citation Linker Privacy Policy</h1>
<p class="muted">Last updated ${UPDATED}</p>

<p>Citation Linker ("the extension") is a browser extension for saving highlights from web pages,
organizing them into citation trees, annotating them, and exporting references. This policy explains
what data it handles and where that data goes.</p>

<h2>Short version</h2>
<ul>
  <li>Without an account, everything stays in your browser's local extension storage.</li>
  <li>If you create an account, your saved research is synced to our own server at
      <code>clinker.lanerate.io</code> so it is available on your other devices.</li>
  <li>We do not sell your data, show ads, use analytics or tracking, or share your data with third parties
      except as described below.</li>
  <li>You can delete your account and all synced data at any time from the extension.</li>
</ul>

<h2>Data stored in your browser</h2>
<p>When you save a highlight, the extension stores locally: the selected text, the page URL and title,
the time it was saved, copies of images contained in the selection (images the page doesn't allow the extension
to copy are skipped; their web addresses are not stored), any notes you add, how you organized the items
(trees and tabs), and citation details read from the page (such as title, authors, publication date,
journal and DOI). This data never leaves your browser unless you sign in.</p>

<h2>Data sent to our server (only if you sign in)</h2>
<ul>
  <li><strong>Account data:</strong> your email address and a password hash (Argon2id). We never store
      your password in plain text.</li>
  <li><strong>Synced research data:</strong> the locally stored data described above, so it can be synced
      between your devices.</li>
  <li><strong>Sign-in sessions:</strong> hashed session tokens with expiry dates.</li>
  <li><strong>DOI lookups:</strong> when you use "Fetch from DOI", the DOI is sent to our server, which
      looks it up at doi.org / Crossref. No information about you is sent to those services.</li>
  <li><strong>Technical logs:</strong> the server and its network provider (Cloudflare) process IP
      addresses and request metadata to deliver the service and prevent abuse (for example, rate
      limiting). Logs are not used to profile you.</li>
</ul>
<p>The extension only reads page content when you select text and save it, or when you ask it to read a
page's citation details. It does not collect your browsing history.</p>

<h2>Voice notes</h2>
<p>Voice annotations use your browser's built-in speech recognition. In Chrome, audio is processed by
Google's speech service under Google's privacy policy; other browsers may process it on their own
services or on your device. Citation Linker itself does not record or store audio, only the resulting text
note.</p>

<h2>Where the data is stored</h2>
<p>Synced data is stored in a PostgreSQL database on a server we operate at Hetzner in the EU (Helsinki,
Finland), reached through Cloudflare. Connections are encrypted with TLS.</p>

<h2>Retention and deletion</h2>
<ul>
  <li>Synced data is kept while your account exists.</li>
  <li><strong>Delete account</strong> (in the extension's account page) permanently deletes your account,
      sessions and all synced data from our database immediately (you confirm with your password).</li>
  <li>Signing out removes your research data from that browser's local storage. "Sign out everywhere"
      (in the account page) also ends every other session of your account.</li>
  <li>Uninstalling the extension removes its local data from your browser.</li>
</ul>

<h2>Email</h2>
<p>We only email you to send a password reset you requested (where the server is set up to send email).</p>

<h2>Children</h2>
<p>The extension is not directed at children under 13, and we do not knowingly collect their data.</p>

<h2>Changes</h2>
<p>If this policy changes, the date above will change. Significant changes will be noted in the
extension's release notes.</p>

<h2>Contact</h2>
<p>Questions or requests (including data access or deletion if you can no longer sign in):
open an issue at <a href="https://github.com/CrimsonMartin/clinker/issues">github.com/CrimsonMartin/clinker</a>.</p>
</body>
</html>
`;

export async function privacyPageRoute(app: FastifyInstance): Promise<void> {
  app.get('/privacy', async (_req, reply) => {
    reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
      .send(PAGE);
  });
}
