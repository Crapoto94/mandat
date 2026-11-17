// REX Canicule — retour d'expérience collaboratif (cf. migrations/026_rex_canicule.sql).
// Tout agent connecté peut consulter et contribuer (sujets, actions, réflexes,
// positions, commentaires) : c'est un outil de travail CODIR, chaque
// modification est tracée dans rex_history. La suppression est réservée à
// l'auteur de l'élément et aux admins.
const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');
const s = require('./rex.service');

const router = express.Router();
router.use(requireAuth);

// Les colonnes DATE sortent de pg en Date locale (minuit) : sérialisées en JSON
// (UTC) elles reculeraient d'un jour. On les renvoie toujours en « AAAA-MM-JJ ».
const DATE_KEYS = new Set(['echeance', 'date_realisation']);
function fixDates(v) {
  if (Array.isArray(v)) return v.map(fixDates);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = DATE_KEYS.has(k) && val instanceof Date ? s.ymd(val) : fixDates(val);
    return out;
  }
  return v;
}
router.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => json(fixDates(body));
  next();
});

const isAdmin = (req) => req.user.role === 'admin';
const canDelete = (req, row) => isAdmin(req) || (row.created_by && row.created_by === s.actor(req));

const SUJET_FIELDS = ['libelle', 'constat', 'a_fonctionne', 'a_ameliorer', 'mesures', 'pilotage', 'decision', 'statut', 'thematique_id'];
const SUJET_STATUTS = ['a_discuter', 'a_arbitrer', 'valide', 'en_oeuvre', 'realise'];
const ACTION_FIELDS = ['titre', 'description', 'pilote_direction', 'pilote_nom', 'pilote_sub', 'echeance', 'echeance_texte', 'statut', 'priorite', 'sujet_id'];
const ACTION_STATUTS = ['a_faire', 'en_cours', 'fait', 'abandonne'];
const REFLEXE_FIELDS = ['moment', 'titre', 'description', 'responsable', 'delai', 'statut', 'sujet_id'];
const MOMENTS = ['preparation', 'veille', 'orange', 'rouge', 'apres'];
const REFLEXE_STATUTS = ['propose', 'valide', 'a_revoir'];
const TYPE_BY_PLURAL = { sujets: 'sujet', actions: 'action', reflexes: 'reflexe' };

const canon = (c) => ({ DSPORTS: 'DSPORT', DIRCOM: 'DCOM' }[String(c).toUpperCase()] || String(c).toUpperCase());

function validEnum(value, list, label) {
  if (value === undefined || value === null) return null;
  return list.includes(value) ? null : `${label} invalide`;
}

