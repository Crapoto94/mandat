// Charge le REX Canicule 2026 initial (backend/seed/rex-canicule.json) :
// thématiques et sujets du tableau REX, extraits du compte rendu du
// 14 octobre 2026, liens vers les engagements du mandat, actions, réflexes
// communs et travaux confort été/hiver.
//
// Idempotent : rejouable sans créer de doublons (clés d'unicité en base) et
// sans écraser ce que les agents ont modifié depuis (INSERT ... DO NOTHING).
// À exécuter après `npm run migrate` :   npm run seed-rex
//   --dry-run   affiche ce qui serait chargé sans rien écrire.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { pool, db, SCHEMA } = require('../db/pg_db');

const DRY = process.argv.includes('--dry-run');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'rex-canicule.json'), 'utf8'));
const BY = 'Import REX Canicule';
const stats = {};
const bump = (k, n = 1) => (stats[k] = (stats[k] || 0) + n);

async function run() {
  console.log(`[seed-rex] schéma "${SCHEMA}"${DRY ? ' (dry-run)' : ''} — sources : ${data.source.join(' ; ')}`);
  if (DRY) {
    for (const k of ['thematiques', 'sujets', 'comments', 'links', 'actions', 'reflexes', 'travaux']) console.log(`  ${k}: ${data[k].length}`);
    return;
  }

  const thematiqueId = new Map();
  for (const t of data.thematiques) {
    const row =
      (await db.get(
        `INSERT INTO rex_thematiques (partie, ordre, titre, description, created_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (partie, titre) DO NOTHING RETURNING id`,
        [t.partie, t.ordre, t.titre, t.description, BY]
      )) || (await db.get(`SELECT id FROM rex_thematiques WHERE partie = $1 AND titre = $2`, [t.partie, t.titre]));
    thematiqueId.set(t.titre, row.id);
  }
  bump('thématiques', thematiqueId.size);

  const sujetId = new Map();
  for (const x of data.sujets) {
    const tid = thematiqueId.get(x.thematique);
    const ins = await db.get(
      `INSERT INTO rex_sujets (thematique_id, ordre, libelle, constat, a_fonctionne, a_ameliorer, mesures, pilotage, decision, origine, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) ON CONFLICT (thematique_id, libelle) DO NOTHING RETURNING id`,
      [tid, x.ordre, x.libelle, x.constat, x.a_fonctionne, x.a_ameliorer, x.mesures, x.pilotage, x.decision, x.origine, BY]
    );
    if (ins) bump('sujets créés');
    const row = ins || (await db.get(`SELECT id FROM rex_sujets WHERE thematique_id = $1 AND libelle = $2`, [tid, x.libelle]));
    sujetId.set(`${x.thematique}||${x.libelle}`, row.id);
    sujetId.set(x.libelle, row.id);
  }

  // Observations du compte rendu : chargées une seule fois par thématique.
  for (const c of data.comments) {
    const tid = thematiqueId.get(c.thematique);
    const dup = await db.get(`SELECT 1 AS ok FROM rex_comments WHERE cible_type = 'thematique' AND cible_id = $1 AND is_cr AND body = $2`, [tid, c.body]);
    if (dup) continue;
    await db.run(`INSERT INTO rex_comments (cible_type, cible_id, author_name, body, is_cr) VALUES ('thematique', $1, $2, $3, true)`, [tid, c.author_name, c.body]);
    bump("observations du c/r");
  }

  const engagementId = new Map((await db.all(`SELECT id, numero FROM engagements`)).map((e) => [e.numero, e.id]));
  if (!engagementId.size) console.warn("[seed-rex] ⚠️  Aucun engagement en base : les liens vers le mandat seront ignorés (lancer d'abord `npm run import`).");

  async function link(col, ownerId, items) {
    for (const it of items) {
      const eid = engagementId.get(it.numero);
      if (!eid) { bump('liens ignorés (engagement absent)'); continue; }
      const r = await db.run(
        `INSERT INTO rex_engagement_links (${col}, engagement_id, motif, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [ownerId, eid, it.motif, BY]
      );
      if (r.changes) bump('liens vers le mandat');
    }
  }

  for (const l of data.links) {
    const id = sujetId.get(l.sujet);
    if (id) await link('sujet_id', id, l.engagements);
  }

  for (const a of data.actions) {
    const sid = sujetId.get(a.sujet);
    const ins = await db.get(
      `INSERT INTO rex_actions (sujet_id, titre, description, pilote_direction, echeance, echeance_texte, priorite, origine, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) ON CONFLICT (sujet_id, titre) WHERE sujet_id IS NOT NULL DO NOTHING RETURNING id`,
      [sid, a.titre, a.description, a.pilote_direction, a.echeance, a.echeance_texte, a.priorite, a.origine, BY]
    );
    if (!ins) continue;
    bump('actions');
    await link('action_id', ins.id, a.engagements || []);
  }

  for (const r of data.reflexes) {
    const ins = await db.get(
      `INSERT INTO rex_reflexes (moment, ordre, titre, description, responsable, delai, sujet_id, origine, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) ON CONFLICT (moment, titre) DO NOTHING RETURNING id`,
      [r.moment, r.ordre, r.titre, r.description, r.responsable, r.delai, r.sujet ? sujetId.get(r.sujet) || null : null, r.origine, BY]
    );
    if (ins) bump('réflexes');
  }

  for (const t of data.travaux) {
    const ins = await db.get(
      `INSERT INTO rex_travaux (saison, categorie, equipement, nature, date_realisation, date_texte, nb_brasseurs, nb_ventilateurs, observations, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) ON CONFLICT DO NOTHING RETURNING id`,
      [t.saison, t.categorie, t.equipement, t.nature, t.date_realisation, t.date_texte, t.nb_brasseurs, t.nb_ventilateurs, t.observations, BY]
    );
    if (ins) bump('travaux');
  }

  console.log('[seed-rex] terminé :', stats);
}

run()
  .catch((err) => {
    console.error('[seed-rex] ERREUR :', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
