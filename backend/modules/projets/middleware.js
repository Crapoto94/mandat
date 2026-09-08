// Middleware d'appartenance à un projet — partagé entre projets.routes.js
// et documents.routes.js (base documentaire). 404 plutôt que 403 pour un
// non-membre : cohérent avec "réservé aux membres", on ne confirme même
// pas l'existence du projet.
const { db } = require('../../db/pg_db');
const service = require('./projets.service');

async function requireProjetMembership(req, res, next) {
  const projet = await db.get(`SELECT id, engagement_id FROM projets WHERE id = $1`, [req.params.id]);
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
  if (req.user.role === 'admin') {
    req.projet = projet;
    return next();
  }
  const member = await service.isMember(req.params.id, req.user.sub);
  if (!member) return res.status(404).json({ error: 'Projet introuvable' });
  req.projet = projet;
  next();
}

module.exports = { requireProjetMembership };
