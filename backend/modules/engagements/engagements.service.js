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
  'groupe_id',
  'meteo_code',
];

const MAX_PRIORITAIRES_PAR_GROUPE = 3;

function buildFilters({ groupe_id, etat_code, meteo_code, axe, prioritaire, q }) {
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
  if (meteo_code) {
    if (meteo_code === 'none') {
      clauses.push('e.meteo_code IS NULL');
    } else {
      params.push(meteo_code);
      clauses.push(`e.meteo_code = $${params.length}`);
    }
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
            et.libelle AS etat_libelle, et.couleur AS etat_couleur, et.ordre AS etat_ordre,
            m.libelle AS meteo_libelle, m.emoji AS meteo_emoji, m.couleur AS meteo_couleur
     FROM engagements e
     LEFT JOIN groupes g ON g.id = e.groupe_id
     LEFT JOIN etats et ON et.code = e.etat_code
     LEFT JOIN meteos m ON m.code = e.meteo_code
     ${where}
     ORDER BY e.numero ASC`,
    params
  );
}

/** Casse, espaces superflus et accents neutralisés pour comparer deux noms
 * de direction dont l'orthographe peut différer légèrement entre l'AD (pas
 * toujours accentué) et le Hub DSI (accentué) sans être de vrais doublons. */
function normalizeForMatch(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .replace(/\s+/g, ' ');
}

/**
 * Résout le nom brut d'une direction (tel que renvoyé par l'AD/l'APM, ou
 * saisi manuellement) vers ses sigles applicatifs, via la table de
 * concordance — comparaison insensible à la casse, aux espaces superflus et
 * aux accents (l'AD ne les saisit pas toujours). Une même direction peut
 * avoir été saisie sous plusieurs sigles distincts dans l'Excel source
 * (ex. DSPORT, DSPORTS, Dsports, SPORT tous concordés vers le même
 * libellé) : on renvoie donc TOUS les codes qui concordent, pas seulement
 * le premier trouvé, pour ne perdre aucun engagement. Renvoie un tableau
 * vide si aucune correspondance (direction non encore répertoriée dans la
 * concordance).
 */
async function resolveDirectionCodes(rawDirectionName) {
  if (!rawDirectionName || !rawDirectionName.trim()) return [];
  const target = normalizeForMatch(rawDirectionName);
  const rows = await db.all(`SELECT code, libelle FROM directions WHERE libelle IS NOT NULL`);
  return rows.filter((d) => normalizeForMatch(d.libelle) === target).map((d) => d.code);
}

/**
 * Engagements où l'un des sigles donnés apparaît en pilotage, en
 * contribution à l'élaboration, ou en direction/fonction ressource
 * impactée — chaque ligne est taguée pour indiquer dans quel(s) rôle(s) la
 * direction est concernée. Chaque sigle est recherché comme "mot" isolé
 * (bornes non alphanumériques), pour éviter qu'un sigle court ne matche un
 * sigle plus long qui le contient.
 */
async function mine(directionCodes) {
  const codes = Array.isArray(directionCodes) ? directionCodes : [directionCodes];
  if (!codes.length) return [];
  const alternatives = codes.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = `(^|[^A-Za-z0-9])(${alternatives})([^A-Za-z0-9]|$)`;
  return db.all(
    `SELECT e.*, g.code AS groupe_code, g.nom AS groupe_nom,
            et.libelle AS etat_libelle, et.couleur AS etat_couleur,
            m.libelle AS meteo_libelle, m.emoji AS meteo_emoji, m.couleur AS meteo_couleur,
            (e.pilotage ~* $1) AS est_pilote,
            (e.contribution_elaboration ~* $1) AS est_contributeur,
            (e.contribution_impactees ~* $1) AS est_ressource
     FROM engagements e
     LEFT JOIN groupes g ON g.id = e.groupe_id
     LEFT JOIN etats et ON et.code = e.etat_code
     LEFT JOIN meteos m ON m.code = e.meteo_code
     WHERE e.pilotage ~* $1 OR e.contribution_elaboration ~* $1 OR e.contribution_impactees ~* $1
     ORDER BY e.numero ASC`,
    [pattern]
  );
}

async function getById(id) {
  const engagement = await db.get(
    `SELECT e.*, g.code AS groupe_code, g.nom AS groupe_nom,
            et.libelle AS etat_libelle, et.couleur AS etat_couleur,
            m.libelle AS meteo_libelle, m.emoji AS meteo_emoji, m.couleur AS meteo_couleur
     FROM engagements e
     LEFT JOIN groupes g ON g.id = e.groupe_id
     LEFT JOIN etats et ON et.code = e.etat_code
     LEFT JOIN meteos m ON m.code = e.meteo_code
     WHERE e.id = $1`,
    [id]
  );
  if (!engagement) return null;

  const [history, comments, coordinationTopics, roles, steps, attachments] = await Promise.all([
    db.all(
      `SELECT * FROM engagement_history WHERE engagement_id = $1 ORDER BY changed_at DESC`,
      [id]
    ),
    db.all(`SELECT * FROM comments WHERE engagement_id = $1 ORDER BY created_at ASC`, [id]),
    db.all(
      `SELECT t.* FROM coordination_topics t
       JOIN coordination_topic_engagements l ON l.topic_id = t.id
       WHERE l.engagement_id = $1 ORDER BY t.updated_at DESC`,
      [id]
    ),
    db.all(
      `SELECT er.*, r.libelle AS role_libelle FROM engagement_roles er
       JOIN roles r ON r.id = er.role_id
       WHERE er.engagement_id = $1 ORDER BY er.created_at ASC`,
      [id]
    ),
    db.all(
      `SELECT * FROM engagement_steps WHERE engagement_id = $1 ORDER BY date_etape ASC NULLS LAST, created_at ASC`,
      [id]
    ),
    db.all(
      `SELECT id, engagement_id, original_name, mime_type, size_bytes, uploaded_by, created_at
       FROM engagement_attachments WHERE engagement_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [id]
    ),
  ]);

  return { ...engagement, history, comments, coordinationTopics, roles, steps, attachments };
}

