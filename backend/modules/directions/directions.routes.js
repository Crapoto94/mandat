const express = require('express');
const { db } = require('../../db/pg_db');
const hubdsi = require('../../services/hubdsi');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const rows = await db.all(`SELECT * FROM directions ORDER BY code ASC`);
  res.json(rows);
});

/** Table de concordance : assigner/corriger le nom complet d'un sigle de direction. */
router.patch('/:code', requireAuth, requireAdmin, async (req, res) => {
  const { libelle } = req.body || {};
  if (!libelle || !libelle.trim()) return res.status(400).json({ error: 'Libellé requis' });
  const row = await db.get(
    `UPDATE directions SET libelle = $1, libelle_manuel = true, updated_at = now() WHERE code = $2 RETURNING *`,
    [libelle.trim(), req.params.code]
  );
  if (!row) return res.status(404).json({ error: 'Sigle inconnu' });
  res.json(row);
});

/**
 * Synchronise les noms complets depuis le référentiel Hub DSI
 * (GET /api/directions-services). Ne touche pas aux libellés déjà corrigés
 * manuellement — la concordance manuelle a toujours priorité.
 */
router.post('/sync', requireAuth, requireAdmin, async (req, res) => {
  const { data: raw, error } = await hubdsi.getDirectionsServices();
  if (error) {
    return res.status(502).json({ error: `Hub DSI : ${error}` });
  }
  const remote = hubdsi.normalizeDirections(raw);
  if (!remote.length) {
    return res.status(502).json({ error: "Réponse du Hub DSI vide ou dans un format inattendu — vérifier la doc Swagger (/api/docs)" });
  }

  const existing = await db.all(`SELECT code, libelle_manuel FROM directions`);
  const manualCodes = new Set(existing.filter((d) => d.libelle_manuel).map((d) => d.code.toUpperCase()));

  let synchronises = 0;
  let ignoresManuels = 0;
  for (const { code, libelle } of remote) {
    if (manualCodes.has(code.toUpperCase())) {
      ignoresManuels += 1;
      continue; // priorité à la saisie manuelle
    }
    const result = await db.run(
      `INSERT INTO directions (code, libelle, libelle_manuel, updated_at)
       VALUES ($1, $2, false, now())
       ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, updated_at = now()
       WHERE directions.libelle_manuel = false`,
      [code, libelle]
    );
    if (result.changes) synchronises += 1;
  }

  res.json({ recuDuHub: remote.length, synchronises, ignoresManuels });
});

module.exports = router;
