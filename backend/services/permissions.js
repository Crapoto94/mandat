// Niveau d'accès effectif d'un agent sur un engagement ou un projet —
// module partagé (cf. modules/documents/, modules/assignedRoles/,
// modules/projets/, modules/engagements/). Trois niveaux, du plus faible
// au plus fort : consultation (lecture seule) < modification (édition) <
// administration (édition + gestion des membres/rôles + suppression).
const { db } = require('../db/pg_db');
const { isDgOuDirecteur } = require('./accessControl');

const RANK = { consultation: 1, modification: 2, administration: 3 };

function higherLevel(a, b) {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/** true si `level` couvre au moins `min` (ex. atLeast('modification', 'consultation') = true). */
function atLeast(level, min) {
  return !!level && RANK[level] >= RANK[min];
}

/**
 * Niveau d'accès effectif d'un agent sur une fiche.
 * - admin du site : toujours 'administration'.
 * - rôle(s) assigné(s) sur cette fiche : le plus élevé des niveaux portés
 *   par ces rôles (cf. roles.niveau_acces, catalogue paramétrable en admin).
 * - à défaut : repli DG/DGA ou Directeur → 'modification' sur un
 *   engagement, ou sur un projet qui est l'enfant d'un engagement (pas un
 *   projet autonome) — droit métier par défaut, cf. accessControl.js.
 * - à défaut, sur un ENGAGEMENT uniquement : 'consultation' — visible par
 *   tout agent connecté, comme aujourd'hui, mais plus modifiable sans rôle.
 * - à défaut, sur un PROJET : aucun accès (null → 404, comportement déjà
 *   en place, inchangé pour la visibilité).
 */
async function effectiveLevel({ user, owner }) {
  if (!user) return null;
  if (user.role === 'admin') return 'administration';

  const col = owner.projetId != null ? 'projet_id' : 'engagement_id';
  const id = owner.projetId != null ? owner.projetId : owner.engagementId;

  const rows = await db.all(
    `SELECT r.niveau_acces FROM assigned_roles ar JOIN roles r ON r.id = ar.role_id WHERE ar.${col} = $1 AND ar.agent_username = $2`,
    [id, user.sub]
  );
  let level = rows.reduce((acc, r) => higherLevel(acc, r.niveau_acces), null);
  if (level) return level;

  // Repli DG/DGA ou Directeur — par nom (seule info fiable quel que soit le
  // parcours de connexion, cf. accessControl.js).
  if (await isDgOuDirecteur(user.displayName).catch(() => false)) {
    if (owner.engagementId != null) return 'modification';
    if (owner.projetId != null) {
      const projet = await db.get(`SELECT engagement_id FROM projets WHERE id = $1`, [owner.projetId]);
      if (projet?.engagement_id) return 'modification';
    }
  }

  return owner.engagementId != null ? 'consultation' : null;
}

module.exports = { effectiveLevel, atLeast, RANK };
