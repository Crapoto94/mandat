// Routes projets — cf. migrations/017_projets.sql et projets.service.js.
// Accès réservé aux membres (+ admin) sur tout ce qui touche à UN projet
// précis (:id) — premier vrai mécanisme de permission de l'appli.
const express = require('express');
const service = require('./projets.service');
const { db } = require('../../db/pg_db');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

/** Charge le projet et vérifie l'appartenance — 404 plutôt que 403 pour un
 * non-membre : on ne confirme même pas l'existence du projet (cohérent
 * avec "réservé aux membres", pas juste "en lecture seule pour les autres"). */
async function requireMembership(req, res, next) {
  const projet = await db.get(`SELECT id, engagement_id FROM projets WHERE id = $1`, [req.params.id]);
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
  if (req.user.role === 'admin') {
    req.projet = projet;
    return next();
  }
  const member = await service.isMember(req.params.id, req.user.sub);
  if (!member) return res.status(404).json({ error: 'Projet introuvable' });
  req.projet = projet;
  next();
}

router.get('/', requireAuth, async (req, res) => {
  const rows = await service.list({ userSub: req.user.sub, isAdmin: req.user.role === 'admin' });
  res.json(rows);
});

router.post('/', requireAuth, async (req, res) => {
  const author = req.user.displayName || req.user.sub;
  const result = await service.create({ ...req.body, created_by_sub: req.user.sub }, author);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json(result.projet);
});

router.get('/:id', requireAuth, requireMembership, async (req, res) => {
  const projet = await service.getById(req.params.id);
  res.json(projet);
});

router.patch('/:id', requireAuth, requireMembership, async (req, res) => {
  const author = req.user.displayName || req.user.sub;
  const result = await service.update(req.params.id, req.body || {}, author);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(await service.getById(req.params.id));
});

// Suppression réservée aux admin (demande explicite) — requireAdmin avant
// requireMembership, pour ne même pas révéler qu'un non-admin membre
// pourrait autrement voir le projet, puis se voir refuser la suppression.
router.delete('/:id', requireAuth, requireAdmin, requireMembership, async (req, res) => {
  const result = await service.remove(req.params.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(204).end();
});

// --- Membres --------------------------------------------------------------

router.post('/:id/membres', requireAuth, requireMembership, async (req, res) => {
  try {
    const member = await service.addMember(req.params.id, req.body || {}, req.user.sub);
    res.status(201).json(member);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:id/membres/:memberId', requireAuth, requireMembership, async (req, res) => {
  const removed = await service.removeMember(req.params.id, req.params.memberId);
  if (!removed) return res.status(404).json({ error: 'Membre introuvable' });
  res.status(204).end();
});

// --- Étapes -----------------------------------------------------------------

router.post('/:id/steps', requireAuth, requireMembership, async (req, res) => {
  const { date_etape, description } = req.body || {};
  if (!description || !description.trim()) return res.status(400).json({ error: 'Description requise' });
  const { parseVagueDate } = require('../../lib/vagueDate');
  let parsedDate;
  try {
    parsedDate = parseVagueDate(date_etape);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const step = await db.get(
    `INSERT INTO projet_steps (projet_id, date_etape, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.id, parsedDate, description.trim(), req.user.displayName || req.user.sub]
  );
  res.status(201).json(step);
});

router.delete('/:id/steps/:stepId', requireAuth, requireMembership, async (req, res) => {
  const result = await db.run(`DELETE FROM projet_steps WHERE id = $1 AND projet_id = $2`, [req.params.stepId, req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Étape introuvable' });
  res.status(204).end();
});

// --- Commentaires -----------------------------------------------------------

router.post('/:id/comments', requireAuth, requireMembership, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Commentaire vide' });
  const comment = await db.get(
    `INSERT INTO projet_comments (projet_id, author_name, author_direction, author_sub, body)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.id, req.user.displayName || req.user.sub, req.user.direction || null, req.user.sub, body.trim()]
  );
  res.status(201).json(comment);
});

router.patch('/:id/comments/:commentId', requireAuth, requireMembership, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Commentaire vide' });
  const existing = await db.get(`SELECT * FROM projet_comments WHERE id = $1 AND projet_id = $2`, [req.params.commentId, req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Commentaire introuvable' });
  const isOwner = existing.author_sub && existing.author_sub === req.user.sub;
  if (!isOwner && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Seul l'auteur peut modifier ce commentaire" });
  }
  const comment = await db.get(`UPDATE projet_comments SET body = $1, edited_at = now() WHERE id = $2 RETURNING *`, [
    body.trim(),
    req.params.commentId,
  ]);
  res.json(comment);
});

module.exports = router;
