import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pgSession from 'connect-pg-simple';
import useragent from 'express-useragent';

import pool from './db.js';
import checkWork from './routes/hello.js';
import authCheck from './routes/authCheck.js';
import telegramRoutes from './routes/telegram.js';
import yandexRoutes from './routes/yandex.js';
import ssoRoutes from './routes/sso.js';
import { ensureIdentityTables } from './utils/ensureTables.js';
import { sendSuccess } from './utils/apiResponse.js';

const app = express();

if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required');
}

app.set('trust proxy', 1);
app.use(helmet());
app.use(cookieParser());
app.use(express.json());
app.use(useragent.express());

const PgSession = pgSession(session);
app.use(
    session({
        store: new PgSession({
            pool,
            tableName: process.env.SESSION_TABLE || 'id_session',
            createTableIfMissing: true,
        }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        rolling: false,
        name: process.env.SESSION || 'id_session',
        cookie: {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 30,
        },
    }),
);

app.get('/api/config', (req, res) => {
    return sendSuccess(res, {
        payload: {
            telegramBotUsername: process.env.TG_BOT_USERNAME || '',
            defaultService: 'gallery',
        },
    });
});

app.use('/api/', checkWork);
app.use('/api/check-session', authCheck);
app.use('/api/telegram', telegramRoutes);
app.use('/api/yandex', yandexRoutes);
app.use('/api/sso', ssoRoutes);

app.use((err, req, res, next) => {
    void req;
    void next;
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

async function start() {
    await ensureIdentityTables();
    app.listen(3000, () => {
        console.log('ID backend listening on http://localhost:3000');
    });
}

start().catch((err) => {
    console.error('Failed to start ID backend:', err);
    process.exit(1);
});
