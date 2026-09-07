// CLI d'import des fichiers Excel sources dans la base.
//
// Usage :
//   node scripts/import-excel.js --suivi "chemin/fichier suivi.xlsx" [--repartition "chemin/repartition.xlsx"]
//   node scripts/import-excel.js --dry-run --suivi "..." --repartition "..."   (aucune écriture DB, juste un aperçu)
require('dotenv').config();
const { pool } = require('../db/pg_db');
const { importFromFiles, parseSuiviWorkbook, parseRepartitionWorkbook } = require('./import-lib');

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--suivi') args.suivi = argv[++i];
    else if (argv[i] === '--repartition') args.repartition = argv[++i];
  }
  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.suivi) {
    console.error('Usage: node scripts/import-excel.js --suivi <fichier.xlsx> [--repartition <fichier.xlsx>] [--dry-run]');
    process.exit(1);
  }

  if (args.dryRun) {
    const rows = parseSuiviWorkbook(args.suivi);
    console.log(`[import] ${rows.length} engagement(s) lus dans le fichier de suivi.`);
    console.table(rows.slice(0, 5).map((r) => ({ numero: r.numero, axe: r.axe.slice(0, 30), contenu: r.contenu.slice(0, 50) })));
    if (args.repartition) {
      const map = parseRepartitionWorkbook(args.repartition);
      console.log(`[import] ${map.size} engagement(s) affectés à un groupe dans le fichier de répartition.`);
      const parGroupe = {};
      for (const code of map.values()) parGroupe[code] = (parGroupe[code] || 0) + 1;
      console.log('[import] répartition par groupe :', parGroupe);
    }
    console.log('[import] --dry-run : aucune écriture en base.');
    return;
  }

  const summary = await importFromFiles({ suiviFile: args.suivi, repartitionFile: args.repartition });
  console.log('[import] Terminé :', summary);
  if (summary.warnings.length) {
    console.warn('[import] Avertissements :');
    summary.warnings.forEach((w) => console.warn(' -', w));
  }
}

run()
  .catch((err) => {
    console.error('[import] ERREUR :', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