function cleanDate(v) {
  if (v === undefined) return undefined;
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

// ---------------------------------------------------------------- lectures

/** Thématiques > sujets, avec compteurs, liens vers le mandat et positions résumées. */
async function loadThematiques(user) {
  const [thematiques, sujets, actions, comments, positions] = await Promise.all([
    db.all(`SELECT * FROM rex_thematiques ORDER BY partie, ordre, id`),
    db.all(`SELECT * FROM rex_sujets ORDER BY ordre, id`),
    db.all(`SELECT id, sujet_id, statut FROM rex_actions WHERE sujet_id IS NOT NULL`),
    db.all(`SELECT cible_type, cible_id, is_cr FROM rex_comments WHERE cible_type IN ('sujet', 'thematique')`),
    db.all(`SELECT * FROM rex_positions WHERE cible_type = 'sujet'`),
  ]);
  const links = await s.engagementsLinks('sujet_id', sujets.map((x) => x.id));
  const actionsBy = s.groupBy(actions, 'sujet_id');
  const posBy = s.groupBy(positions, 'cible_id');
  const comSujet = s.groupBy(comments.filter((c) => c.cible_type === 'sujet'), 'cible_id');
  const comThem = s.groupBy(comments.filter((c) => c.cible_type === 'thematique'), 'cible_id');
  const sujetsBy = s.groupBy(sujets, 'thematique_id');

  return thematiques.map((t) => ({
    ...t,
    observations_cr: (comThem.get(t.id) || []).length,
    sujets: (sujetsBy.get(t.id) || []).map((x) => {
      const acts = actionsBy.get(x.id) || [];
      const manque = [];
      if (!x.pilotage) manque.push('pilotage');
      if (!x.mesures) manque.push('mesures');
      return {
        ...x,
        engagements: links.get(x.id) || [],
        actions_total: acts.length,
        actions_faites: acts.filter((a) => a.statut === 'fait').length,
        commentaires: (comSujet.get(x.id) || []).length,
        positions: s.summarizePositions(posBy.get(x.id) || [], user),
        a_completer: manque,
      };
    }),
  }));
}

async function loadActions(user, filters = {}) {
  const where = [];
  const params = [];
  if (filters.statut) { params.push(filters.statut); where.push(`a.statut = $${params.length}`); }
  if (filters.sujet_id) { params.push(Number(filters.sujet_id)); where.push(`a.sujet_id = $${params.length}`); }
  if (filters.engagement_id) {
    params.push(Number(filters.engagement_id));
    where.push(`EXISTS (SELECT 1 FROM rex_engagement_links l WHERE l.action_id = a.id AND l.engagement_id = $${params.length})`);
  }
  const rows = await db.all(
    `SELECT a.*, su.libelle AS sujet_libelle, t.titre AS thematique_titre, t.partie,
            (SELECT count(*)::int FROM rex_comments c WHERE c.cible_type = 'action' AND c.cible_id = a.id) AS commentaires
     FROM rex_actions a
     LEFT JOIN rex_sujets su ON su.id = a.sujet_id
     LEFT JOIN rex_thematiques t ON t.id = su.thematique_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY (a.statut IN ('fait', 'abandonne')), a.echeance NULLS LAST, a.id`,
    params
  );
  const links = await s.engagementsLinks('action_id', rows.map((r) => r.id));
  const positions = rows.length ? await db.all(`SELECT * FROM rex_positions WHERE cible_type = 'action'`) : [];
  const posBy = s.groupBy(positions, 'cible_id');
  const today = s.ymd(new Date());
  return rows.map((r) => ({
    ...r,
    echeance: s.ymd(r.echeance),
    en_retard: !!r.echeance && ['a_faire', 'en_cours'].includes(r.statut) && s.ymd(r.echeance) < today,
    engagements: links.get(r.id) || [],
    positions: s.summarizePositions(posBy.get(r.id) || [], user),
  }));
}

async function loadReflexes(user) {
  const [rows, positions, comments] = await Promise.all([
    db.all(
      `SELECT r.*, su.libelle AS sujet_libelle FROM rex_reflexes r LEFT JOIN rex_sujets su ON su.id = r.sujet_id ORDER BY r.ordre, r.id`
    ),
    db.all(`SELECT * FROM rex_positions WHERE cible_type = 'reflexe' ORDER BY updated_at DESC`),
    db.all(`SELECT cible_id FROM rex_comments WHERE cible_type = 'reflexe'`),
  ]);
  const posBy = s.groupBy(positions, 'cible_id');
  const comBy = s.groupBy(comments, 'cible_id');
  return rows.map((r) => ({
    ...r,
    commentaires: (comBy.get(r.id) || []).length,
    positions: s.summarizePositions(posBy.get(r.id) || [], user),
    positions_detail: (posBy.get(r.id) || []).map((p) => ({
      direction: p.direction, display_name: p.display_name, position: p.position, commentaire: p.commentaire,
    })),
  }));
}

async function codirDirections() {
  const rows = await db.all(`SELECT directions FROM groupes ORDER BY ordre`);
  return [...new Set(rows.flatMap((g) => g.directions || []).map(canon))];
}

/** Ce qu'il reste à faire pour la direction de l'agent (sert à la pastille du menu et au bloc « Pour vous »). */
async function computeMine(user, explicitDirection) {
  const codes = await s.directionCodes(user, explicitDirection);
  const canonCodes = new Set(codes.map(canon));
  const [actions, reflexes, sujets, positions] = await Promise.all([
    db.all(`SELECT a.id, a.titre, a.statut, a.priorite, a.echeance, a.echeance_texte, a.pilote_direction, a.pilote_sub, a.sujet_id, su.libelle AS sujet_libelle
            FROM rex_actions a LEFT JOIN rex_sujets su ON su.id = a.sujet_id WHERE a.statut IN ('a_faire', 'en_cours') ORDER BY a.echeance NULLS LAST`),
    db.all(`SELECT id, titre, moment, responsable, statut FROM rex_reflexes WHERE statut <> 'valide' ORDER BY ordre, id`),
    db.all(`SELECT id, libelle, pilotage, statut FROM rex_sujets WHERE statut IN ('a_discuter', 'a_arbitrer') ORDER BY id`),
    db.all(`SELECT cible_type, cible_id, user_sub, direction FROM rex_positions WHERE cible_type IN ('reflexe', 'sujet')`),
  ]);
  const positionedByMe = (type) =>
    new Set(
      positions
        .filter((p) => p.cible_type === type && (p.user_sub === user.sub || (p.direction && canonCodes.has(canon(p.direction)))))
        .map((p) => p.cible_id)
    );
  const myReflexPos = positionedByMe('reflexe');
  const mySujetPos = positionedByMe('sujet');
  const today = s.ymd(new Date());
  const mineActions = actions
    .filter((a) => a.pilote_sub === user.sub || s.matchesCodes(a.pilote_direction, codes))
    .map((a) => ({ ...a, echeance: s.ymd(a.echeance) }))
    .map((a) => ({ ...a, en_retard: !!a.echeance && a.echeance < today }));
  return {
    direction: explicitDirection || user.direction || null,
    codes: [...canonCodes],
    actions: mineActions,
    reflexes_a_positionner: reflexes.filter((r) => !myReflexPos.has(r.id)),
    sujets_a_traiter: sujets.filter((x) => s.matchesCodes(x.pilotage, codes) && !mySujetPos.has(x.id)),
  };
}

router.get('/overview', async (req, res) => {
  const [thematiques, actions, reflexes, travaux, directions, positions, comments, activite, mine, linksCount] = await Promise.all([
    loadThematiques(req.user),
    db.all(`SELECT id, statut, echeance, pilote_direction, origine, updated_at FROM rex_actions`),
    db.all(`SELECT id, statut, moment FROM rex_reflexes`),
    db.all(`SELECT saison, date_realisation, date_texte, nb_brasseurs, nb_ventilateurs FROM rex_travaux`),
    codirDirections(),
    db.all(`SELECT cible_type, cible_id, direction, user_sub, updated_at FROM rex_positions`),
    db.all(`SELECT author_direction, created_at FROM rex_comments WHERE is_cr = false`),
    s.recentActivity(12),
    computeMine(req.user, req.query.direction),
    db.get(`SELECT count(DISTINCT engagement_id)::int AS n FROM rex_engagement_links`),
  ]);
  const today = s.ymd(new Date());
  const sujets = thematiques.flatMap((t) => t.sujets.map((x) => ({ ...x, partie: t.partie, thematique_titre: t.titre })));

  const sujetsParStatut = Object.fromEntries(['a_discuter', 'a_arbitrer', 'valide', 'en_oeuvre', 'realise'].map((k) => [k, 0]));
  for (const x of sujets) sujetsParStatut[x.statut] += 1;
  const actionsParStatut = Object.fromEntries(['a_faire', 'en_cours', 'fait', 'abandonne'].map((k) => [k, 0]));
  for (const a of actions) actionsParStatut[a.statut] += 1;
  const actives = actions.filter((a) => a.statut !== 'abandonne');
  const enRetard = actions.filter((a) => ['a_faire', 'en_cours'].includes(a.statut) && a.echeance && s.ymd(a.echeance) < today).length;

  const reflexesParMoment = {};
  for (const m of ['preparation', 'veille', 'orange', 'rouge', 'apres']) {
    const list = reflexes.filter((r) => r.moment === m);
    reflexesParMoment[m] = { total: list.length, valides: list.filter((r) => r.statut === 'valide').length };
  }

  // Participation de chaque direction du CODIR : on valorise la contribution, sans classement.
  const lastBy = new Map();
  const touch = (code, at) => {
    if (!code) return;
    const k = canon(code);
    if (!lastBy.has(k) || new Date(at) > new Date(lastBy.get(k))) lastBy.set(k, at);
  };
  const participation = directions.map((code) => {
    const pos = positions.filter((p) => p.direction && canon(p.direction) === code);
    pos.forEach((p) => touch(code, p.updated_at));
    const com = comments.filter((c) => c.author_direction && canon(c.author_direction) === code);
    com.forEach((c) => touch(code, c.created_at));
    const pilote = actives.filter((a) => s.matchesCodes(a.pilote_direction, s.expandCodes([code])));
    return {
      code,
      positions: pos.length,
      reflexes_positionnes: new Set(pos.filter((p) => p.cible_type === 'reflexe').map((p) => p.cible_id)).size,
      commentaires: com.length,
      actions_pilotees: pilote.length,
      actions_faites: pilote.filter((a) => a.statut === 'fait').length,
      derniere_activite: lastBy.get(code) || null,
    };
  });

  const realises = travaux.filter((t) => t.date_realisation && s.ymd(t.date_realisation) <= today).length;
  const cible = new Date(s.SAISON_CIBLE + 'T00:00:00');
  res.json({
    saison_cible: s.SAISON_CIBLE,
    jours_restants: Math.ceil((cible - new Date(today + 'T00:00:00')) / 86400000),
    sujets: { total: sujets.length, par_statut: sujetsParStatut, a_completer: sujets.filter((x) => x.a_completer.length).length, lies_mandat: sujets.filter((x) => x.engagements.length).length },
    actions: {
      total: actions.length, par_statut: actionsParStatut, en_retard: enRetard,
      sans_pilote: actions.filter((a) => !a.pilote_direction && ['a_faire', 'en_cours'].includes(a.statut)).length,
      a_confirmer: actions.filter((a) => a.origine === 'analyse' && ['a_faire', 'en_cours'].includes(a.statut)).length,
      avancement: actives.length ? Math.round((actives.filter((a) => a.statut === 'fait').length / actives.length) * 100) : 0,
    },
    reflexes: {
      total: reflexes.length, valides: reflexes.filter((r) => r.statut === 'valide').length,
      a_revoir: reflexes.filter((r) => r.statut === 'a_revoir').length, par_moment: reflexesParMoment,
    },
    travaux: {
      total: travaux.length, realises, prevus: travaux.length - realises,
      brasseurs: travaux.reduce((n, t) => n + (t.nb_brasseurs || 0), 0),
      ventilateurs: travaux.reduce((n, t) => n + (t.nb_ventilateurs || 0), 0),
    },
    engagements_lies: linksCount?.n || 0,
    sujets_a_completer: sujets.filter((x) => x.a_completer.length).slice(0, 8).map((x) => ({ id: x.id, libelle: x.libelle, partie: x.partie, manque: x.a_completer })),
    sujets_a_arbitrer: sujets.filter((x) => x.statut === 'a_arbitrer').map((x) => ({ id: x.id, libelle: x.libelle, partie: x.partie })),
    participation,
    activite,
    mine: {
      ...mine,
      total: mine.actions.length + mine.reflexes_a_positionner.length + mine.sujets_a_traiter.length,
    },
  });
});

router.get('/mine', async (req, res) => {
  const mine = await computeMine(req.user, req.query.direction);
  res.json({ ...mine, total: mine.actions.length + mine.reflexes_a_positionner.length + mine.sujets_a_traiter.length });
});

router.get('/thematiques', async (req, res) => res.json(await loadThematiques(req.user)));

router.get('/activite', async (req, res) => res.json(await s.recentActivity(Math.min(Number(req.query.limit) || 40, 100))));

// ---------------------------------------------------------------- thématiques

router.post('/thematiques', async (req, res) => {
  const { partie, titre, description } = req.body || {};
  if (![1, 2, 3].includes(Number(partie))) return res.status(400).json({ error: 'Partie invalide (1, 2 ou 3)' });
  if (!titre || !titre.trim()) return res.status(400).json({ error: 'Titre requis' });
  const max = await db.get(`SELECT COALESCE(max(ordre), 0) AS m FROM rex_thematiques WHERE partie = $1`, [partie]);
  try {
    const row = await db.get(
      `INSERT INTO rex_thematiques (partie, ordre, titre, description, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [Number(partie), max.m + 1, titre.trim(), description || null, s.actor(req)]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Cette thématique existe déjà dans cette partie' });
    throw err;
  }
});

router.patch('/thematiques/:id', async (req, res) => {
  const before = await db.get(`SELECT * FROM rex_thematiques WHERE id = $1`, [req.params.id]);
  if (!before) return res.status(404).json({ error: 'Thématique introuvable' });
  const values = s.pick(req.body || {}, ['titre', 'description']);
  if ('titre' in values && !values.titre) return res.status(400).json({ error: 'Titre requis' });
  const keys = Object.keys(values);
  if (!keys.length) return res.json(before);
  const after = await db.get(
    `UPDATE rex_thematiques SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => values[k]), req.params.id]
  );
  await s.logChanges('thematique', after.id, before, after, keys, s.actor(req));
  res.json(after);
});

