const { db } = require('../../db/pg_db');

// Colonnes que l'on autorise à modifier via PATCH — tout le reste (numero,
// dates système...) est en lecture seule côté API.
const EDITABLE_FIELDS = [
  'axe',
  'contenu',
  'pilotage',
  'contribution_elaboration',
  'contribution_impactees',
  'echeance',
  'etat_code',
  'description_avancement',
  'prochaines_etapes',
  'roles_precises',
];

const MAX_PRIORITAIRES_PAR_GROUPE = 3;

function buildFilters({ groupe_id, etat_code, axe, prioritaire, q }) {
  const clauses = [];
  const params = [];

  if (groupe_id !== undefined) {
    if (groupe_id === 'none') {
      clauses.push('e.groupe_id IS NULL');
    } else {
      params.push(groupe_id);
      clauses.push(`e.groupe_id = $${params.length}`);
    }
  }
  if (etat_code) {
    params.push(etat_code);
    clauses.push(`e.etat_code = $${params.length}`);
  }
  if (axe) {
    params.push(`%${axe}%`);
    clauses.push(`e.axe ILIKE $${params.length}`);
  }
  if (prioritaire !== undefined) {
    params.push(prioritaire === 'true' || prioritaire === true);
    clauses.push(`e.prioritaire_plenaire = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(e.contenu ILIKE $${params.length} OR e.pilotage ILIKE $${params.length})`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function list(filters) {
  const { where, params } = buildFilters(filters);
  return db.all(
    `SELECT e.*, g.code AS groupe_code, g.nom AS groupe_nom,
            et.libelle AS etat_libelle, et.couleur AS etat_couleur, et.ordre AS etat_ordre
     FROM mandat.engagements e
     LEFT JOIN mandat.groupes g ON g.id = e.groupe_id
     LEFT JOIN mandat.etats et ON et.code = e.etat_code
     ${where}
     ORDER BY e.numero ASC`,
    params
  );
}

async function getById(id) {
  const engagement = await db.get(
    `SELECT e.*, g.code AS groupe_code, g.nom AS groupe_nom,
            et.libelle AS etat_libelle, et.couleur AS etat_couleur
     FROM mandat.engagements e
     LEFT JOIN mandat.groupes g ON g.id = e.groupe_id
     LEFT JOIN mandat.etats et ON et.code = e.etat_code
     WHERE e.id = $1`,
    [id]
  );
  if (!engagement) return null;

  const [history, comments, coordinationTopics] = await Promise.all([
    db.all(
      `SELECT * FROM mandat.engagement_history WHERE engagement_id = $1 ORDER BY changed_at DESC`,
      [id]
    ),
    db.all(`SELECT * FROM mandat.comments WHERE engagement_id = $1 ORDER BY created_at ASC`, [id]),
    db.all(
      `SELECT t.* FROM mandat.coordination_topics t
       JOIN mandat.coordination_topic_engagements l ON l.topic_id = t.id
       WHERE l.engagement_id = $1 ORDER BY t.updated_at DESC`,
      [id]
    ),
  ]);

  return { ...engagement, history, comments, coordinationTopics };
}

async function update(id, patch, author) {
  const current = await db.get(`SELECT * FROM mandat.engagements WHERE id = $1`, [id]);
  if (!current) return { ok: false, status: 404, error: 'Engagement introuvable' };

  const fields = Object.keys(patch).filter((k) => EDITABLE_FIELDS.includes(k));
  if (!fields.length) return { ok: false, status: 400, error: 'Aucun champ modifiable fourni' };

  const setClauses = [];
  const params = [];
  const historyEntries = [];

  for (const field of fields) {
    const newValue = patch[field];
    const oldValue = current[field];
    if ((oldValue ?? null) === (newValue ?? null)) continue; // pas de changement réel
    params.push(newValue);
    setClauses.push(`${field} = $${params.length}`);
    historyEntries.push({ field, oldValue, newValue });
  }

  if (!setClauses.length) return { ok: true, engagement: current, unchanged: true };

  params.push(author || null);
  setClauses.push(`updated_by = $${params.length}`);
  params.push(id);

  const updated = await db.get(
    `UPDATE mandat.engagements SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  for (const entry of historyEntries) {
    await db.run(
      `INSERT INTO mandat.engagement_history (engagement_id, champ, ancienne_valeur, nouvelle_valeur, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, entry.field, entry.oldValue ?? null, entry.newValue ?? null, author || null]
    );
  }

  return { ok: true, engagement: updated };
}

async function setPrioritaire(id, prioritaire, note, author) {
  const engagement = await db.get(`SELECT * FROM mandat.engagements WHERE id = $1`, [id]);
  if (!engagement) return { ok: false, status: 404, error: 'Engagement introuvable' };

  if (prioritaire && !engagement.prioritaire_plenaire) {
    if (!engagement.groupe_id) {
      return { ok: false, status: 400, error: "Cet engagement n'appartient à aucun groupe" };
    }
    const { count } = await db.get(
      `SELECT COUNT(*)::int AS count FROM mandat.engagements
       WHERE groupe_id = $1 AND prioritaire_plenaire = true AND id <> $2`,
      [engagement.groupe_id, id]
    );
    if (count >= MAX_PRIORITAIRES_PAR_GROUPE) {
      return {
        ok: false,
        status: 400,
        error: `Ce groupe a déjà ${MAX_PRIORITAIRES_PAR_GROUPE} engagements prioritaires pour la plénière. Décochez-en un avant d'en ajouter un autre.`,
      };
    }
  }

  const updated = await db.get(
    `UPDATE mandat.engagements
     SET prioritaire_plenaire = $1, prioritaire_note = $2, updated_by = $3
     WHERE id = $4 RETURNING *`,
    [prioritaire, note ?? null, author || null, id]
  );

  await db.run(
    `INSERT INTO mandat.engagement_history (engagement_id, champ, ancienne_valeur, nouvelle_valeur, changed_by)
     VALUES ($1, 'prioritaire_plenaire', $2, $3, $4)`,
    [id, String(engagement.prioritaire_plenaire), String(prioritaire), author || null]
  );

  return { ok: true, engagement: updated };
}

module.exports = { list, getById, update, setPrioritaire, EDITABLE_FIELDS, MAX_PRIORITAIRES_PAR_GROUPE };
