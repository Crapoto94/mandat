const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const rows = await db.all(`SELECT * FROM etats ORDER BY ordre ASC`);
  res.json(rows);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { code, libelle, couleur, ordre } = req.body || {};
  if (!code || !libelle) return res.status(400).json({ error: 'code et libelle sont requis' });
  try {
    const row = await db.get(
      `INSERT INTO etats (code, libelle, couleur, ordre) VALUES ($1, $2, $3, $4) RETURNING *`,
      [code.trim(), libelle.trim(), couleur || '#64748b', ordre ?? 0]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce code existe déjà' });
    res.status(500).json({ error: err.message });
  }
});

/** Le code (référencé par les engagements) n'est pas modifiable — seuls libellé/couleur/ordre le sont. */
router.patch('/:code', requireAuth, requireAdmin, async (req, res) => {
  const { libelle, couleur, ordre } = req.body || {};
  const row = await db.get(
    `UPDATE etats SET libelle = COALESCE($1, libelle), couleur = COALESCE($2, couleur), ordre = COALESCE($3, ordre)
     WHERE code = $4 RETURNING *`,
    [libelle?.trim() || null, couleur || null, ordre ?? null, req.params.code]
  );
  if (!row) return res.status(404).json({ error: 'État introuvable' });
  res.json(row);
});

router.delete('/:code', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.run(`DELETE FROM etats WHERE code = $1`, [req.params.code]);
    if (!result.changes) return res.status(404).json({ error: 'État introuvable' });
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cet état est utilisé sur au moins un engagement, il ne peut pas être supprimé' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