router.delete('/thematiques/:id', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Réservé aux administrateurs' });
  const r = await db.run(`DELETE FROM rex_thematiques WHERE id = $1`, [req.params.id]);
  if (!r.changes) return res.status(404).json({ error: 'Thématique introuvable' });
  res.status(204).end();
});

// ---------------------------------------------------------------- sujets

router.get('/sujets/:id', async (req, res) => {
  const sujet = await db.get(
    `SELECT su.*, t.titre AS thematique_titre, t.partie FROM rex_sujets su JOIN rex_thematiques t ON t.id = su.thematique_id WHERE su.id = $1`,
    [req.params.id]
  );
  if (!sujet) return res.status(404).json({ error: 'Sujet introuvable' });
  const [links, actions, comments, history, positions, observations, reflexes] = await Promise.all([
    s.engagementsLinks('sujet_id', [sujet.id]),
    loadActions(req.user, { sujet_id: sujet.id }),
    db.all(`SELECT * FROM rex_comments WHERE cible_type = 'sujet' AND cible_id = $1 ORDER BY created_at`, [sujet.id]),
    db.all(`SELECT * FROM rex_history WHERE cible_type = 'sujet' AND cible_id = $1 ORDER BY changed_at DESC, id DESC LIMIT 50`, [sujet.id]),
    db.all(`SELECT * FROM rex_positions WHERE cible_type = 'sujet' AND cible_id = $1 ORDER BY updated_at`, [sujet.id]),
    db.all(`SELECT * FROM rex_comments WHERE cible_type = 'thematique' AND cible_id = $1 ORDER BY id`, [sujet.thematique_id]),
    db.all(`SELECT id, titre, moment, statut FROM rex_reflexes WHERE sujet_id = $1 ORDER BY moment, ordre`, [sujet.id]),
  ]);
  res.json({
    ...sujet,
    engagements: links.get(sujet.id) || [],
    actions,
    comments,
    history,
    positions: s.summarizePositions(positions, req.user),
    positions_detail: positions.map((p) => ({ direction: p.direction, display_name: p.display_name, position: p.position, commentaire: p.commentaire })),
    observations_cr: observations,
    reflexes,
  });
});

