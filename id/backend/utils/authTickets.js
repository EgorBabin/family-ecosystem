import crypto from 'crypto';
import pool from '../db.js';
import { buildServiceAuthUrl, requireService } from './services.js';

const DEFAULT_TICKET_TTL_SECONDS = 120;

function getTicketTtlMs() {
    const raw = Number(process.env.AUTH_TICKET_TTL_SECONDS);
    if (!Number.isFinite(raw) || raw <= 0) {
        return DEFAULT_TICKET_TTL_SECONDS * 1000;
    }
    return Math.floor(raw * 1000);
}

export function hashTicket(ticket) {
    return crypto.createHash('sha256').update(ticket).digest('hex');
}

async function cleanupExpiredTickets() {
    await pool.query(`
        DELETE FROM public.auth_tickets
        WHERE expires_at < NOW()
           OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '1 day')
    `);
}

export async function issueAuthTicket({
    service,
    userId,
    authType,
    remember = false,
}) {
    const normalizedService = requireService(service);
    const ticket = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashTicket(ticket);
    const expiresAt = new Date(Date.now() + getTicketTtlMs());

    await cleanupExpiredTickets();
    await pool.query(
        `
            INSERT INTO public.auth_tickets (
                token_hash,
                service,
                user_id,
                auth_type,
                remember,
                expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [tokenHash, normalizedService, userId, authType, remember, expiresAt],
    );

    return ticket;
}

export async function buildServiceRedirect(service, payload) {
    const ticket = await issueAuthTicket({ service, ...payload });
    const redirectUrl = buildServiceAuthUrl(service);
    redirectUrl.searchParams.set('ticket', ticket);
    return redirectUrl.toString();
}
