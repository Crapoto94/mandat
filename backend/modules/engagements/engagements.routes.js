const express = require('express');
const service = require('./engagements.service');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const rows = await service.list(req.query);
  res.json(rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const engagement = await service.getById(req.params.id);
  if (!engagement) return res.status(404).json({ error: 'Engagement introuvable' });
  res.json(engagement);
});

router.patch('/:id', requireAuth, async (req, res) => {
  const author = req.user.displayName || req.user.sub;
  const result = await service.update(req.params.id, req.body || {}, author);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result.engagement);
});

router.patch('/:id/prioritaire', requireAuth, async (req, res) => {
  const { prioritaire, note } = req.body || {};
  const author = req.user.displayName || req.user.sub;
  const result = await service.setPrioritaire(req.params.id, Boolean(prioritaire), note, author);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result.engagement);
});

module.exports = router;
