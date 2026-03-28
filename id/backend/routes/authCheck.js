import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
    if (req.session?.user) {
        res.json({ authenticated: true, user: req.session.user });
        return;
    }

    res.json({ authenticated: false });
});

export default router;
