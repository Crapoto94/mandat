const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/summary', requireAuth, async (req, res) => {
  const [parEtat, parAxe, parGroupe, parMeteo, total, prioritaires, sansGroupe] = await Promise.all([
    db.all(
      `SELECT et.code, et.libelle, et.couleur, et.ordre, COUNT(e.id)::int AS count
       FROM etats et
       LEFT JOIN engagements e ON e.etat_code = et.code
       GROUP BY et.code, et.libelle, et.couleur, et.ordre
       ORDER BY et.ordre ASC`
    ),
    db.all(
      `SELECT axe, COUNT(*)::int AS count FROM engagements GROUP BY axe ORDER BY MIN(numero) ASC`
    ),
    db.all(
      `SELECT g.code, g.nom, COUNT(e.id)::int AS count
       FROM groupes g LEFT JOIN engagements e ON e.groupe_id = g.id
       GROUP BY g.code, g.nom, g.ordre ORDER BY g.ordre ASC`
    ),
    db.all(
      `SELECT m.code, m.libelle, m.emoji, m.couleur, m.ordre, COUNT(e.id)::int AS count
       FROM meteos m
       LEFT JOIN engagements e ON e.meteo_code = m.code
       GROUP BY m.code, m.libelle, m.emoji, m.couleur, m.ordre
       ORDER BY m.ordre ASC`
    ),
    db.get(`SELECT COUNT(*)::int AS count FROM engagements`),
    db.get(`SELECT COUNT(*)::int AS count FROM engagements WHERE prioritaire_plenaire = true`),
    db.get(`SELECT COUNT(*)::int AS count FROM engagements WHERE groupe_id IS NULL`),
  ]);

  const nonRenseigne = total.count - parMeteo.reduce((sum, m) => sum + m.count, 0);

  res.json({
    total: total.count,
    prioritaires: prioritaires.count,
    sansGroupe: sansGroupe.count,
    parEtat,
    parAxe,
    parGroupe,
    parMeteo,
    meteoNonRenseignee: nonRenseigne,
  });
});

module.exports = router;
