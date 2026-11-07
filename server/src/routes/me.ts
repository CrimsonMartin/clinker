import type { FastifyInstance } from 'fastify';
import { unauthorized } from '../errors.js';
import { toUser, type UserRow } from './auth.js';

export async function meRoutes(app: FastifyInstance) {
  const { pool } = app.deps;
  app.addHook('preHandler', app.requireAuth);

  app.get('/me', async (req) => {
    const { rows } = await pool.query<UserRow>('SELECT id, email, created_at FROM users WHERE id = $1', [req.userId]);
    if (!rows[0]) throw unauthorized('User no longer exists');
    return { user: toUser(rows[0]) };
  });

  app.delete('/me', async (req, reply) => {
    // refresh_tokens, password_reset_tokens and sync_docs cascade.
    await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
    return reply.status(204).send();
  });
}
