// Propositions de modification sur les champs sensibles (pilotage,
// contributions) — cf. migrations/015_field_proposals.sql pour le contexte.
const { db } = require('../../db/pg_db');

const RESTRICTED_FIELDS = ['pilotage', 'contribution_elaboration', 'contribution_impactees'];

/** Crée ou met à jour (upsert) la proposition en attente pour ce champ. */
async function upsertProposal(engagementId, champ, valeurActuelle, valeurProposee, authorSub, authorName) {
  return db.get(
    `INSERT INTO field_proposals (engagement_id, champ, valeur_actuelle, valeur_proposee, proposed_by, proposed_by_name, statut)
     VALUES ($1, $2, $3, $4, $5, $6, 'en_attente')
     ON CONFLICT (engagement_id, champ) WHERE statut = 'en_attente'
     DO UPDATE SET
       valeur_proposee = EXCLUDED.valeur_proposee,
       valeur_actuelle = EXCLUDED.valeur_actuelle,
       proposed_by = EXCLUDED.proposed_by,
       proposed_by_name = EXCLUDED.proposed_by_name,
       created_at = now()
     RETURNING *`,
    [engagementId, champ, valeurActuelle ?? null, valeurProposee ?? '', authorSub || null, authorName || null]
  );
}

async function listPendingForEngagement(engagementId) {
  return db.all(
    `SELECT * FROM field_proposals WHERE engagement_id = $1 AND statut = 'en_attente' ORDER BY created_at ASC`,
    [engagementId]
  );
}

/** Toutes les propositions en attente, tous engagements confondus — pour la
 * vue admin centralisée. */
async function listAllPending() {
  return db.all(
    `SELECT p.*, e.numero AS engagement_numero, e.contenu AS engagement_contenu
     FROM field_proposals p
     JOIN engagements e ON e.id = p.engagement_id
     WHERE p.statut = 'en_attente'
     ORDER BY p.created_at ASC`
  );
}

/** Valide ou rejette une proposition. La validation applique la valeur via
 * engagements.service.update() (require tardif : évite une dépendance
 * circulaire au chargement du module) pour que l'historique de l'engagement
 * reste cohérent avec toute autre modification de champ. */
async function resolve(id, action, reviewer) {
  if (!['valider', 'rejeter'].includes(action)) {
    return { ok: false, status: 400, error: 'Action invalide (valider ou rejeter)' };
  }
  const proposal = await db.get(`SELECT * FROM field_proposals WHERE id = $1 AND statut = 'en_attente'`, [id]);
  if (!proposal) return { ok: false, status: 404, error: 'Proposition introuvable ou déjà traitée' };

  if (action === 'valider') {
    const engagementsService = require('./engagements.service');
    const result = await engagementsService.update(proposal.engagement_id, { [proposal.champ]: proposal.valeur_proposee }, reviewer);
    if (!result.ok) return result;
  }

  const updated = await db.get(
    `UPDATE field_proposals SET statut = $1, reviewed_by = $2, reviewed_at = now() WHERE id = $3 RETURNING *`,
    [action === 'valider' ? 'validee' : 'rejetee', reviewer || null, id]
  );
  return { ok: true, proposal: updated };
}

module.exports = { RESTRICTED_FIELDS, upsertProposal, listPendingForEngagement, listAllPending, resolve };
