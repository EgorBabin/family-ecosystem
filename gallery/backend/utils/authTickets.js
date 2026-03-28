import crypto from 'crypto';
import pool from '../db.js';

function hashTicket(ticket) {
    return crypto.createHash('sha256').update(ticket).digest('hex');
}

export async function consumeAuthTicket(ticket, service) {
    const normalizedTicket = String(ticket || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(normalizedTicket)) {
        return null;
    }

    const tokenHash = hashTicket(normalizedTicket);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query(`
            DELETE FROM public.auth_tickets
            WHERE expires_at < NOW()
               OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '1 day')
        `);

        const { rows } = await client.query(
            `
                SELECT
                    t.id,
                    t.user_id,
                    t.auth_type,
                    t.remember,
                    u.id AS "resolvedUserId",
                    u.username,
                    u.email,
                    u.role,
                    u.is_active
                FROM public.auth_tickets t
                JOIN public.users u ON u.id = t.user_id
                WHERE t.token_hash = $1
                  AND t.service = $2
                  AND t.used_at IS NULL
                  AND t.expires_at > NOW()
                FOR UPDATE
            `,
            [tokenHash, service],
        );

        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        const row = rows[0];
        await client.query(
            `
                UPDATE public.auth_tickets
                SET used_at = NOW()
                WHERE id = $1
            `,
            [row.id],
        );

        await client.query('COMMIT');
        return {
            id: row.resolvedUserId,
            username: row.username,
            email: row.email,
            role: row.role,
            is_active: row.is_active,
            authType: row.auth_type,
            remember: row.remember === true,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
