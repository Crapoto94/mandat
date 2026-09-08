const { db, pool } = require('../../db/pg_db');

// Colonnes que l'on autorise à modifier via PATCH — tout le reste (numero,
// dates système...) est en lecture seule côté API.
const EDITABLE_FIELDS = [
  'axe',
  'contenu',
  'pilotage',
  'contribution_elaboration',
  'contribution_impactees',
  'echeance',
  'continu',
  'etat_code',
  'description_avancement',
  'prochaines_etapes',
  'roles_precises',
  'groupe_id',
  'meteo_code',
];

const MAX_PRIORITAIRES_PAR_GROUPE = 3;

// "Dernière activité" d'un engagement : la plus récente entre sa propre
// dernière modification (updated_at, maintenu par trigger) et l'activité
// sur ses tables liées (commentaires, étapes, pièces jointes non
// supprimées) — sinon un nouveau commentaire ou une nouvelle étape
// n'apparaîtrait jamais comme une "nouveauté". Utilisé à la fois pour le
// filtre "nouveautés" de la liste et pour le récapitulatif quotidien des
// alertes (cf. jobs/alertsDigest.js).
const DERNIERE_ACTIVITE_EXPR = `GREATEST(
  e.updated_at,
  COALESCE((SELECT MAX(c.created_at) FROM comments c WHERE c.engagement_id = e.id), e.updated_at),
  COALESCE((SELECT MAX(GREATEST(s.created_at, s.updated_at)) FROM engagement_steps s WHERE s.engagement_id = e.id), e.updated_at),
  COALESCE((SELECT MAX(a.created_at) FROM engagement_attachments a WHERE a.engagement_id = e.id AND a.deleted_at IS NULL), e.updated_at)
)`;

// "Aujourd'hui" = depuis minuit ; "cette semaine"/"ce mois" = fenêtres
// glissantes (7 / 30 derniers jours), pas le calendrier civil (donc pas de
// saut à zéro chaque lundi ou le 1er du mois).
const NOUVEAUTES_THRESHOLDS = {
  today: `date_trunc('day', now())`,
  week: `now() - interval '7 days'`,
  month: `now() - interval '30 days'`,
};

/** Motif regex "mot isolé" (bornes non alphanumériques) pour un ou plusieurs
 * sigles en alternative — partagé entre le filtre par direction de la liste
 * des engagements et `mine()`, pour ne jamais faire matcher un sigle court
 * comme sous-chaîne d'un sigle plus long. */
function codesToWordPattern(codes) {
  const alternatives = codes.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return `(^|[^A-Za-z0-9])(${alternatives})([^A-Za-z0-9]|$)`;
}

