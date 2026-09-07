const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/summary', requireAuth, async (req, res) => {
  const [parEtat, parAxe, parGroupe, total, prioritaires, sansGroupe] = await Promise.all([
    db.all(
      `SELECT et.code, et.libelle, et.couleur, et.ordre, COUNT(e.id)::int AS count
       FROM mandat.etats et
       LEFT JOIN mandat.engagements e ON e.etat_code = et.code
       GROUP BY et.code, et.libelle, et.couleur, et.ordre
       ORDER BY et.ordre ASC`
    ),
    db.all(
      `SELECT axe, COUNT(*)::int AS count FROM mandat.engagements GROUP BY axe ORDER BY MIN(numero) ASC`
    ),
    db.all(
      `SELECT g.code, g.nom, COUNT(e.id)::int AS count
       FROM mandat.groupes g LEFT JOIN mandat.engagements e ON e.groupe_id = g.id
       GROUP BY g.code, g.nom, g.ordre ORDER BY g.ordre ASC`
    ),
    db.get(`SELECT COUNT(*)::int AS count FROM mandat.engagements`),
    db.get(`SELECT COUNT(*)::int AS count FROM mandat.engagements WHERE prioritaire_plenaire = true`),
    db.get(`SELECT COUNT(*)::int AS count FROM mandat.engagements WHERE groupe_id IS NULL`),
  ]);

  res.json({
    total: total.count,
    prioritaires: prioritaires.count,
    sansGroupe: sansGroupe.count,
    parEtat,
    parAxe,
    parGroupe,
  });
});

module.exports = router;
