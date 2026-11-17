// Étapes datées (timeline) d'un engagement. Monté sous /api/engagements
// (/api/engagements/:id/steps). Les rôles assignés (jusqu'ici ici aussi)
// vivent désormais dans le module partagé projets/engagements — cf.
// modules/assignedRoles/assignedRoles.routes.js (/api/engagements/:id/roles).
const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');
const { parseVagueDate } = require('../../lib/vagueDate');
const { effectiveLevel, atLeast } = require('../../services/permissions');

const router = express.Router();

async function assertEngagementExists(id, res) {
  const engagement = await db.get(`SELECT id FROM engagements WHERE id = $1`, [id]);
  if (!engagement) {
    res.status(404).json({ error: 'Engagement introuvable' });
    return false;
  }
  return true;
}

/** À utiliser sur les routes de mutation. */
async function requireModification(req, res) {
  const level = await effectiveLevel({ user: req.user, owner: { engagementId: Number(req.params.id) } });
  if (!atLeast(level, 'modification')) {
    res.status(403).json({ error: 'Droits insuffisants pour modifier les étapes de cet engagement' });
    return false;
  }
  return true;
}

// --- Étapes datées (timeline) -------------------------------------------

router.get('/:id/steps', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT * FROM engagement_steps WHERE engagement_id = $1 ORDER BY date_etape ASC NULLS LAST, created_at ASC`,
    [req.params.id]
  );
  res.json(rows);
});

router.post('/:id/steps', requireAuth, async (req, res) => {
  if (!(await assertEngagementExists(req.params.id, res))) return;
  if (!(await requireModification(req, res))) return;
  const { date_etape, description } = req.body || {};
  if (!description || !description.trim()) return res.status(400).json({ error: 'Description requise' });

  let parsedDate;
  try {
    parsedDate = parseVagueDate(date_etape);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const step = await db.get(
    `INSERT INTO engagement_steps (engagement_id, date_etape, description, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.id, parsedDate, description.trim(), req.user.displayName || req.user.sub]
  );
  res.status(201).json(step);
});

router.patch('/:id/steps/:stepId', requireAuth, async (req, res) => {
  if (!(await requireModification(req, res))) return;
  const { date_etape, description } = req.body || {};

  let parsedDate;
  try {
    // undefined (champ absent du patch) : ne pas toucher la date existante.
    // Chaîne vide explicite : effacer la date (COALESCE ne le permettrait
    // pas, d'où le double-INSERT ci-dessous plutôt qu'un simple COALESCE).
    parsedDate = date_etape === undefined ? undefined : parseVagueDate(date_etape);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const step = await db.get(
    `UPDATE engagement_steps SET
       date_etape = CASE WHEN $1::boolean THEN $2::date ELSE date_etape END,
       description = COALESCE($3, description)
     WHERE id = $4 AND engagement_id = $5 RETURNING *`,
    [parsedDate !== undefined, parsedDate ?? null, description?.trim() || null, req.params.stepId, req.params.id]
  );
  if (!step) return res.status(404).json({ error: 'Étape introuvable' });
  res.json(step);
});

router.delete('/:id/steps/:stepId', requireAuth, async (req, res) => {
  if (!(await requireModification(req, res))) return;
  const result = await db.run(`DELETE FROM engagement_steps WHERE id = $1 AND engagement_id = $2`, [
    req.params.stepId,
    req.params.id,
  ]);
  if (!result.changes) return res.status(404).json({ error: 'Étape introuvable' });
  res.status(204).end();
});

module.exports = router;