router.post('/sujets', async (req, res) => {
  const b = req.body || {};
  if (!b.libelle || !b.libelle.trim()) return res.status(400).json({ error: 'Libellé requis' });
  if (!(await s.exists('thematique', b.thematique_id))) return res.status(400).json({ error: 'Thématique inconnue' });
  const err = validEnum(b.statut, SUJET_STATUTS, 'Statut');
  if (err) return res.status(400).json({ error: err });
  const v = s.pick(b, SUJET_FIELDS);
  const max = await db.get(`SELECT COALESCE(max(ordre), 0) AS m FROM rex_sujets WHERE thematique_id = $1`, [v.thematique_id]);
  try {
    const row = await db.get(
      `INSERT INTO rex_sujets (thematique_id, ordre, libelle, constat, a_fonctionne, a_ameliorer, mesures, pilotage, decision, statut, origine, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'a_discuter'), 'saisie', $11, $11) RETURNING *`,
      [v.thematique_id, max.m + 1, v.libelle, v.constat || null, v.a_fonctionne || null, v.a_ameliorer || null, v.mesures || null, v.pilotage || null, v.decision || null, v.statut || null, s.actor(req)]
    );
    if (Array.isArray(b.engagement_ids)) await s.setLinks('sujet_id', row.id, b.engagement_ids, s.actor(req));
    await s.logEvent('sujet', row.id, 'creation', row.libelle, s.actor(req));
    res.status(201).json(row);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Un sujet de ce nom existe déjà dans cette thématique' });
    throw e;
  }
});

