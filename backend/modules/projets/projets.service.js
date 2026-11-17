// Projets : cf. migrations/017_projets.sql. Un engagement dont au moins un
// projet est lié voit sa météo et son état d'avancement recalculés
// automatiquement (météo = la pire des projets liés, état = le moins
// avancé) — cf. recomputeEngagementAggregate, appelée après toute
// création/modification/suppression d'un projet lié à un engagement.
const { db } = require('../../db/pg_db');

const EDITABLE_FIELDS = ['nom', 'description', 'axe', 'etat_code', 'meteo_code', 'echeance', 'continu', 'pilotage', 'engagement_id'];

/** Recalcule météo/état de l'engagement à partir de ses projets liés — la
 * pire météo (ordre le plus élevé), l'état le moins avancé (ordre le plus
 * faible). Sans projet lié, l'engagement garde ses valeurs saisies à la
 * main (comportement actuel, inchangé). */
async function recomputeEngagementAggregate(engagementId) {
  if (!engagementId) return;
  const worstMeteo = await db.get(
    `SELECT p.meteo_code FROM projets p
     JOIN meteos m ON m.code = p.meteo_code
     WHERE p.engagement_id = $1 AND p.meteo_code IS NOT NULL
     ORDER BY m.ordre DESC LIMIT 1`,
    [engagementId]
  );
  const leastAdvancedEtat = await db.get(
    `SELECT p.etat_code FROM projets p
     JOIN etats et ON et.code = p.etat_code
     WHERE p.engagement_id = $1
     ORDER BY et.ordre ASC LIMIT 1`,
    [engagementId]
  );
  if (!leastAdvancedEtat) return; // aucun projet lié : ne touche à rien

  await db.run(`UPDATE engagements SET meteo_code = $1, etat_code = COALESCE($2, etat_code) WHERE id = $3`, [
    worstMeteo?.meteo_code || null,
    leastAdvancedEtat?.etat_code || null,
    engagementId,
  ]);
}

/** Projets visibles par cet utilisateur : ceux dont il est membre, plus
 * tout, sans filtre, si admin. */
