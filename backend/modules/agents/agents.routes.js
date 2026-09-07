const express = require('express');
const apm = require('../../services/apm');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

/**
 * Recherche d'agents (annuaire AD via l'APM), pour l'assignation de rôles.
 * Retourne toujours 200 — même si l'APM est indisponible — avec un indicateur
 * `apmAvailable` : le frontend bascule alors sur une saisie manuelle du nom.
 */
router.get('/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!apm.apmConfigured()) return res.json({ apmAvailable: false, results: [] });
  if (q.length < 2) return res.json({ apmAvailable: true, results: [] });

  const results = await apm.searchAgents(q);
  res.json({ apmAvailable: true, results: Array.isArray(results) ? results.slice(0, 15) : [] });
});

module.exports = router;