router.patch('/sujets/:id', async (req, res) => {
  const before = await db.get(`SELECT * FROM rex_sujets WHERE id = $1`, [req.params.id]);
  if (!before) return res.status(404).json({ error: 'Sujet introuvable' });
  const b = req.body || {};
  const err = validEnum(b.statut, SUJET_STATUTS, 'Statut');
  if (err) return res.status(400).json({ error: err });
  const values = s.pick(b, SUJET_FIELDS);
  if ('libelle' in values && !values.libelle) return res.status(400).json({ error: 'Libellé requis' });
  if ('thematique_id' in values && !(await s.exists('thematique', values.thematique_id))) return res.status(400).json({ error: 'Thématique inconnue' });
  const after = await s.updateFields('rex_sujets', before.id, values, s.actor(req));
  await s.logChanges('sujet', after.id, before, after, Object.keys(values), s.actor(req));
  if (Array.isArray(b.engagement_ids)) await s.setLinks('sujet_id', after.id, b.engagement_ids, s.actor(req));
  res.json(after);
});

router.put('/sujets/:id/engagements', async (req, res) => {
  if (!(await s.exists('sujet', req.params.id))) return res.status(404).json({ error: 'Sujet introuvable' });
  await s.setLinks('sujet_id', Number(req.params.id), req.body?.engagements || req.body?.engagement_ids, s.actor(req));
  await s.logEvent('sujet', Number(req.params.id), 'engagements', 'liens vers le mandat mis à jour', s.actor(req));
  const links = await s.engagementsLinks('sujet_id', [Number(req.params.id)]);
  res.json(links.get(Number(req.params.id)) || []);
});

router.delete('/sujets/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM rex_sujets WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Sujet introuvable' });
  if (!canDelete(req, row)) return res.status(403).json({ error: "Seul l'auteur ou un administrateur peut supprimer ce sujet" });
  await db.run(`DELETE FROM rex_sujets WHERE id = $1`, [row.id]);
  res.status(204).end();
});

// ---------------------------------------------------------------- actions

router.get('/actions', async (req, res) => res.json(await loadActions(req.user, req.query)));

router.post('/actions', async (req, res) => {
  const b = req.body || {};
  if (!b.titre || !b.titre.trim()) return res.status(400).json({ error: 'Titre requis' });
  const err = validEnum(b.statut, ACTION_STATUTS, 'Statut') || validEnum(b.priorite, ['normale', 'haute'], 'Priorité');
  if (err) return res.status(400).json({ error: err });
  const v = s.pick(b, ACTION_FIELDS);
  if (v.sujet_id && !(await s.exists('sujet', v.sujet_id))) return res.status(400).json({ error: 'Sujet inconnu' });
  const ech = cleanDate(b.echeance);
  if (b.echeance && ech === undefined) return res.status(400).json({ error: 'Échéance invalide (AAAA-MM-JJ)' });
  const row = await db.get(
    `INSERT INTO rex_actions (sujet_id, titre, description, pilote_direction, pilote_nom, pilote_sub, echeance, echeance_texte, statut, priorite, origine, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'a_faire'), COALESCE($10, 'normale'), 'saisie', $11, $11) RETURNING *`,
    [v.sujet_id || null, v.titre, v.description || null, v.pilote_direction || null, v.pilote_nom || null, v.pilote_sub || null, ech || null, v.echeance_texte || null, v.statut || null, v.priorite || null, s.actor(req)]
  );
  if (Array.isArray(b.engagement_ids)) await s.setLinks('action_id', row.id, b.engagement_ids, s.actor(req));
  await s.logEvent('action', row.id, 'creation', row.titre, s.actor(req));
  res.status(201).json(row);
});

