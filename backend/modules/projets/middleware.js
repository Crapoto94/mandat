// Middleware d'appartenance à un projet — utilisé par projets.routes.js
// (CRUD, étapes, commentaires). Les modules "widgets" partagés avec les
// engagements (documents, rôles assignés) ont leur propre contrôle
// d'accès équivalent, cf. modules/documents/access.js — même logique de
// niveau d'accès (services/permissions.js), ici posée sur req.projetLevel.
// 404 plutôt que 403 pour un non-membre : cohérent avec "réservé aux
// membres", on ne confirme même pas l'existence du projet.
const { db } = require('../../db/pg_db');
const { effectiveLevel, atLeast } = require('../../services/permissions');

async function requireProjetMembership(req, res, next) {
  const projet = await db.get(`SELECT id, engagement_id FROM projets WHERE id = $1`, [req.params.id]);
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
  const level = await effectiveLevel({ user: req.user, owner: { projetId: Number(req.params.id) } });
  if (!level) return res.status(404).json({ error: 'Projet introuvable' });
  req.projet = projet;
  req.projetLevel = level;
  next();
}

/** À utiliser après requireProjetMembership sur les routes de mutation. */
function requireProjetLevel(min) {
  return (req, res, next) => {
    if (!atLeast(req.projetLevel, min)) {
      return res.status(403).json({ error: `Droits insuffisants (niveau "${min}" requis)` });
    }
    next();
  };
}

module.exports = { requireProjetMembership, requireProjetLevel };
