const express = require('express');
const service = require('./engagements.service');
const proposalsService = require('./proposals.service');
const projetsService = require('../projets/projets.service');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const rows = await service.list(req.query);
  res.json(rows);
});

/**
 * "Mes engagements" : ceux où la direction de l'agent connecté (issue de
 * l'AD via l'APM) est pilote, contributrice, ou direction/fonction
 * ressource impactée. Un ?direction=... explicite prend le pas (utile pour
 * un compte admin, sans direction propre).
 */
router.get('/mine', requireAuth, async (req, res) => {
  const rawDirection = req.query.direction || req.user.direction;
  if (!rawDirection) {
    return res.status(400).json({
      error:
        req.user.role === 'admin'
          ? 'Compte admin sans direction associée — préciser ?direction=... dans la requête'
          : "Aucune direction connue pour cet agent (non renseignée par l'annuaire Ville)",
    });
  }
  const codes = await service.resolveDirectionCodes(rawDirection);
  if (!codes.length) {
    return res.status(404).json({
      error: `Aucun sigle ne correspond à la direction "${rawDirection}" dans la table de concordance (Admin → Table de concordance des directions)`,
      direction: rawDirection,
    });
  }
  const rows = await service.mine(codes);
  res.json({ direction: rawDirection, code: codes.join(', '), codes, engagements: rows });
});

/** Effectifs par période pour les pastilles du filtre "Nouveautés" — mêmes
 * filtres que la liste (hors nouveautes), cf. service.nouveautesCounts. */
router.get('/nouveautes-counts', requireAuth, async (req, res) => {
  const counts = await service.nouveautesCounts(req.query);
  res.json(counts);
});

router.get('/:id', requireAuth, async (req, res) => {
  const engagement = await service.getById(req.params.id);
  if (!engagement) return res.status(404).json({ error: 'Engagement introuvable' });
  // Projets liés : l'agrégat (météo/état déjà répercutés sur l'engagement)
  // est public, mais la liste elle-même n'expose que les projets dont
  // l'utilisateur est membre (ou tout si admin) — cf. accès réservé aux
  // membres sur les projets.
  const projetsLies = await projetsService.listForEngagement(req.params.id, {
    userSub: req.user.sub,
    isAdmin: req.user.role === 'admin',
  });
  res.json({ ...engagement, projetsLies });
});

/**
 * Pilotage / contributions : un agent non-admin ne modifie pas directement
 * ces champs, il les propose (visibles en attente, couleur dédiée côté
 * front) — seul un admin les applique, en validant la proposition (cf.
 * proposals.service.js) ou en les modifiant lui-même directement ici.
 */
router.patch('/:id', requireAuth, async (req, res) => {
  const author = req.user.displayName || req.user.sub;
  const body = { ...(req.body || {}) };
  const proposalsCreated = [];

  if (req.user.role !== 'admin') {
    const restrictedKeys = Object.keys(body).filter((k) => proposalsService.RESTRICTED_FIELDS.includes(k));
    if (restrictedKeys.length) {
      const current = await service.getById(req.params.id);
      if (!current) return res.status(404).json({ error: 'Engagement introuvable' });
      for (const champ of restrictedKeys) {
        const proposed = body[champ] === '' ? null : body[champ];
        delete body[champ]; // jamais appliqué directement pour un non-admin
        if ((current[champ] ?? null) === (proposed ?? null)) continue; // rien à proposer
        const p = await proposalsService.upsertProposal(req.params.id, champ, current[champ], proposed, req.user.sub, author);
        proposalsCreated.push(p);
      }
    }
  }

  if (Object.keys(body).length) {
    const result = await service.update(req.params.id, body, author);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
  }
  // Toujours renvoyer la forme complète (getById), incluant fieldProposals —
  // que la mise à jour ait porté sur un champ direct, une proposition, ou les deux.
  const engagement = await service.getById(req.params.id);
  res.json({ ...engagement, proposalsCreated });
});

router.patch('/:id/prioritaire', requireAuth, async (req, res) => {
  const { prioritaire, note } = req.body || {};
  const author = req.user.displayName || req.user.sub;
  const result = await service.setPrioritaire(req.params.id, Boolean(prioritaire), note, author);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result.engagement);
});

module.exports = router;