router.patch('/actions/:id', async (req, res) => {
  const before = await db.get(`SELECT * FROM rex_actions WHERE id = $1`, [req.params.id]);
  if (!before) return res.status(404).json({ error: 'Action introuvable' });
  const b = req.body || {};
  const err = validEnum(b.statut, ACTION_STATUTS, 'Statut') || validEnum(b.priorite, ['normale', 'haute'], 'Priorité');
  if (err) return res.status(400).json({ error: err });
  const values = s.pick(b, ACTION_FIELDS);
  if ('titre' in values && !values.titre) return res.status(400).json({ error: 'Titre requis' });
  if ('sujet_id' in values && values.sujet_id && !(await s.exists('sujet', values.sujet_id))) return res.status(400).json({ error: 'Sujet inconnu' });
  if ('echeance' in b) {
    const ech = cleanDate(b.echeance);
    if (b.echeance && ech === undefined) return res.status(400).json({ error: 'Échéance invalide (AAAA-MM-JJ)' });
    values.echeance = ech || null;
  }
  // Toute modification par un agent vaut confirmation : l'action n'est plus « à confirmer » (origine analyse).
  if (before.origine === 'analyse' && Object.keys(values).length) values.origine = 'saisie';
  const after = await s.updateFields('rex_actions', before.id, values, s.actor(req));
  await s.logChanges('action', after.id, before, after, Object.keys(values).filter((k) => k !== 'origine'), s.actor(req));
  if (Array.isArray(b.engagement_ids)) await s.setLinks('action_id', after.id, b.engagement_ids, s.actor(req));
  res.json(after);
});

/** « Je prends cette action » : l'agent s'en déclare le/la pilote, pour sa direction. */
router.post('/actions/:id/prendre', async (req, res) => {
  const before = await db.get(`SELECT * FROM rex_actions WHERE id = $1`, [req.params.id]);
  if (!before) return res.status(404).json({ error: 'Action introuvable' });
  const tag = await s.directionTag(req.user);
  const values = { pilote_nom: s.actor(req), pilote_sub: req.user.sub, origine: 'saisie' };
  if (!before.pilote_direction && tag) values.pilote_direction = tag;
  if (before.statut === 'a_faire') values.statut = 'en_cours';
  const after = await s.updateFields('rex_actions', before.id, values, s.actor(req));
  await s.logChanges('action', after.id, before, after, ['pilote_nom', 'pilote_direction', 'statut'], s.actor(req));
  res.json(after);
});

router.put('/actions/:id/engagements', async (req, res) => {
  if (!(await s.exists('action', req.params.id))) return res.status(404).json({ error: 'Action introuvable' });
  await s.setLinks('action_id', Number(req.params.id), req.body?.engagements || req.body?.engagement_ids, s.actor(req));
  await s.logEvent('action', Number(req.params.id), 'engagements', 'liens vers le mandat mis à jour', s.actor(req));
  const links = await s.engagementsLinks('action_id', [Number(req.params.id)]);
  res.json(links.get(Number(req.params.id)) || []);
});

router.delete('/actions/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM rex_actions WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Action introuvable' });
  if (!canDelete(req, row)) return res.status(403).json({ error: "Seul l'auteur ou un administrateur peut supprimer cette action (sinon, passez-la à « abandonnée »)" });
  await db.run(`DELETE FROM rex_actions WHERE id = $1`, [row.id]);
  res.status(204).end();
});

// ---------------------------------------------------------------- réflexes

router.get('/reflexes', async (req, res) => res.json(await loadReflexes(req.user)));

router.post('/reflexes', async (req, res) => {
  const b = req.body || {};
  if (!b.titre || !b.titre.trim()) return res.status(400).json({ error: 'Titre requis' });
  if (!MOMENTS.includes(b.moment)) return res.status(400).json({ error: 'Moment invalide' });
  const v = s.pick(b, REFLEXE_FIELDS);
  if (v.sujet_id && !(await s.exists('sujet', v.sujet_id))) return res.status(400).json({ error: 'Sujet inconnu' });
  const max = await db.get(`SELECT COALESCE(max(ordre), 0) AS m FROM rex_reflexes WHERE moment = $1`, [b.moment]);
  try {
    const row = await db.get(
      `INSERT INTO rex_reflexes (moment, ordre, titre, description, responsable, delai, sujet_id, statut, origine, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'propose', 'saisie', $8, $8) RETURNING *`,
      [b.moment, max.m + 1, v.titre, v.description || null, v.responsable || null, v.delai || null, v.sujet_id || null, s.actor(req)]
    );
    await s.logEvent('reflexe', row.id, 'creation', row.titre, s.actor(req));
    res.status(201).json(row);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce réflexe existe déjà pour ce moment' });
    throw e;
  }
});

