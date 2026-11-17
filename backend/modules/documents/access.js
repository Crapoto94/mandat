// Contrôle d'accès au propriétaire d'une fiche (projet ou engagement) —
// partagé par la base documentaire ET le module de rôles assignés. Le
// "kind" (quel type de fiche) vient du montage dans server.js (deux montages
// du même routeur, un par type) ; l'id vient de l'URL (:id). Le niveau
// d'accès effectif (consultation/modification/administration) est calculé
// une fois ici et posé sur req.owner.level — cf. services/permissions.js.
const { db } = require('../../db/pg_db');
const { effectiveLevel } = require('../../services/permissions');

/**
 * Engagement : visible par tout agent authentifié (niveau "consultation"
 * minimum garanti), comme le reste de l'application — l'édition, elle,
 * nécessite "modification" ou plus (vérifié route par route via
 * requireLevel, pas ici). Projet : 404 (pas 403) si aucun accès du tout —
 * cohérent avec l'existant, on ne confirme même pas l'existence du projet
 * à qui n'y a pas accès.
 */
async function requireOwnerAccess(req, res, next) {
  const kind = req.ownerKind;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide' });

  if (kind === 'engagement') {
    const row = await db.get(`SELECT id FROM engagements WHERE id = $1`, [id]);
    if (!row) return res.status(404).json({ error: 'Engagement introuvable' });
    const owner = { kind, engagementId: id };
    owner.level = await effectiveLevel({ user: req.user, owner });
    req.owner = owner;
    return next();
  }

  const row = await db.get(`SELECT id FROM projets WHERE id = $1`, [id]);
  if (!row) return res.status(404).json({ error: 'Projet introuvable' });
  const owner = { kind, projetId: id };
  owner.level = await effectiveLevel({ user: req.user, owner });
  if (!owner.level) return res.status(404).json({ error: 'Projet introuvable' });
  req.owner = owner;
  next();
}

/** N'autorise la suite que si req.owner.level couvre au moins `min` — à
 * utiliser après requireOwnerAccess sur les routes de mutation. */
function requireLevel(min) {
  const { atLeast } = require('../../services/permissions');
  return (req, res, next) => {
    if (!atLeast(req.owner?.level, min)) {
      return res.status(403).json({ error: `Droits insuffisants (niveau "${min}" requis)` });
    }
    next();
  };
}

/** Pour les routes adressées par id de DOCUMENT (pas par id de fiche) : la
 * ligne elle-même dit à quelle fiche elle appartient — on en déduit
 * l'appartenance et on applique le même contrôle qu'au-dessus. Renvoie
 * aussi `level`, pour les routes qui doivent distinguer lecture/écriture
 * (ex. téléchargement vs suppression d'un document). */
async function loadDocOwnerFromRow(row, req) {
  const owner = row.engagement_id ? { kind: 'engagement', engagementId: row.engagement_id } : { kind: 'projet', projetId: row.projet_id };
  owner.level = await effectiveLevel({ user: req.user, owner });
  if (!owner.level) return null;
  return owner;
}

module.exports = { requireOwnerAccess, requireLevel, loadDocOwnerFromRow };
