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
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function redirectToLogin(res, service, errorCode) {
    return res.redirect(buildIdLoginUrl(service, errorCode).toString());
}

router.get('/', (req, res) => {
    const service = requireService(req.query.service);
    if (req.session?.user) {
        return res.redirect(`/api/sso/continue?service=${service}`);
    }

    const remember = req.query.remember === '1' ? '1' : '0';
    const state = crypto.randomBytes(24).toString('hex');
    req.session.yandexAuthState = {
        value: state,
        remember,
        service,
        createdAt: Date.now(),
    };

    const redirectUri =
        'https://oauth.yandex.ru/authorize' +
        `?response_type=code` +
        `&client_id=${process.env.YANDEX_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(process.env.YANDEX_REDIRECT_URI)}` +
        `&scope=login:email` +
        `&state=${encodeURIComponent(state)}`;

    req.session.save((err) => {
        if (err) {
            console.error('Failed to persist yandex oauth state:', err);
            return res.status(500).json({ error: 'Session error' });
        }
        return res.redirect(redirectUri);
    });
});

router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const savedState = req.session?.yandexAuthState;
    const service = requireService(savedState?.service || getDefaultService());
    const remember = savedState?.remember === '1';
    req.session.yandexAuthState = null;

    const isStateValid =
        typeof state === 'string' &&
        typeof savedState?.value === 'string' &&
        state === savedState.value &&
        Date.now() - Number(savedState.createdAt || 0) <=
            OAUTH_STATE_MAX_AGE_MS;

    if (!code || !isStateValid) {
        await logAction(req, '⚠️ Невалидный OAuth callback (code/state)', {
            service,
        });
        return redirectToLogin(res, service, 'oauth_state_invalid');
    }

    try {
        const tokenRes = await fetch('https://oauth.yandex.ru/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: process.env.YANDEX_CLIENT_ID,
                client_secret: process.env.YANDEX_CLIENT_SECRET,
            }),
        });

        if (!tokenRes.ok) {
            const tokenError = await tokenRes.text();
            throw new Error(`Yandex token exchange failed: ${tokenError}`);
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        if (!accessToken) {
            throw new Error('Yandex access token is missing');
        }

        const infoRes = await fetch(
            'https://login.yandex.ru/info?format=json',
            {
                headers: {
                    Authorization: `OAuth ${accessToken}`,
                },
            },
        );
        if (!infoRes.ok) {
            const infoError = await infoRes.text();
            throw new Error(`Yandex profile fetch failed: ${infoError}`);
        }

        const userInfo = await infoRes.json();
        const email =
            typeof userInfo.default_email === 'string'
                ? userInfo.default_email.trim().toLowerCase()
                : '';
        if (!email) {
            throw new Error('Yandex profile email is missing');
        }

        const { rows } = await pool.query(
            `
                SELECT *
                FROM public.users
                WHERE $1 = ANY(email)
                LIMIT 1
            `,
            [email],
        );

        if (rows.length === 0 || !isUserActive(rows[0])) {
            await logAction(req, '❌ Yandex user denied', {
                email,
                service,
            });
            return redirectToLogin(res, service, 'access_denied');
        }

        await establishUserSession(req, rows[0], {
            email,
            authType: 'yandex',
            remember,
        });

        await logAction(req, '✅ Авторизация через Yandex', { service, email });
        const redirectUrl = await buildServiceRedirect(service, {
            userId: rows[0].id,
            authType: 'yandex',
            remember,
        });
        return res.redirect(302, redirectUrl);
    } catch (err) {
        console.error(err);
        await logAction(req, '❌ Ошибка авторизации через Yandex', {
            service,
            reason: err.message,
        });
        return redirectToLogin(res, service, 'provider_error');
    }
});

export default router;