router.patch('/reflexes/:id', async (req, res) => {
  const before = await db.get(`SELECT * FROM rex_reflexes WHERE id = $1`, [req.params.id]);
  if (!before) return res.status(404).json({ error: 'Réflexe introuvable' });
  const b = req.body || {};
  const err = validEnum(b.statut, REFLEXE_STATUTS, 'Statut') || validEnum(b.moment, MOMENTS, 'Moment');
  if (err) return res.status(400).json({ error: err });
  const values = s.pick(b, REFLEXE_FIELDS);
  if ('titre' in values && !values.titre) return res.status(400).json({ error: 'Titre requis' });
  if (before.origine === 'analyse' && Object.keys(values).some((k) => k !== 'statut')) values.origine = 'saisie';
  const after = await s.updateFields('rex_reflexes', before.id, values, s.actor(req));
  await s.logChanges('reflexe', after.id, before, after, Object.keys(values).filter((k) => k !== 'origine'), s.actor(req));
  res.json(after);
});

router.delete('/reflexes/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM rex_reflexes WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Réflexe introuvable' });
  if (!canDelete(req, row)) return res.status(403).json({ error: "Seul l'auteur ou un administrateur peut supprimer ce réflexe" });
  await db.run(`DELETE FROM rex_reflexes WHERE id = $1`, [row.id]);
  res.status(204).end();
});

// ---------------------------------------------------------------- positions (accord / réserve / désaccord)

const POSITION_LABEL = { accord: "d'accord", reserve: 'sous réserve', desaccord: "pas d'accord" };

for (const plural of Object.keys(TYPE_BY_PLURAL)) {
  const type = TYPE_BY_PLURAL[plural];

  router.put(`/${plural}/:id/position`, async (req, res) => {
    const { position, commentaire } = req.body || {};
    if (!['accord', 'reserve', 'desaccord'].includes(position)) return res.status(400).json({ error: 'Position invalide' });
    if (!(await s.exists(type, req.params.id))) return res.status(404).json({ error: 'Élément introuvable' });
    if (position !== 'accord' && !(commentaire || '').trim()) {
      return res.status(400).json({ error: 'Précisez votre réserve ou votre désaccord en quelques mots' });
    }
    const tag = await s.directionTag(req.user);
    const row = await db.get(
      `INSERT INTO rex_positions (cible_type, cible_id, user_sub, display_name, direction, position, commentaire)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (cible_type, cible_id, user_sub)
       DO UPDATE SET position = EXCLUDED.position, commentaire = EXCLUDED.commentaire, direction = EXCLUDED.direction, display_name = EXCLUDED.display_name
       RETURNING *`,
      [type, Number(req.params.id), req.user.sub, s.actor(req), tag, position, (commentaire || '').trim() || null]
    );
    await s.logEvent(type, Number(req.params.id), 'position', `${tag ? tag + ' : ' : ''}${POSITION_LABEL[position]}`, s.actor(req));
    res.json(row);
  });

  router.delete(`/${plural}/:id/position`, async (req, res) => {
    await db.run(`DELETE FROM rex_positions WHERE cible_type = $1 AND cible_id = $2 AND user_sub = $3`, [type, req.params.id, req.user.sub]);
    res.status(204).end();
  });
}

// ---------------------------------------------------------------- commentaires

router.get('/comments', async (req, res) => {
  const { cible_type, cible_id } = req.query;
  if (!s.TABLES[cible_type]) return res.status(400).json({ error: 'cible_type invalide' });
  res.json(await db.all(`SELECT * FROM rex_comments WHERE cible_type = $1 AND cible_id = $2 ORDER BY created_at, id`, [cible_type, cible_id]));
});

router.post('/comments', async (req, res) => {
  const { cible_type, cible_id, body } = req.body || {};
  if (!s.TABLES[cible_type]) return res.status(400).json({ error: 'cible_type invalide' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'Commentaire vide' });
  if (!(await s.exists(cible_type, cible_id))) return res.status(404).json({ error: 'Élément introuvable' });
  const row = await db.get(
    `INSERT INTO rex_comments (cible_type, cible_id, author_name, author_direction, author_sub, body) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [cible_type, Number(cible_id), s.actor(req), await s.directionTag(req.user), req.user.sub, body.trim()]
  );
  res.status(201).json(row);
});

router.patch('/comments/:id', async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Commentaire vide' });
  const row = await db.get(`SELECT * FROM rex_comments WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Commentaire introuvable' });
  if (row.is_cr) return res.status(403).json({ error: 'Les extraits du compte rendu ne se modifient pas' });
  if (!(row.author_sub === req.user.sub || isAdmin(req))) return res.status(403).json({ error: "Seul l'auteur peut modifier ce commentaire" });
  res.json(await db.get(`UPDATE rex_comments SET body = $1, edited_at = now() WHERE id = $2 RETURNING *`, [body.trim(), row.id]));
});

router.delete('/comments/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM rex_comments WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Commentaire introuvable' });
  if (row.is_cr && !isAdmin(req)) return res.status(403).json({ error: 'Les extraits du compte rendu ne se suppriment pas' });
  if (!(row.author_sub === req.user.sub || isAdmin(req))) return res.status(403).json({ error: "Seul l'auteur peut supprimer ce commentaire" });
  await db.run(`DELETE FROM rex_comments WHERE id = $1`, [row.id]);
  res.status(204).end();
});