async function update(id, patch, author) {
  const current = await db.get(`SELECT * FROM engagements WHERE id = $1`, [id]);
  if (!current) return { ok: false, status: 404, error: 'Engagement introuvable' };

  const fields = Object.keys(patch).filter((k) => EDITABLE_FIELDS.includes(k));
  if (!fields.length) return { ok: false, status: 400, error: 'Aucun champ modifiable fourni' };

  const setClauses = [];
  const params = [];
  const historyEntries = [];

  for (const field of fields) {
    // Une chaîne vide venant d'un champ texte non renseigné équivaut à
    // l'absence de valeur : on normalise pour ne pas polluer l'historique
    // à chaque sauvegarde d'un champ resté vide.
    const newValue = patch[field] === '' ? null : patch[field];
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
    `UPDATE engagements SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  for (const entry of historyEntries) {
    await db.run(
      `INSERT INTO engagement_history (engagement_id, champ, ancienne_valeur, nouvelle_valeur, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, entry.field, entry.oldValue ?? null, entry.newValue ?? null, author || null]
    );
  }

  return { ok: true, engagement: updated };
}

async function setPrioritaire(id, prioritaire, note, author) {
  const engagement = await db.get(`SELECT * FROM engagements WHERE id = $1`, [id]);
  if (!engagement) return { ok: false, status: 404, error: 'Engagement introuvable' };

  if (prioritaire && !engagement.prioritaire_plenaire) {
    if (!engagement.groupe_id) {
      return { ok: false, status: 400, error: "Cet engagement n'appartient à aucun groupe" };
    }
    const { count } = await db.get(
      `SELECT COUNT(*)::int AS count FROM engagements
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
    `UPDATE engagements
     SET prioritaire_plenaire = $1, prioritaire_note = $2, updated_by = $3
     WHERE id = $4 RETURNING *`,
    [prioritaire, note ?? null, author || null, id]
  );

  await db.run(
    `INSERT INTO engagement_history (engagement_id, champ, ancienne_valeur, nouvelle_valeur, changed_by)
     VALUES ($1, 'prioritaire_plenaire', $2, $3, $4)`,
    [id, String(engagement.prioritaire_plenaire), String(prioritaire), author || null]
  );

  return { ok: true, engagement: updated };
}

module.exports = {
  list,
  getById,
  update,
  setPrioritaire,
  resolveDirectionCodes,
  mine,
  EDITABLE_FIELDS,
  MAX_PRIORITAIRES_PAR_GROUPE,
};
