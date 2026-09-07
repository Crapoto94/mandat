const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/engagements/:id/comments', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT * FROM mandat.comments WHERE engagement_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  res.json(rows);
});

router.post('/engagements/:id/comments', requireAuth, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Commentaire vide' });

  const engagement = await db.get(`SELECT id FROM mandat.engagements WHERE id = $1`, [req.params.id]);
  if (!engagement) return res.status(404).json({ error: 'Engagement introuvable' });

  const comment = await db.get(
    `INSERT INTO mandat.comments (engagement_id, author_name, author_direction, body)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.id, req.user.displayName || req.user.sub, req.user.direction || null, body.trim()]
  );
  res.status(201).json(comment);
});

module.exports = router;
