// Logique d'import des deux fichiers Excel sources, partagée entre le script
// CLI (scripts/import-excel.js) et la route d'admin (modules/admin/admin.routes.js).
//
// Fichier 1 "suivi" : liste exhaustive des 55 engagements (une ligne = un
//   engagement), feuille "Feuil1" — colonnes A..J décrites ci-dessous.
// Fichier 2 "répartition" : 3 feuilles (une par groupe CODIR), mêmes colonnes,
//   sert uniquement à déterminer à quel groupe appartient chaque engagement
//   (par son numéro).
const XLSX = require('xlsx');
const { db } = require('../db/pg_db');

const COLUMNS = [
  'axe',
  'numero',
  'contenu',
  'pilotage',
  'contribution_elaboration',
  'contribution_impactees',
  'echeance',
  'etat_libelle',
  'description_avancement',
  'prochaines_etapes',
];

const ETAT_LABEL_TO_CODE = {
  'a lancer': 'a_lancer',
  'en cours': 'en_cours',
  "en attente d'arbitrage": 'en_attente_arbitrage',
  'partiellement realise': 'partiellement_realise',
  'partiellement réalisé': 'partiellement_realise',
  realise: 'realise',
  réalisé: 'realise',
};

function normalize(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // enlève les accents pour la comparaison
}

function labelToEtatCode(label) {
  if (!label) return null;
  const key = normalize(label);
  const match = Object.entries(ETAT_LABEL_TO_CODE).find(([k]) => normalize(k) === key);
  return match ? match[1] : null;
}

function readSheetRows(sheet) {
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  const rows = [];
  // La ligne 1 est l'en-tête ; les données commencent en ligne 2.
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i];
    if (!cells || cells[1] === null || cells[1] === undefined) continue; // pas de numéro d'engagement
    const row = {};
    COLUMNS.forEach((key, idx) => {
      row[key] = cells[idx] !== undefined ? cells[idx] : null;
    });
    if (typeof row.axe === 'string') row.axe = row.axe.trim();
    if (typeof row.contenu === 'string') row.contenu = row.contenu.trim();
    row.numero = Number(row.numero);
    rows.push(row);
  }
  return rows;
}

/** Parse le fichier "suivi" (liste exhaustive) : renvoie un tableau d'engagements. */
function parseSuiviWorkbook(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find((n) => /feuil ?1/i.test(n)) || wb.SheetNames[0];
  return readSheetRows(wb.Sheets[sheetName]);
}

/** Parse le fichier "répartition par groupe" : renvoie Map(numero -> code groupe). */
function parseRepartitionWorkbook(filePath) {
  const wb = XLSX.readFile(filePath);
  const map = new Map();
  for (const sheetName of wb.SheetNames) {
    if (!/^G ?\d/i.test(sheetName)) continue; // ignore d'éventuelles feuilles annexes
    const code = sheetName.trim().toUpperCase().replace(/\s+/g, '');
    for (const row of readSheetRows(wb.Sheets[sheetName])) {
      map.set(row.numero, code);
    }
  }
  return map;
}

/** Extraction best-effort des codes de direction cités dans les champs libres. */
function extractDirectionCodes(...fields) {
  const codes = new Set();
  for (const field of fields) {
    if (!field || typeof field !== 'string') continue;
    for (const token of field.split(/[+\-\/,\n]|(?<=[a-zàâéèêëîïôûùç])(?=[A-ZÀÂÉÈÊËÎÏÔÛÙÇ])/)) {
      const code = token.trim();
      if (code && code.length <= 20 && !/\s{2,}/.test(code)) codes.add(code);
    }
  }
  return [...codes];
}

async function importFromFiles({ suiviFile, repartitionFile }) {
  const suiviRows = parseSuiviWorkbook(suiviFile);
  const groupMap = repartitionFile ? parseRepartitionWorkbook(repartitionFile) : new Map();

  const groupes = await db.all(`SELECT id, code FROM groupes`);
  const groupeIdByCode = new Map(groupes.map((g) => [g.code, g.id]));

  const warnings = [];
  let inserted = 0;
  let updated = 0;
  let groupeAssignes = 0;
  const directionCodes = new Set();

  for (const row of suiviRows) {
    const etatCode = labelToEtatCode(row.etat_libelle);
    if (row.etat_libelle && !etatCode) {
      warnings.push(`Engagement ${row.numero} : état "${row.etat_libelle}" non reconnu, ignoré`);
    }

    const groupeCode = groupMap.get(row.numero) || null;
    const groupeId = groupeCode ? groupeIdByCode.get(groupeCode) : null;
    if (groupeCode && !groupeId) {
      warnings.push(`Engagement ${row.numero} : groupe "${groupeCode}" inconnu`);
    }
    if (groupeId) groupeAssignes += 1;

    extractDirectionCodes(row.pilotage, row.contribution_elaboration, row.contribution_impactees).forEach((c) =>
      directionCodes.add(c)
    );

    const existing = await db.get(`SELECT id FROM engagements WHERE numero = $1`, [row.numero]);

    if (existing) {
      await db.run(
        `UPDATE engagements SET
           axe = $1, contenu = $2, pilotage = $3, contribution_elaboration = $4,
           contribution_impactees = $5, echeance = $6, groupe_id = COALESCE($7, groupe_id)
         WHERE id = $8`,
        [
          row.axe,
          row.contenu,
          row.pilotage,
          row.contribution_elaboration,
          row.contribution_impactees,
          row.echeance,
          groupeId,
          existing.id,
        ]
      );
      updated += 1;
    } else {
      await db.run(
        `INSERT INTO engagements
           (numero, axe, contenu, pilotage, contribution_elaboration, contribution_impactees,
            echeance, etat_code, description_avancement, prochaines_etapes, groupe_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          row.numero,
          row.axe,
          row.contenu,
          row.pilotage,
          row.contribution_elaboration,
          row.contribution_impactees,
          row.echeance,
          etatCode || 'a_lancer',
          row.description_avancement,
          row.prochaines_etapes,
          groupeId,
        ]
      );
      inserted += 1;
    }
  }

  for (const code of directionCodes) {
    await db
      .run(`INSERT INTO directions (code, libelle) VALUES ($1, $1) ON CONFLICT DO NOTHING`, [code])
      .catch(() => {});
  }

  return {
    totalLignes: suiviRows.length,
    inserted,
    updated,
    groupeAssignes,
    directionsReferencees: directionCodes.size,
    warnings,
  };
}

module.exports = {
  parseSuiviWorkbook,
  parseRepartitionWorkbook,
  extractDirectionCodes,
  labelToEtatCode,
  importFromFiles,
};
