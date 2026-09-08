const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/engagements/:id/comments', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT * FROM comments WHERE engagement_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  res.json(rows);
});

router.post('/engagements/:id/comments', requireAuth, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Commentaire vide' });

  const engagement = await db.get(`SELECT id FROM engagements WHERE id = $1`, [req.params.id]);
  if (!engagement) return res.status(404).json({ error: 'Engagement introuvable' });

  const comment = await db.get(
    `INSERT INTO comments (engagement_id, author_name, author_direction, author_sub, body)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.id, req.user.displayName || req.user.sub, req.user.direction || null, req.user.sub, body.trim()]
  );
  res.status(201).json(comment);
});

/** Modification d'un commentaire — réservé à son auteur (ou un admin). Les
 * commentaires antérieurs à l'introduction d'author_sub n'ont pas
 * d'auteur identifié de façon fiable : non modifiables. */
router.patch('/comments/:id', requireAuth, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Commentaire vide' });

  const existing = await db.get(`SELECT * FROM comments WHERE id = $1`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Commentaire introuvable' });

  const isOwner = existing.author_sub && existing.author_sub === req.user.sub;
  if (!isOwner && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Seul l'auteur peut modifier ce commentaire" });
  }

  const comment = await db.get(
    `UPDATE comments SET body = $1, edited_at = now() WHERE id = $2 RETURNING *`,
    [body.trim(), req.params.id]
  );
  res.json(comment);
});

module.exports = router;
