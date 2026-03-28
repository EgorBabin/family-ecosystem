export const DEFAULT_SESSION_MAX_AGE_MS = 1000 * 60 * 30;
export const REMEMBER_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export function getClientIp(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        req.ip ||
        ''
    );
}

export function getPrimaryEmail(userRow, fallbackEmail = '') {
    if (typeof fallbackEmail === 'string' && fallbackEmail.trim()) {
        return fallbackEmail.trim().toLowerCase();
    }

    if (Array.isArray(userRow?.email)) {
        const primary = userRow.email.find(
            (item) => typeof item === 'string' && item.trim(),
        );
        return primary ? primary.trim().toLowerCase() : '';
    }

    return typeof userRow?.email === 'string'
        ? userRow.email.trim().toLowerCase()
        : '';
}

export function isUserActive(userRow) {
    return Boolean(userRow) && userRow.is_active !== false;
}

export function buildSessionUser(userRow, { email, authType }) {
    return {
        id: userRow.id,
        username: userRow.username,
        email: getPrimaryEmail(userRow, email),
        authType,
        role: userRow.role || 'user',
    };
}

export function establishUserSession(
    req,
    userRow,
    { email, authType, remember = false },
) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((regenErr) => {
            if (regenErr) {
                reject(regenErr);
                return;
            }

            req.session.user = buildSessionUser(userRow, { email, authType });
            req.session.remember = remember ? '1' : '0';
            req.session.ip = getClientIp(req);
            req.session.ua = req.headers['user-agent'] || '';
            req.session.cookie.maxAge = remember
                ? REMEMBER_SESSION_MAX_AGE_MS
                : DEFAULT_SESSION_MAX_AGE_MS;

            req.session.save((saveErr) => {
                if (saveErr) {
                    reject(saveErr);
                    return;
                }
                resolve(req.session.user);
            });
        });
    });
}

export function clearSessionCookie(req, res) {
    res.clearCookie(process.env.SESSION || 'id_session', {
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: 'lax',
        path: '/',
    });
}
