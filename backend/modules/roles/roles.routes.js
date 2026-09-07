const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

/** Catalogue des rôles assignables (paramétrable en admin). Lecture ouverte à tout agent connecté. */
router.get('/', requireAuth, async (req, res) => {
  const rows = await db.all(`SELECT * FROM roles ORDER BY ordre ASC, libelle ASC`);
  res.json(rows);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { libelle, ordre } = req.body || {};
  if (!libelle || !libelle.trim()) return res.status(400).json({ error: 'Libellé requis' });
  try {
    const role = await db.get(
      `INSERT INTO roles (libelle, ordre) VALUES ($1, $2) RETURNING *`,
      [libelle.trim(), ordre ?? 0]
    );
    res.status(201).json(role);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce rôle existe déjà' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { libelle, ordre } = req.body || {};
  const role = await db.get(
    `UPDATE roles SET libelle = COALESCE($1, libelle), ordre = COALESCE($2, ordre) WHERE id = $3 RETURNING *`,
    [libelle?.trim() || null, ordre ?? null, req.params.id]
  );
  if (!role) return res.status(404).json({ error: 'Rôle introuvable' });
  res.json(role);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.run(`DELETE FROM roles WHERE id = $1`, [req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Rôle introuvable' });
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Ce rôle est utilisé sur au moins un engagement, il ne peut pas être supprimé' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
