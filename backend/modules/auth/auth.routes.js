const express = require('express');
const authService = require('./auth.service');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

/**
 * @openapi
 * /api/auth/agent-login:
 *   post:
 *     summary: Connexion agent Ville (Active Directory, via l'APM)
 *     tags: [Auth]
 */
router.post('/agent-login', async (req, res) => {
  const { username, password } = req.body || {};
  const result = await authService.loginAgent(username, password);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ token: result.token, user: result.user });
});

/**
 * @openapi
 * /api/auth/admin-login:
 *   post:
 *     summary: Accès de secours administrateur (compte local, indépendant de l'AD)
 *     tags: [Auth]
 */
router.post('/admin-login', async (req, res) => {
  const { username, password } = req.body || {};
  const result = await authService.loginAdmin(username, password);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ token: result.token, user: result.user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
