import express from 'express';
import { consumeAuthTicket } from '../utils/authTickets.js';
import { logAction } from '../utils/logger.js';
import { sendError, sendSuccess } from '../utils/apiResponse.js';
import {
    clearSessionCookie,
    establishGallerySession,
} from '../utils/sessionUser.js';

const router = express.Router();

router.post('/exchange', async (req, res) => {
    const ticket = String(req.body?.ticket || '').trim();
    if (!ticket) {
        return sendError(res, {
            httpStatus: 400,
            status: 'warning',
            message: 'Отсутствует одноразовый билет',
        });
    }

    try {
        const authTicket = await consumeAuthTicket(ticket, 'gallery');
        if (!authTicket || authTicket.is_active === false) {
            await logAction(req, '❌ Недействительный auth ticket', {
                service: 'gallery',
            });
            clearSessionCookie(req, res);
            return sendError(res, {
                httpStatus: 401,
                status: 'warning',
                message: 'Билет недействителен или уже использован',
                payload: { redirect: '/login' },
            });
        }

        await establishGallerySession(req, authTicket, {
            authType: authTicket.authType || 'id',
            remember: authTicket.remember,
        });

        await logAction(req, '✅ Вход в gallery через ID', {
            authType: authTicket.authType,
        });
        return sendSuccess(res, {
            message: 'Сессия галереи создана',
            payload: { authenticated: true, user: req.session.user },
        });
    } catch (err) {
        console.error(err);
        await logAction(req, '❌ Ошибка обмена auth ticket', {
            service: 'gallery',
            reason: err.message,
        });
        return sendError(res, {
            httpStatus: 500,
            message: 'Не удалось завершить вход в галерею',
        });
    }
});

router.post('/logout', (req, res) => {
    if (!req.session) {
        clearSessionCookie(req, res);
        return sendSuccess(res, { message: 'Сессия уже завершена' });
    }

    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return sendError(res, {
                httpStatus: 500,
                message: 'Не удалось завершить сессию',
            });
        }

        clearSessionCookie(req, res);
        return sendSuccess(res, { message: 'Сессия завершена' });
    });
});

export default router;
