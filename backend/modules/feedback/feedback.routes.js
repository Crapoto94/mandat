// Demandes et signalements de bug depuis la page "Nouveautés" — n'importe
// quel agent connecté peut en soumettre, mais la liste n'est visible qu'en
// admin (cf. requête utilisateur : "La liste des demandes doit être
// visible en admin uniquement").
const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  const { type, titre, description, page_url } = req.body || {};
  if (!titre || !titre.trim()) return res.status(400).json({ error: 'Titre requis' });
  if (!['bug', 'demande'].includes(type)) return res.status(400).json({ error: 'Type invalide (bug ou demande)' });

  const row = await db.get(
    `INSERT INTO feedback (type, titre, description, page_url, submitted_by, submitted_by_name)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [type, titre.trim(), description?.trim() || null, page_url || null, req.user.sub, req.user.displayName || req.user.sub]
  );
  res.status(201).json(row);
});

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const rows = await db.all(`SELECT * FROM feedback ORDER BY created_at DESC`);
  res.json(rows);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { statut } = req.body || {};
  if (!['nouveau', 'traite'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });

  const row = await db.get(
    `UPDATE feedback SET statut = $1::varchar, treated_at = CASE WHEN $1::varchar = 'traite' THEN now() ELSE NULL END
     WHERE id = $2 RETURNING *`,
    [statut, req.params.id]
  );
  if (!row) return res.status(404).json({ error: 'Introuvable' });
  res.json(row);
});

module.exports = router;
