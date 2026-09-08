const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const groupes = await db.all(`SELECT * FROM groupes ORDER BY ordre ASC`);
  const stats = await db.all(
    `SELECT groupe_id, etat_code, COUNT(*)::int AS count
     FROM engagements GROUP BY groupe_id, etat_code`
  );
  const totals = await db.all(
    `SELECT groupe_id, COUNT(*)::int AS total FROM engagements GROUP BY groupe_id`
  );

  const totalsById = new Map(totals.map((t) => [t.groupe_id, t.total]));
  const statsById = new Map();
  for (const s of stats) {
    if (!statsById.has(s.groupe_id)) statsById.set(s.groupe_id, {});
    statsById.get(s.groupe_id)[s.etat_code] = s.count;
  }

  res.json(
    groupes.map((g) => ({
      ...g,
      total_engagements: totalsById.get(g.id) || 0,
      par_etat: statsById.get(g.id) || {},
    }))
  );
});

/** Synthèse plénière : les engagements marqués prioritaires par chaque groupe. */
router.get('/plenieres', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT e.*, g.code AS groupe_code, g.nom AS groupe_nom,
            et.libelle AS etat_libelle, et.couleur AS etat_couleur,
            m.libelle AS meteo_libelle, m.emoji AS meteo_emoji, m.couleur AS meteo_couleur
     FROM engagements e
     JOIN groupes g ON g.id = e.groupe_id
     LEFT JOIN etats et ON et.code = e.etat_code
     LEFT JOIN meteos m ON m.code = e.meteo_code
     WHERE e.prioritaire_plenaire = true
     ORDER BY g.ordre ASC, e.numero ASC`
  );
  res.json(rows);
});

module.exports = router;
