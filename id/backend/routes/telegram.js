import express from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { logAction } from '../utils/logger.js';
import { buildServiceRedirect } from '../utils/authTickets.js';
import {
    buildIdLoginUrl,
    getDefaultService,
    requireService,
} from '../utils/services.js';
import { establishUserSession, isUserActive } from '../utils/session.js';

const router = express.Router();

const TG_FIELDS = [
    'id',
    'first_name',
    'last_name',
    'username',
    'photo_url',
    'auth_date',
];
const MAX_AGE = 24 * 60 * 60;
const TELEGRAM_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function redirectToLogin(res, service, errorCode) {
    return res.redirect(buildIdLoginUrl(service, errorCode).toString());
}

function verifyTelegramAuth(query, botToken) {
    if (!botToken) {
        return false;
    }

    const hash = query.hash;
    if (!hash) {
        return false;
    }

    const data = {};
    for (const key of TG_FIELDS) {
        if (query[key]) {
            data[key] = query[key];
        }
    }

    const dataCheckString = Object.keys(data)
        .sort()
        .map((key) => `${key}=${data[key]}`)
        .join('\n');

    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(hash, 'hex'),
            Buffer.from(hmac, 'hex'),
        );
    } catch {
        return false;
    }
}

router.get('/', async (req, res) => {
    if (req.query.hash && req.query.id && req.query.auth_date) {
        const savedState = req.session?.telegramAuthState;
        const service = requireService(
            savedState?.service || getDefaultService(),
        );
        const remember = savedState?.remember === '1';
        const callbackState = String(req.query.state || '');
        req.session.telegramAuthState = null;

        const isStateValid =
            typeof savedState?.value === 'string' &&
            callbackState.length > 0 &&
            callbackState === savedState.value &&
            Date.now() - Number(savedState.createdAt || 0) <=
                TELEGRAM_STATE_MAX_AGE_MS;
        if (!isStateValid) {
            await logAction(req, '❌ Невалидный state в Telegram callback', {
                service,
            });
            return redirectToLogin(res, service, 'oauth_state_invalid');
        }

        const valid = verifyTelegramAuth(req.query, process.env.TG_BOT_TOKEN);
        if (!valid) {
            await logAction(req, '❌ Невалидный hash в Telegram callback', {
                service,
            });
            return redirectToLogin(res, service, 'telegram_hash_invalid');
        }

        const authDate = Number(req.query.auth_date);
        const now = Math.floor(Date.now() / 1000);
        if (
            !Number.isFinite(authDate) ||
            authDate <= 0 ||
            now - authDate > MAX_AGE ||
            authDate > now + 60
        ) {
            await logAction(req, '⚠️ Устаревший auth_date в Telegram callback', {
                service,
            });
            return redirectToLogin(res, service, 'telegram_auth_date_invalid');
        }

        const tgId = String(req.query.id);

        const usedCheck = await pool.query(
            `
                SELECT 1
                FROM public.telegram_auth_used
                WHERE tg_id = $1 AND auth_date = $2
            `,
            [tgId, authDate],
        );
        if (usedCheck.rowCount > 0) {
            await logAction(req, '⚠️ Повторный Telegram callback', {
                service,
                tgId,
            });
            return redirectToLogin(res, service, 'telegram_replayed');
        }

        await pool.query(
            `
                INSERT INTO public.telegram_auth_used(tg_id, auth_date)
                VALUES ($1, $2)
            `,
            [tgId, authDate],
        );

        try {
            const { rows } = await pool.query(
                `
                    SELECT *
                    FROM public.users
                    WHERE telegramID = $1
                    LIMIT 1
                `,
                [tgId],
            );

            if (rows.length === 0 || !isUserActive(rows[0])) {
                await logAction(req, '❌ Telegram user denied', {
                    service,
                    tgId,
                });
                return redirectToLogin(res, service, 'access_denied');
            }

            await establishUserSession(req, rows[0], {
                authType: 'telegram',
                remember,
            });

            await logAction(req, '✅ Авторизация через Telegram', {
                service,
                tgId,
            });
            const redirectUrl = await buildServiceRedirect(service, {
                userId: rows[0].id,
                authType: 'telegram',
                remember,
            });
            return res.redirect(302, redirectUrl);
        } catch (err) {
            console.error(err);
            await logAction(req, '❌ Ошибка авторизации через Telegram', {
                service,
                reason: err.message,
            });
            return redirectToLogin(res, service, 'provider_error');
        }
    }

    return redirectToLogin(res, requireService(req.query.service), null);
});

router.get('/state', (req, res) => {
    if (req.session?.user) {
        return res.json({ state: null });
    }

    const remember = req.query.remember === '1' ? '1' : '0';
    const service = requireService(req.query.service);
    const state = crypto.randomBytes(24).toString('hex');

    req.session.telegramAuthState = {
        value: state,
        remember,
        service,
        createdAt: Date.now(),
    };

    req.session.save((err) => {
        if (err) {
            console.error('Failed to persist telegram auth state:', err);
            return res.status(500).json({ error: 'Session error' });
        }
        return res.json({ state });
    });
});

export default router;
