// REX Canicule — logique partagée : résolution de la direction d'un agent,
// rapprochement avec les textes de pilotage libres, journal des modifications,
// calcul de la synthèse (cf. migrations/026_rex_canicule.sql).
const { db } = require('../../db/pg_db');
const engagementsService = require('../engagements/engagements.service');

// Date à laquelle tout doit être prêt : « avant les périodes chaudes (mai) ».
const SAISON_CIBLE = process.env.REX_DATE_CIBLE || '2027-05-01';

const TABLES = { thematique: 'rex_thematiques', sujet: 'rex_sujets', action: 'rex_actions', reflexe: 'rex_reflexes' };
const LABEL_COL = { thematique: 'titre', sujet: 'libelle', action: 'titre', reflexe: 'titre' };

// Sigles écrits différemment selon les documents (engagements, c/r canicule…).
const ALIASES = { DSPORT: ['DSPORT', 'DSPORTS'], DSPORTS: ['DSPORT', 'DSPORTS'], DCOM: ['DCOM', 'DIRCOM'], DIRCOM: ['DCOM', 'DIRCOM'] };

const actor = (req) => req.user.displayName || req.user.sub;

function expandCodes(codes) {
  const out = new Set();
  for (const c of codes) {
    out.add(c);
    for (const a of ALIASES[String(c).toUpperCase()] || []) out.add(a);
  }
  return [...out];
}

