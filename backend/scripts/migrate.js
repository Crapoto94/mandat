// Applique les fichiers migrations/*.sql non encore joués, dans l'ordre
// alphabétique (préfixe numérique). Suivi via une table "<schéma>.schema_migrations".
//
// Le nom du schéma est paramétré via POSTGRES_SCHEMA (jamais en dur, cf.
// guide §1.1) : les fichiers .sql utilisent le jeton __SCHEMA__, substitué
// ici par le nom réel (validé strictement, car interpolé dans du SQL).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { pool, SCHEMA } = require('../db/pg_db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${SCHEMA}".schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await client.query(`SELECT filename FROM "${SCHEMA}".schema_migrations`)).rows.map((r) => r.filename)
    );
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] ${file} — déjà appliquée`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/__SCHEMA__/g, SCHEMA);
      console.log(`[migrate] application de ${file} (schéma "${SCHEMA}")...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO "${SCHEMA}".schema_migrations (filename) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        console.log(`[migrate] ${file} — OK`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Échec de la migration ${file} : ${err.message}`);
      }
    }
    console.log('[migrate] terminé.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[migrate] ERREUR :', err.message);
  process.exit(1);
});
