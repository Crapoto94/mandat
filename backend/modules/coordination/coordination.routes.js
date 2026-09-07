const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const topics = await db.all(`SELECT * FROM mandat.coordination_topics ORDER BY updated_at DESC`);
  const links = await db.all(`SELECT * FROM mandat.coordination_topic_engagements`);
  const byTopic = new Map();
  for (const link of links) {
    if (!byTopic.has(link.topic_id)) byTopic.set(link.topic_id, []);
    byTopic.get(link.topic_id).push(link.engagement_id);
  }
  res.json(topics.map((t) => ({ ...t, engagement_ids: byTopic.get(t.id) || [] })));
});

router.post('/', requireAuth, async (req, res) => {
  const { titre, description, statut, directions_concernees, engagement_ids } = req.body || {};
  if (!titre || !titre.trim()) return res.status(400).json({ error: 'Titre requis' });

  const topic = await db.get(
    `INSERT INTO mandat.coordination_topics (titre, description, statut, directions_concernees, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      titre.trim(),
      description || null,
      statut || 'en_discussion',
      Array.isArray(directions_concernees) ? directions_concernees : [],
      req.user.displayName || req.user.sub,
    ]
  );

  await linkEngagements(topic.id, engagement_ids);
  res.status(201).json({ ...topic, engagement_ids: engagement_ids || [] });
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { titre, description, statut, directions_concernees, engagement_ids } = req.body || {};
  const topic = await db.get(`SELECT * FROM mandat.coordination_topics WHERE id = $1`, [req.params.id]);
  if (!topic) return res.status(404).json({ error: 'Sujet introuvable' });

  const updated = await db.get(
    `UPDATE mandat.coordination_topics SET
       titre = COALESCE($1, titre),
       description = COALESCE($2, description),
       statut = COALESCE($3, statut),
       directions_concernees = COALESCE($4, directions_concernees)
     WHERE id = $5 RETURNING *`,
    [titre || null, description ?? null, statut || null, directions_concernees || null, req.params.id]
  );

  if (engagement_ids) {
    await db.run(`DELETE FROM mandat.coordination_topic_engagements WHERE topic_id = $1`, [req.params.id]);
    await linkEngagements(req.params.id, engagement_ids);
  }

  res.json(updated);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const result = await db.run(`DELETE FROM mandat.coordination_topics WHERE id = $1`, [req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Sujet introuvable' });
  res.status(204).end();
});

async function linkEngagements(topicId, engagementIds) {
  if (!Array.isArray(engagementIds) || !engagementIds.length) return;
  for (const engagementId of engagementIds) {
    await db
      .run(
        `INSERT INTO mandat.coordination_topic_engagements (topic_id, engagement_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [topicId, engagementId]
      )
      .catch(() => {}); // ignore un id d'engagement invalide plutôt que de faire échouer tout le lien
  }
}

module.exports = router;