/** Sigles de direction de l'agent (ou de ?direction=… pour un admin sans direction). */
async function directionCodes(user, explicit) {
  const raw = explicit || user.direction;
  if (!raw) return [];
  try {
    return expandCodes(await engagementsService.resolveDirectionCodes(raw));
  } catch {
    return [];
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** true si l'un des sigles apparaît comme « mot » isolé dans un texte de pilotage libre. */
function matchesCodes(text, codes) {
  if (!text || !codes.length) return false;
  const re = new RegExp(`(^|[^A-Za-z0-9])(${codes.map(escapeRe).join('|')})([^A-Za-z0-9]|$)`, 'i');
  return re.test(text);
}

/** Libellé court stocké avec une prise de position / un commentaire : sigle résolu, à défaut texte brut. */
async function directionTag(user) {
  const codes = await directionCodes(user);
  if (codes.length) return codes[0];
  return user.direction || null;
}

/** Date « AAAA-MM-JJ » en heure locale : pg renvoie les colonnes DATE en Date locale (minuit), toISOString() décalerait d'un jour. */
function ymd(d) {
  if (!d) return null;
  if (!(d instanceof Date)) return String(d).slice(0, 10);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function stringify(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return ymd(v);
  return String(v);
}

/** Enregistre dans rex_history les champs réellement modifiés. */
async function logChanges(type, id, before, after, fields, by) {
  for (const f of fields) {
    const a = stringify(before?.[f]);
    const b = stringify(after?.[f]);
    if ((a || '') === (b || '')) continue;
    await db.run(
      `INSERT INTO rex_history (cible_type, cible_id, champ, ancienne_valeur, nouvelle_valeur, changed_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, id, f, a, b, by]
    );
  }
}

async function logEvent(type, id, champ, valeur, by) {
  await db.run(
    `INSERT INTO rex_history (cible_type, cible_id, champ, nouvelle_valeur, changed_by) VALUES ($1, $2, $3, $4, $5)`,
    [type, id, champ, valeur, by]
  );
}

/** Retient uniquement les clés autorisées ; '' devient null. */
function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (body[f] === undefined) continue;
    out[f] = typeof body[f] === 'string' ? body[f].trim() || null : body[f];
  }
  return out;
}

/** UPDATE dynamique limité aux champs fournis. Retourne la ligne mise à jour. */
async function updateFields(table, id, values, by) {
  const keys = Object.keys(values);
  if (!keys.length) return db.get(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const params = [...keys.map((k) => values[k]), by, id];
  return db.get(
    `UPDATE ${table} SET ${sets.join(', ')}, updated_by = $${keys.length + 1} WHERE id = $${keys.length + 2} RETURNING *`,
    params
  );
}

async function exists(type, id) {
  const table = TABLES[type];
  if (!table || !Number.isInteger(Number(id))) return false;
  return !!(await db.get(`SELECT 1 AS ok FROM ${table} WHERE id = $1`, [id]));
}

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/** Résumé des positions d'une cible : compte par position + sigles ayant répondu. */
function summarizePositions(rows, user) {
  const s = { accord: 0, reserve: 0, desaccord: 0, total: 0, directions: [], mine: null };
  const dirs = new Set();
  for (const r of rows) {
    s[r.position] += 1;
    s.total += 1;
    if (r.direction) dirs.add(r.direction);
    if (user && r.user_sub === user.sub) s.mine = { position: r.position, commentaire: r.commentaire };
  }
  s.directions = [...dirs];
  return s;
}

async function engagementsLinks(ownerCol, ids) {
  if (!ids.length) return new Map();
  const rows = await db.all(
    `SELECT l.${ownerCol} AS owner_id, l.motif, e.id, e.numero, e.contenu, e.etat_code, e.pilotage
     FROM rex_engagement_links l JOIN engagements e ON e.id = l.engagement_id
     WHERE l.${ownerCol} = ANY($1::int[]) ORDER BY e.numero`,
    [ids]
  );
  return groupBy(rows, 'owner_id');
}

async function setLinks(ownerCol, ownerId, items, by) {
  const wanted = (items || [])
    .map((i) => (typeof i === 'number' ? { engagement_id: i } : i))
    .filter((i) => i && Number.isInteger(Number(i.engagement_id)));
  await db.run(`DELETE FROM rex_engagement_links WHERE ${ownerCol} = $1`, [ownerId]);
  for (const it of wanted) {
    await db
      .run(
        `INSERT INTO rex_engagement_links (${ownerCol}, engagement_id, motif, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [ownerId, Number(it.engagement_id), (it.motif || '').trim() || null, by]
      )
      .catch(() => {}); // engagement inexistant : on ignore plutôt que d'échouer pour tout le lot
  }
}

async function labels(type, ids) {
  if (!ids.length) return new Map();
  const rows = await db.all(`SELECT id, ${LABEL_COL[type]} AS label FROM ${TABLES[type]} WHERE id = ANY($1::int[])`, [ids]);
  return new Map(rows.map((r) => [r.id, r.label]));
}

const CHAMP_LABEL = {
  libelle: 'le libellé', constat: 'le constat', a_fonctionne: '« ce qui a fonctionné »', a_ameliorer: '« à améliorer »',
  mesures: 'les mesures 2027', pilotage: 'le pilotage', decision: 'la décision', statut: 'le statut', titre: 'le titre',
  description: 'la description', pilote_direction: 'la direction pilote', pilote_nom: 'le/la pilote', echeance: "l'échéance",
  echeance_texte: "l'échéance (texte)", priorite: 'la priorité', responsable: 'le responsable', delai: 'le délai', moment: 'le moment',
};

/** Fil d'activité récent (modifications, positions, commentaires — hors c/r importé). */
async function recentActivity(limit = 20) {
  const [hist, coms] = await Promise.all([
    db.all(`SELECT * FROM rex_history ORDER BY changed_at DESC, id DESC LIMIT $1`, [limit]),
    db.all(`SELECT * FROM rex_comments WHERE is_cr = false ORDER BY created_at DESC LIMIT $1`, [limit]),
  ]);
  const events = [
    ...hist.map((h) => ({ kind: 'history', at: h.changed_at, by: h.changed_by, type: h.cible_type, id: h.cible_id, champ: h.champ, valeur: h.nouvelle_valeur })),
    ...coms.map((c) => ({ kind: 'comment', at: c.created_at, by: c.author_name, direction: c.author_direction, type: c.cible_type, id: c.cible_id, valeur: c.body })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
  for (const type of Object.keys(TABLES)) {
    const ids = [...new Set(events.filter((e) => e.type === type).map((e) => e.id))];
    const map = await labels(type, ids);
    for (const e of events) if (e.type === type) e.cible_label = map.get(e.id) || null;
  }
  // Rattache chaque cible à son sujet (pour le lien depuis le fil) quand c'est utile.
  return events.map((e) => ({ ...e, champ_label: e.champ ? CHAMP_LABEL[e.champ] || e.champ : null }));
}

module.exports = {
  ymd,
  SAISON_CIBLE,
  TABLES,
  actor,
  expandCodes,
  directionCodes,
  matchesCodes,
  directionTag,
  logChanges,
  logEvent,
  pick,
  updateFields,
  exists,
  groupBy,
  summarizePositions,
  engagementsLinks,
  setLinks,
  recentActivity,
};
