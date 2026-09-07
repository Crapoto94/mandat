const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const rows = await db.all(`SELECT * FROM meteos ORDER BY ordre ASC`);
  res.json(rows);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { code, libelle, emoji, couleur, ordre } = req.body || {};
  if (!code || !libelle || !emoji) return res.status(400).json({ error: 'code, libelle et emoji sont requis' });
  try {
    const row = await db.get(
      `INSERT INTO meteos (code, libelle, emoji, couleur, ordre) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code.trim(), libelle.trim(), emoji.trim(), couleur || '#64748b', ordre ?? 0]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce code existe déjà' });
    res.status(500).json({ error: err.message });
  }
});

/** Le code (référencé par les engagements) n'est pas modifiable — seuls libellé/emoji/couleur/ordre le sont. */
router.patch('/:code', requireAuth, requireAdmin, async (req, res) => {
  const { libelle, emoji, couleur, ordre } = req.body || {};
  const row = await db.get(
    `UPDATE meteos SET
       libelle = COALESCE($1, libelle), emoji = COALESCE($2, emoji),
       couleur = COALESCE($3, couleur), ordre = COALESCE($4, ordre)
     WHERE code = $5 RETURNING *`,
    [libelle?.trim() || null, emoji?.trim() || null, couleur || null, ordre ?? null, req.params.code]
  );
  if (!row) return res.status(404).json({ error: 'Météo introuvable' });
  res.json(row);
});

router.delete('/:code', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.run(`DELETE FROM meteos WHERE code = $1`, [req.params.code]);
    if (!result.changes) return res.status(404).json({ error: 'Météo introuvable' });
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cette météo est utilisée sur au moins un engagement, elle ne peut pas être supprimée' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