function buildFilters({ groupe_id, etat_code, meteo_code, axe, prioritaire, q, nouveautes, directionCodes }) {
  const clauses = [];
  const params = [];

  if (directionCodes !== undefined) {
    if (!directionCodes.length) {
      // Direction demandée mais non concordée : aucun engagement ne peut correspondre.
      clauses.push('FALSE');
    } else {
      params.push(codesToWordPattern(directionCodes));
      const p = `$${params.length}`;
      clauses.push(`(e.pilotage ~* ${p} OR e.contribution_elaboration ~* ${p} OR e.contribution_impactees ~* ${p})`);
    }
  }
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
  if (nouveautes && NOUVEAUTES_THRESHOLDS[nouveautes]) {
    clauses.push(`${DERNIERE_ACTIVITE_EXPR} >= ${NOUVEAUTES_THRESHOLDS[nouveautes]}`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function list({ direction, userSub, isAdmin, ...filters } = {}) {
  const directionCodes = direction ? await resolveDirectionCodes(direction) : undefined;
  const { where, params } = buildFilters({ ...filters, directionCodes });
  const rows = await db.all(
    `SELECT e.*, g.code AS groupe_code, g.nom AS groupe_nom,
            et.libelle AS etat_libelle, et.couleur AS etat_couleur, et.ordre AS etat_ordre,
            ${DERNIERE_ACTIVITE_EXPR} AS derniere_activite,
            m.libelle AS meteo_libelle, m.emoji AS meteo_emoji, m.couleur AS meteo_couleur,
            (SELECT COUNT(*)::int FROM projets p WHERE p.engagement_id = e.id) AS projets_count
     FROM engagements e
     LEFT JOIN groupes g ON g.id = e.groupe_id
     LEFT JOIN etats et ON et.code = e.etat_code
     LEFT JOIN meteos m ON m.code = e.meteo_code
     ${where}
     ORDER BY e.numero ASC`,
    params
  );

  // Aperçu des noms de projets liés — filtré aux projets visibles par le
  // demandeur (membre, ou tout si admin), cohérent avec l'accès réservé aux
  // membres sur les projets : le compte (projets_count) est public, les
  // noms individuels ne le sont pas pour un non-membre.
  const withProjets = rows.filter((r) => r.projets_count > 0);
  if (withProjets.length) {
    const ids = withProjets.map((r) => r.id);
    const projetRows = isAdmin
      ? await db.all(`SELECT id, nom, engagement_id FROM projets WHERE engagement_id = ANY($1)`, [ids])
      : await db.all(
          `SELECT p.id, p.nom, p.engagement_id FROM projets p
           WHERE p.engagement_id = ANY($1)
             AND EXISTS (SELECT 1 FROM projet_membres pm WHERE pm.projet_id = p.id AND pm.user_sub = $2)`,
          [ids, userSub || null]
        );
    const byEngagement = new Map();
    for (const p of projetRows) {
      if (!byEngagement.has(p.engagement_id)) byEngagement.set(p.engagement_id, []);
      byEngagement.get(p.engagement_id).push({ id: p.id, nom: p.nom });
    }
    for (const r of rows) r.projets_apercu = byEngagement.get(r.id) || [];
  } else {
    for (const r of rows) r.projets_apercu = [];
  }

  return rows;
}

/** Effectifs par période "nouveautés" (pastille sur les boutons du filtre) —
 * mêmes filtres que list() (hors nouveautes lui-même, qui n'a pas de sens à
 * combiner avec soi-même), pour rester cohérent avec le reste de l'écran :
 * si l'utilisateur filtre déjà par groupe/axe/etc., les compteurs reflètent
 * ce sous-ensemble plutôt que la totalité des engagements. */
async function nouveautesCounts({ direction, nouveautes, ...filters } = {}) {
  const directionCodes = direction ? await resolveDirectionCodes(direction) : undefined;
  const { where, params } = buildFilters({ ...filters, directionCodes });
  const row = await db.get(
    `SELECT
       COUNT(*) FILTER (WHERE ${DERNIERE_ACTIVITE_EXPR} >= ${NOUVEAUTES_THRESHOLDS.today}) AS today,
       COUNT(*) FILTER (WHERE ${DERNIERE_ACTIVITE_EXPR} >= ${NOUVEAUTES_THRESHOLDS.week}) AS week,
       COUNT(*) FILTER (WHERE ${DERNIERE_ACTIVITE_EXPR} >= ${NOUVEAUTES_THRESHOLDS.month}) AS month
     FROM engagements e
     ${where}`,
    params
  );
  return { today: Number(row.today), week: Number(row.week), month: Number(row.month) };
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
 * L'AD renvoie le rattachement de l'agent tel que saisi côté RH, qui est
 * parfois son SERVICE (ex. "Service Budget Comptabilité") plutôt que sa
 * DIRECTION de rattachement (ex. "Direction des Services Financiers") —
 * or les engagements ne sont suivis qu'au niveau direction. On remonte
 * alors la hiérarchie Hub DSI mise en cache (`hubdsi_referentiel` :
 * DGA > direction > service > secteur, via `parent_code`) d'un niveau à
 * l'autre jusqu'à retomber sur un libellé déjà répertorié dans la table de
 * concordance des directions (`directionLibelles`, déjà normalisés). Si le
 * nom brut n'est pas dans le référentiel Hub DSI, ou si aucun ancêtre ne
 * correspond à une direction connue, renvoie le nom brut tel quel (inchangé
 * — resolveDirectionCodes retombera sur le comportement "non concordé").
 */
async function climbToKnownDirection(rawName, directionLibelles) {
  const hubRows = await db.all(`SELECT code, libelle, parent_code FROM hubdsi_referentiel`);
  if (!hubRows.length) return rawName;
  const byCode = new Map(hubRows.map((r) => [r.code, r]));
  const target = normalizeForMatch(rawName);

  let node = hubRows.find((r) => normalizeForMatch(r.libelle) === target);
  const seen = new Set();
  while (node && !seen.has(node.code)) {
    if (directionLibelles.has(normalizeForMatch(node.libelle))) return node.libelle;
    seen.add(node.code);
    node = node.parent_code ? byCode.get(node.parent_code) : null;
  }
  return rawName;
}

/**
 * Résout le nom brut d'une direction ou d'un service (tel que renvoyé par
 * l'AD/l'APM, ou saisi manuellement) vers ses sigles applicatifs, via la
 * table de concordance — comparaison insensible à la casse, aux espaces
 * superflus et aux accents (l'AD ne les saisit pas toujours). Deux cas :
 *  - le nom brut correspond déjà à une direction connue ;
 *  - sinon, c'est peut-être un service : on remonte vers sa direction de
 *    rattachement via la hiérarchie Hub DSI (cf. climbToKnownDirection).
 * Une même direction peut en outre avoir été saisie sous plusieurs sigles
 * distincts dans l'Excel source (ex. DSPORT, DSPORTS, Dsports, SPORT tous
 * concordés vers le même libellé) : on renvoie donc TOUS les codes qui
 * concordent avec ce libellé, pas seulement le premier trouvé, pour ne
 * perdre aucun engagement. Renvoie un tableau vide si aucune correspondance
 * (direction non encore répertoriée dans la concordance).
 */
async function resolveDirectionCodes(rawDirectionName) {
  if (!rawDirectionName || !rawDirectionName.trim()) return [];
  const rows = await db.all(`SELECT code, libelle FROM directions WHERE libelle IS NOT NULL`);
  const directionLibelles = new Set(rows.map((d) => normalizeForMatch(d.libelle)));

  let target = normalizeForMatch(rawDirectionName);
  if (!directionLibelles.has(target)) {
    const climbed = await climbToKnownDirection(rawDirectionName, directionLibelles);
    target = normalizeForMatch(climbed);
  }

  return [...new Set(rows.filter((d) => normalizeForMatch(d.libelle) === target).map((d) => d.code))];
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
  const pattern = codesToWordPattern(codes);
  return db.all(
    `SELECT e.*, g.code AS groupe_code, g.nom AS groupe_nom,
            et.libelle AS etat_libelle, et.couleur AS etat_couleur,
            m.libelle AS meteo_libelle, m.emoji AS meteo_emoji, m.couleur AS meteo_couleur,
            (e.pilotage ~* $1) AS est_pilote,
            (e.contribution_elaboration ~* $1) AS est_contributeur,
            (e.contribution_impactees ~* $1) AS est_ressource,
            (SELECT s.date_etape FROM engagement_steps s
             WHERE s.engagement_id = e.id AND (s.date_etape IS NULL OR s.date_etape >= CURRENT_DATE)
             ORDER BY s.date_etape ASC NULLS LAST, s.created_at ASC LIMIT 1) AS prochaine_etape_date,
            (SELECT s.description FROM engagement_steps s
             WHERE s.engagement_id = e.id AND (s.date_etape IS NULL OR s.date_etape >= CURRENT_DATE)
             ORDER BY s.date_etape ASC NULLS LAST, s.created_at ASC LIMIT 1) AS prochaine_etape_description
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

  const [history, comments, coordinationTopics, roles, steps, attachments, fieldProposals] = await Promise.all([
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
    db.all(
      `SELECT * FROM field_proposals WHERE engagement_id = $1 AND statut = 'en_attente' ORDER BY created_at ASC`,
      [id]
    ),
  ]);

  return { ...engagement, history, comments, coordinationTopics, roles, steps, attachments, fieldProposals };
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

/**
 * Uniformise, dans le texte libre des engagements (pilotage, contribution à
 * l'élaboration, directions/ressources impactées), toutes les variantes
 * orthographiques d'un même sigle vers une écriture canonique unique (ex.
 * DSPORT / SPORT / Dsports → DSPORTS), puis nettoie la table de concordance
 * en conséquence : les sigles alias, devenus obsolètes une fois le texte
 * réécrit, sont supprimés ; le libellé (nom complet), s'il avait été saisi
 * manuellement sur l'un des alias, est repris sur le sigle canonique s'il
 * n'en avait pas déjà un.
 *
 * Chaque alias est recherché en tant que "mot" isolé (ou expression, s'il
 * contient un espace), insensible à la casse et aux accents, via des
 * lookarounds à largeur nulle (`(?<!...)`/`(?!...)`, supportés par le moteur
 * de regex de Postgres) — contrairement aux groupes capturants utilisés
 * ailleurs (cf. codesToWordPattern), ceci ne "consomme" aucun caractère de
 * bordure, donc deux occurrences adjacentes (ex. "DSPORT,SPORT") sont
 * remplacées correctement l'une comme l'autre.
 *
 * `mapping` : [{ canonical: 'DSPORTS', aliases: ['DSPORT', 'SPORT', 'Dsports'] }, ...]
 * Toute l'opération est transactionnelle (tout ou rien).
 */
async function mergeDirectionAliases(mapping) {
  const client = await pool.connect();
  const summary = [];
  try {
    await client.query('BEGIN');

    for (const { canonical, aliases: rawAliases } of mapping) {
      const aliases = [...new Set(rawAliases)].filter((a) => a !== canonical);
      let occurrencesRenamed = 0;

      for (const alias of aliases) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`;
        for (const column of ['pilotage', 'contribution_elaboration', 'contribution_impactees']) {
          const result = await client.query(
            `UPDATE engagements SET ${column} = regexp_replace(${column}, $1, $2, 'gi')
             WHERE ${column} ~* $1`,
            [pattern, canonical]
          );
          occurrencesRenamed += result.rowCount;
        }
      }

      const codesToLookup = [canonical, ...aliases];
      const { rows: existingRows } = await client.query(
        `SELECT code, libelle, libelle_manuel FROM directions WHERE code = ANY($1)`,
        [codesToLookup]
      );
      const canonicalRow = existingRows.find((r) => r.code === canonical);
      const manualAlias = existingRows.find((r) => r.code !== canonical && r.libelle_manuel);

      if (!canonicalRow) {
        await client.query(
          `INSERT INTO directions (code, libelle, libelle_manuel) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
          [canonical, manualAlias?.libelle || canonical, !!manualAlias]
        );
      } else if (!canonicalRow.libelle_manuel && manualAlias) {
        await client.query(
          `UPDATE directions SET libelle = $1, libelle_manuel = true, updated_at = now() WHERE code = $2`,
          [manualAlias.libelle, canonical]
        );
      }

      if (aliases.length) {
        await client.query(`DELETE FROM directions WHERE code = ANY($1)`, [aliases]);
      }

      summary.push({ canonical, aliases, occurrencesRenamed });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return summary;
}

// Sigles à écriture non uniforme repérés dans l'Excel source — même direction
// saisie sous plusieurs graphies au fil des mises à jour successives du
// fichier de suivi. Liste figée manuellement (pas d'heuristique fiable pour
// détecter des quasi-doublons sans faux positifs) ; à compléter au fil de
// l'eau si d'autres variantes sont repérées.
const KNOWN_DIRECTION_ALIASES = [
  { canonical: 'CCAS', aliases: ['DCCAS'] },
  { canonical: 'DJEUN', aliases: ['DJ', 'JEUNESSE', 'Jeunesse'] },
  { canonical: 'DSPORTS', aliases: ['DSPORT', 'SPORT', 'Dsports'] },
  { canonical: 'VACANCES', aliases: ['Vacances'] },
  { canonical: 'DSANTE', aliases: ['SANTE'] },
  { canonical: 'POLE FAMILLE', aliases: ['Pôle familles'] },
];

async function normalizeKnownDirectionAliases() {
  return mergeDirectionAliases(KNOWN_DIRECTION_ALIASES);
}

module.exports = {
  list,
  getById,
  update,
  setPrioritaire,
  resolveDirectionCodes,
  mine,
  mergeDirectionAliases,
  normalizeKnownDirectionAliases,
  EDITABLE_FIELDS,
  MAX_PRIORITAIRES_PAR_GROUPE,
  DERNIERE_ACTIVITE_EXPR,
  nouveautesCounts,
};
