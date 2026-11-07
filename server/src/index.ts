import { buildApp, purgeExpiredTokens } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { createMailer } from './mailer.js';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Configuration error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const pool = createPool(config.databaseUrl);
  const mailer = createMailer(config.smtpUrl, config.mailFrom);
  const app = await buildApp({ config, pool, mailer });

  // The database may come up after us (e.g. both pods starting together); retry for ~60s.
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(pool, undefined, (m) => app.log.info(m));
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      app.log.warn({ err: (err as Error).message, attempt }, 'database not ready, retrying migrations in 2s');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!mailer.enabled) app.log.warn('SMTP_URL not set: password reset emails are disabled');

  const purge = () => purgeExpiredTokens(pool).catch((err) => app.log.warn({ err }, 'token purge failed'));
  void purge();
  setInterval(purge, 60 * 60 * 1000).unref();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${signal} received, shutting down`);
    try {
      await app.close();
      await pool.end();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