// ---------------------------------------------------------------- travaux confort été / hiver

router.get('/travaux', async (req, res) => {
  const rows = await db.all(`SELECT * FROM rex_travaux ORDER BY saison, id`);
  res.json(rows.map((r) => ({ ...r, date_realisation: s.ymd(r.date_realisation) })));
});

const TRAVAUX_FIELDS = ['saison', 'categorie', 'equipement', 'nature', 'date_realisation', 'date_texte', 'nb_brasseurs', 'nb_ventilateurs', 'observations'];

router.post('/travaux', async (req, res) => {
  const v = s.pick(req.body || {}, TRAVAUX_FIELDS);
  if (!v.equipement || !v.nature) return res.status(400).json({ error: 'Équipement et nature des travaux requis' });
  if (v.saison && !['ete', 'hiver'].includes(v.saison)) return res.status(400).json({ error: 'Saison invalide' });
  const date = cleanDate(v.date_realisation);
  if (v.date_realisation && date === undefined) return res.status(400).json({ error: 'Date invalide (AAAA-MM-JJ)' });
  try {
    const row = await db.get(
      `INSERT INTO rex_travaux (saison, categorie, equipement, nature, date_realisation, date_texte, nb_brasseurs, nb_ventilateurs, observations, created_by, updated_by)
       VALUES (COALESCE($1, 'ete'), $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING *`,
      [v.saison || null, v.categorie || null, v.equipement, v.nature, date || null, v.date_texte || null, Math.max(0, parseInt(v.nb_brasseurs, 10) || 0), Math.max(0, parseInt(v.nb_ventilateurs, 10) || 0), v.observations || null, s.actor(req)]
    );
    res.status(201).json(row);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Cette ligne de travaux existe déjà' });
    throw e;
  }
});

router.patch('/travaux/:id', async (req, res) => {
  const before = await db.get(`SELECT * FROM rex_travaux WHERE id = $1`, [req.params.id]);
  if (!before) return res.status(404).json({ error: 'Ligne introuvable' });
  const values = s.pick(req.body || {}, TRAVAUX_FIELDS);
  if (values.saison && !['ete', 'hiver'].includes(values.saison)) return res.status(400).json({ error: 'Saison invalide' });
  if ('date_realisation' in values) {
    const d = cleanDate(values.date_realisation);
    if (values.date_realisation && d === undefined) return res.status(400).json({ error: 'Date invalide (AAAA-MM-JJ)' });
    values.date_realisation = d || null;
  }
  for (const k of ['nb_brasseurs', 'nb_ventilateurs']) if (k in values) values[k] = Math.max(0, parseInt(values[k], 10) || 0);
  if (('equipement' in values && !values.equipement) || ('nature' in values && !values.nature)) return res.status(400).json({ error: 'Équipement et nature requis' });
  res.json(await s.updateFields('rex_travaux', before.id, values, s.actor(req)));
});

router.delete('/travaux/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM rex_travaux WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Ligne introuvable' });
  if (!canDelete(req, row)) return res.status(403).json({ error: "Seul l'auteur ou un administrateur peut supprimer cette ligne" });
  await db.run(`DELETE FROM rex_travaux WHERE id = $1`, [row.id]);
  res.status(204).end();
});

// ---------------------------------------------------------------- lien inverse depuis un engagement du mandat

router.get('/by-engagement/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const sujets = await db.all(
    `SELECT su.id, su.libelle, su.statut, t.titre AS thematique_titre, t.partie, l.motif
     FROM rex_engagement_links l JOIN rex_sujets su ON su.id = l.sujet_id JOIN rex_thematiques t ON t.id = su.thematique_id
     WHERE l.engagement_id = $1 ORDER BY t.partie, su.ordre`,
    [id]
  );
  const actions = await db.all(
    `SELECT a.id, a.titre, a.statut, a.pilote_direction, a.echeance, a.echeance_texte, a.sujet_id, l.motif
     FROM rex_engagement_links l JOIN rex_actions a ON a.id = l.action_id WHERE l.engagement_id = $1 ORDER BY a.echeance NULLS LAST, a.id`,
    [id]
  );
  res.json({ sujets, actions: actions.map((a) => ({ ...a, echeance: s.ymd(a.echeance) })) });
});

module.exports = router;