async function list({ userSub, isAdmin, engagementId }) {
  const clauses = [];
  const params = [];
  if (!isAdmin) {
    params.push(userSub);
    clauses.push(`EXISTS (SELECT 1 FROM assigned_roles ar WHERE ar.projet_id = p.id AND ar.agent_username = $${params.length})`);
  }
  if (engagementId) {
    params.push(engagementId);
    clauses.push(`p.engagement_id = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.all(
    `SELECT p.*, et.libelle AS etat_libelle, et.couleur AS etat_couleur,
            m.libelle AS meteo_libelle, m.emoji AS meteo_emoji, m.couleur AS meteo_couleur,
            e.numero AS engagement_numero, e.contenu AS engagement_contenu,
            (SELECT COUNT(DISTINCT ar.agent_username)::int FROM assigned_roles ar WHERE ar.projet_id = p.id) AS membre_count
     FROM projets p
     LEFT JOIN etats et ON et.code = p.etat_code
     LEFT JOIN meteos m ON m.code = p.meteo_code
     LEFT JOIN engagements e ON e.id = p.engagement_id
     ${where}
     ORDER BY p.updated_at DESC`,
    params
  );
}

/** Projets liés à un engagement visibles par cet utilisateur — pour le
 * panneau "Projets liés" de la fiche engagement (agrégat public, mais le
 * détail par projet reste réservé aux membres). */
async function listForEngagement(engagementId, { userSub, isAdmin }) {
  return list({ userSub, isAdmin, engagementId });
}

/** Est membre d'un projet quiconque y a au moins un rôle assigné (cf.
 * assigned_roles, table partagée avec les engagements — module "Rôles
 * assignés" commun). */
async function isMember(projetId, userSub) {
  const row = await db.get(`SELECT 1 FROM assigned_roles WHERE projet_id = $1 AND agent_username = $2`, [projetId, userSub]);
  return !!row;
}

async function getById(id) {
  const projet = await db.get(
    `SELECT p.*, et.libelle AS etat_libelle, et.couleur AS etat_couleur,
            m.libelle AS meteo_libelle, m.emoji AS meteo_emoji, m.couleur AS meteo_couleur,
            e.numero AS engagement_numero, e.contenu AS engagement_contenu
     FROM projets p
     LEFT JOIN etats et ON et.code = p.etat_code
     LEFT JOIN meteos m ON m.code = p.meteo_code
     LEFT JOIN engagements e ON e.id = p.engagement_id
     WHERE p.id = $1`,
    [id]
  );
  if (!projet) return null;

  const [roles, steps, comments, history] = await Promise.all([
    db.all(
      `SELECT ar.*, r.libelle AS role_libelle FROM assigned_roles ar
       JOIN roles r ON r.id = ar.role_id
       WHERE ar.projet_id = $1 ORDER BY ar.created_at ASC`,
      [id]
    ),
    db.all(`SELECT * FROM projet_steps WHERE projet_id = $1 ORDER BY date_etape ASC NULLS LAST, created_at ASC`, [id]),
    db.all(`SELECT * FROM projet_comments WHERE projet_id = $1 ORDER BY created_at ASC`, [id]),
    db.all(`SELECT * FROM projet_history WHERE projet_id = $1 ORDER BY changed_at DESC`, [id]),
  ]);

  return { ...projet, roles, steps, comments, history };
}

async function create(patch, author) {
  const nom = (patch.nom || '').trim();
  if (!nom) return { ok: false, status: 400, error: 'Nom requis' };

  const projet = await db.get(
    `INSERT INTO projets (engagement_id, nom, description, axe, etat_code, meteo_code, echeance, continu, pilotage, created_by, updated_by)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'a_lancer'), $6, $7, COALESCE($8, false), $9, $10, $10)
     RETURNING *`,
    [
      patch.engagement_id || null,
      nom,
      patch.description || null,
      patch.axe || null,
      patch.etat_code || null,
      patch.meteo_code || null,
      patch.echeance || null,
      patch.continu ?? false,
      patch.pilotage || null,
      author || null,
    ]
  );

  // Créateur = propriétaire d'office (rôle "Propriétaire", niveau
  // administration), sinon il perdrait immédiatement l'accès à ce qu'il
  // vient de créer (accès réservé aux membres = agents ayant au moins un
  // rôle assigné sur ce projet) — et ne pourrait plus y assigner d'autres
  // agents, action réservée au niveau administration.
  if (author && patch.created_by_sub) {
    const ownerRole = await db.get(`SELECT id FROM roles WHERE libelle = 'Propriétaire'`);
    if (ownerRole) {
      await db
        .run(
          `INSERT INTO assigned_roles (projet_id, role_id, agent_username, agent_display_name, created_by)
           VALUES ($1, $2, $3, $4, $4)`,
          [projet.id, ownerRole.id, patch.created_by_sub, author]
        )
        .catch(() => {});
    }
  }

  if (projet.engagement_id) await recomputeEngagementAggregate(projet.engagement_id);
  return { ok: true, projet };
}

async function update(id, patch, author) {
  const current = await db.get(`SELECT * FROM projets WHERE id = $1`, [id]);
  if (!current) return { ok: false, status: 404, error: 'Projet introuvable' };

  const fields = Object.keys(patch).filter((k) => EDITABLE_FIELDS.includes(k));
  const setClauses = [];
  const params = [];
  const historyEntries = [];

  for (const field of fields) {
    const newValue = patch[field] === '' ? null : patch[field];
    const oldValue = current[field];
    if ((oldValue ?? null) === (newValue ?? null)) continue;
    params.push(newValue);
    setClauses.push(`${field} = $${params.length}`);
    historyEntries.push({ field, oldValue, newValue });
  }
  if (!setClauses.length) return { ok: true, projet: current, unchanged: true };

  params.push(author || null);
  setClauses.push(`updated_by = $${params.length}`);
  params.push(id);

  const projet = await db.get(`UPDATE projets SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`, params);

  for (const entry of historyEntries) {
    await db.run(
      `INSERT INTO projet_history (projet_id, champ, ancienne_valeur, nouvelle_valeur, changed_by) VALUES ($1, $2, $3, $4, $5)`,
      [id, entry.field, entry.oldValue ?? null, entry.newValue ?? null, author || null]
    );
  }

  // Le rattachement a pu changer (avant/après) : recalcule les deux engagements concernés.
  if (current.engagement_id) await recomputeEngagementAggregate(current.engagement_id);
  if (projet.engagement_id && projet.engagement_id !== current.engagement_id) {
    await recomputeEngagementAggregate(projet.engagement_id);
  }

  return { ok: true, projet };
}

async function remove(id) {
  const current = await db.get(`SELECT engagement_id FROM projets WHERE id = $1`, [id]);
  if (!current) return { ok: false, status: 404, error: 'Projet introuvable' };

  // Nettoie les fichiers de la base documentaire sur disque avant que le
  // ON DELETE CASCADE (projets → doc_documents) ne supprime les lignes qui
  // en gardaient la trace — module partagé avec les engagements, cf.
  // modules/documents/.
  const documentsService = require('../documents/documents.service');
  const storedNames = await documentsService.listAllStoredNames({ projetId: id }).catch(() => []);

  await db.run(`DELETE FROM projets WHERE id = $1`, [id]);
  documentsService.deleteStoredFiles(storedNames);

  if (current.engagement_id) await recomputeEngagementAggregate(current.engagement_id);
  return { ok: true };
}

// L'ajout/retrait de membres passe désormais par le module "Rôles assignés"
// partagé (cf. modules/roles/) — assigner un rôle à un agent le rend membre
// du projet, lui en retirer le dernier rôle le retire de la liste des
// membres. Plus de gestion de "membres" séparée ici.

module.exports = {
  list,
  listForEngagement,
  isMember,
  getById,
  create,
  update,
  remove,
  recomputeEngagementAggregate,
};
