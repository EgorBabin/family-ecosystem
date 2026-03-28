import express from 'express';
import { sendError, sendSuccess } from '../utils/apiResponse.js';
import { buildServiceRedirect } from '../utils/authTickets.js';
import { clearSessionCookie } from '../utils/session.js';
import { buildIdLoginUrl, requireService } from '../utils/services.js';

const router = express.Router();

router.get('/continue', async (req, res) => {
    const service = requireService(req.query.service);
    if (!req.session?.user) {
        return res.redirect(buildIdLoginUrl(service, null).toString());
    }

    try {
        const redirectUrl = await buildServiceRedirect(service, {
            userId: req.session.user.id,
            authType: req.session.user.authType || 'id',
            remember: req.session.remember === '1',
        });
        return res.redirect(302, redirectUrl);
    } catch (err) {
        console.error(err);
        return sendError(res, {
            httpStatus: 500,
            message: 'Не удалось выдать одноразовый билет',
        });
    }
});

router.post('/logout', async (req, res) => {
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
