import type { FastifyInstance } from 'fastify';
import { unauthorized } from '../errors.js';
import { toUser, verifyUserPassword, type UserRow } from './auth.js';

export async function meRoutes(app: FastifyInstance) {
  const { pool, config } = app.deps;
  // onRequest so a bad token is a 401 even when the body would also fail validation.
  app.addHook('onRequest', app.requireAuth);

  app.get('/me', async (req) => {
    const { rows } = await pool.query<UserRow>('SELECT id, email, created_at FROM users WHERE id = $1', [req.userId]);
    if (!rows[0]) throw unauthorized('User no longer exists');
    return { user: toUser(rows[0]) };
  });

  app.delete<{ Body: { password: string } }>(
    '/me',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string', minLength: 1, maxLength: 1024 } },
        },
      },
      config: { rateLimit: { max: config.authRateLimitMax, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      // Re-authenticate: a stolen access token alone must not be able to destroy the account.
      await verifyUserPassword(pool, req.userId, req.body.password);
      // refresh_tokens, password_reset_tokens and sync_docs cascade.
      await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
      return reply.status(204).send();
    },
  );
}
