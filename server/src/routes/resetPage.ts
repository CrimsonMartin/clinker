import type { FastifyInstance } from 'fastify';

// Minimal page targeted by the password-reset email link. The token travels in the
// URL fragment so it never reaches server/proxy access logs or Referer headers.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reset password · Citation Linker</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 420px; margin: 10vh auto; padding: 0 16px; color: #1f2328; background: #fff; }
  h1 { font-size: 1.4rem; }
  label { display: block; margin: 12px 0 4px; }
  input { width: 100%; padding: 8px; font: inherit; box-sizing: border-box; }
  button { margin-top: 16px; padding: 8px 16px; font: inherit; cursor: pointer; }
  #msg { margin-top: 16px; }
  .err { color: #b42318; } .ok { color: #067647; }
  @media (prefers-color-scheme: dark) { body { background: #0d1117; color: #e6edf3; } }
</style>
</head>
<body>
<h1>Choose a new password</h1>
<form id="f">
  <label for="p1">New password (at least 8 characters)</label>
  <input id="p1" type="password" minlength="8" autocomplete="new-password" required>
  <label for="p2">Repeat new password</label>
  <input id="p2" type="password" minlength="8" autocomplete="new-password" required>
  <button type="submit">Set password</button>
</form>
<p id="msg" role="status"></p>
<script>
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  history.replaceState(null, '', location.pathname);
  const msg = document.getElementById('msg');
  const form = document.getElementById('f');
  const show = (t, cls) => { msg.textContent = t; msg.className = cls; };
  if (!token) { form.hidden = true; show('This reset link is missing its token. Request a new one from the extension.', 'err'); }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = document.getElementById('p1').value, p2 = document.getElementById('p2').value;
    if (p1 !== p2) return show('Passwords do not match.', 'err');
    try {
      const r = await fetch('/v1/auth/password-reset/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: p1 }),
      });
      if (r.status === 204) { form.hidden = true; return show('Password updated. You can now sign in from the extension.', 'ok'); }
      const body = await r.json().catch(() => null);
      show(body && body.error ? body.error.message : 'Something went wrong (' + r.status + ').', 'err');
    } catch { show('Network error, please try again.', 'err'); }
  });
</script>
</body>
</html>`;

export async function resetPageRoute(app: FastifyInstance) {
  app.get('/reset-password', async (_req, reply) => {
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
      )
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'no-store')
      .send(PAGE);
  });
}
