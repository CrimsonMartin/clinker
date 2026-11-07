import type { FastifyInstance } from 'fastify';
import { ApiError, unauthorized } from '../errors.js';

interface SyncRow {
  data: unknown;
  version: number;
  updated_at: Date;
}

const toDoc = (r: SyncRow) => ({ data: r.data, version: r.version, updatedAt: r.updated_at.toISOString() });

export const SYNC_BODY_LIMIT = 5 * 1024 * 1024;

export async function syncRoutes(app: FastifyInstance) {
  const { pool } = app.deps;
  app.addHook('preHandler', app.requireAuth);

  app.get('/sync', async (req) => {
    const { rows } = await pool.query<SyncRow>(
      'SELECT data, version, updated_at FROM sync_docs WHERE user_id = $1',
      [req.userId],
    );
    if (!rows[0]) throw new ApiError(404, 'not_found', 'No sync document stored yet');
    return toDoc(rows[0]);
  });

  app.put<{ Body: { data: Record<string, unknown>; baseVersion: number | null } }>(
    '/sync',
    {
      bodyLimit: SYNC_BODY_LIMIT,
      schema: {
        body: {
          type: 'object',
          required: ['data', 'baseVersion'],
          properties: {
            data: { type: 'object' },
            baseVersion: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
          },
        },
      },
    },
    async (req) => {
      const { data, baseVersion } = req.body;
      const json = JSON.stringify(data);
      let rows: SyncRow[];
      try {
        if (baseVersion === null) {
          // Force overwrite (or create).
          ({ rows } = await pool.query<SyncRow>(
            `INSERT INTO sync_docs (user_id, data, version, updated_at)
             VALUES ($1, $2::jsonb, 1, now())
             ON CONFLICT (user_id) DO UPDATE
               SET data = EXCLUDED.data, version = sync_docs.version + 1, updated_at = now()
             RETURNING data, version, updated_at`,
            [req.userId, json],
          ));
        } else if (baseVersion === 0) {
          // First upload: only succeeds if no document exists yet.
          ({ rows } = await pool.query<SyncRow>(
            `INSERT INTO sync_docs (user_id, data, version, updated_at)
             VALUES ($1, $2::jsonb, 1, now())
             ON CONFLICT (user_id) DO NOTHING
             RETURNING data, version, updated_at`,
            [req.userId, json],
          ));
        } else {
          ({ rows } = await pool.query<SyncRow>(
            `UPDATE sync_docs SET data = $2::jsonb, version = version + 1, updated_at = now()
              WHERE user_id = $1 AND version = $3
              RETURNING data, version, updated_at`,
            [req.userId, json, baseVersion],
          ));
        }
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === '23503') throw unauthorized('User no longer exists'); // FK: user deleted
        if (code === '22P05' || code === '22P02') {
          throw new ApiError(400, 'invalid_request', 'data contains values that cannot be stored as JSON');
        }
        throw err;
      }
      if (rows[0]) return toDoc(rows[0]);

      const cur = await pool.query<SyncRow>(
        'SELECT data, version, updated_at FROM sync_docs WHERE user_id = $1',
        [req.userId],
      );
      throw new ApiError(
        409,
        'version_conflict',
        `baseVersion ${baseVersion} does not match stored version ${cur.rows[0]?.version ?? 'none'}`,
        { current: cur.rows[0] ? toDoc(cur.rows[0]) : null },
      );
    },
  );
}
