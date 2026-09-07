const express = require('express');
const { db } = require('../../db/pg_db');
const hubdsi = require('../../services/hubdsi');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const rows = await db.all(`SELECT * FROM directions ORDER BY code ASC`);
  res.json(rows);
});

/** Référentiel Hub DSI mis en cache (pour peupler la liste déroulante de concordance). */
router.get('/hubdsi-referentiel', requireAuth, async (req, res) => {
  const rows = await db.all(`SELECT * FROM hubdsi_referentiel ORDER BY libelle ASC`);
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
 * Synchronise le référentiel Hub DSI (GET /api/directions-services) : met en
 * cache la liste complète des directions/services (pour la liste déroulante
 * de concordance), et pré-remplit automatiquement les sigles dont le code
 * correspond exactement à une entrée du Hub DSI. Ne touche jamais un
 * libellé déjà affecté manuellement — la concordance manuelle a priorité.
 */
router.post('/sync', requireAuth, requireAdmin, async (req, res) => {
  const { data: raw, structured, error } = await hubdsi.getDirectionsServices();
  if (error) {
    return res.status(502).json({ error: `Hub DSI : ${error}` });
  }
  // `structured` : déjà des paires {code, libelle, parentCode} dédoublonnées
  // (API dédiée org-directions/org-services) ; sinon `raw` est la réponse
  // brute d'un endpoint de repli, à aplatir nous-mêmes.
  const remote = structured ? raw : hubdsi.normalizeDirections(raw).map((d) => ({ ...d, parentCode: null }));
  if (!remote.length) {
    return res.status(502).json({ error: "Réponse du Hub DSI vide ou dans un format inattendu — vérifier la doc Swagger (/api/docs)" });
  }

  // Rafraîchit le cache complet (remplacement, l'organigramme peut évoluer).
  // Directions (sans parent) insérées avant leurs services, pour un rendu
  // groupé cohérent même si parent_code n'est pas garanti côté lecture.
  await db.run(`DELETE FROM hubdsi_referentiel`);
  const ordered = [...remote].sort((a, b) => (a.parentCode ? 1 : 0) - (b.parentCode ? 1 : 0));
  for (const { code, libelle, parentCode } of ordered) {
    await db
      .run(
        `INSERT INTO hubdsi_referentiel (code, libelle, parent_code) VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, parent_code = EXCLUDED.parent_code, synced_at = now()`,
        [code, libelle, parentCode || null]
      )
      .catch(() => {}); // ignore un doublon de libellé improbable plutôt que d'interrompre la synchro
  }

  // IMPORTANT : on ne crée jamais de nouveau sigle ici — `directions` ne doit
  // contenir QUE les sigles rencontrés dans les engagements (pilotage /
  // contributions de l'Excel importé), pas tous les codes du Hub DSI (qui
  // incluent des codes budgétaires/services sans rapport, type "BB", "BB1"...).
  // On met seulement à jour le libellé d'un sigle déjà existant et non
  // saisi manuellement ; la liste déroulante `hubdsi_referentiel` reste,
  // elle, alimentée avec tout le référentiel pour la saisie assistée.
  const existing = await db.all(`SELECT code, libelle_manuel FROM directions`);
  const manualCodes = new Set(existing.filter((d) => d.libelle_manuel).map((d) => d.code.toUpperCase()));
  const remoteByCode = new Map(remote.map((r) => [r.code.toUpperCase(), r.libelle]));

  let synchronises = 0;
  let ignoresManuels = 0;
  for (const d of existing) {
    const key = d.code.toUpperCase();
    if (manualCodes.has(key)) {
      if (remoteByCode.has(key)) ignoresManuels += 1;
      continue; // priorité à la saisie manuelle
    }
    const libelle = remoteByCode.get(key);
    if (!libelle) continue; // aucune correspondance Hub DSI pour ce sigle
    const result = await db.run(`UPDATE directions SET libelle = $1, updated_at = now() WHERE code = $2`, [
      libelle,
      d.code,
    ]);
    if (result.changes) synchronises += 1;
  }

  res.json({ recuDuHub: remote.length, synchronises, ignoresManuels });
});

module.exports = router;
