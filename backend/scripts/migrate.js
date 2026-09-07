// Applique les fichiers migrations/*.sql non encore joués, dans l'ordre
// alphabétique (préfixe numérique). Suivi via une table mandat.schema_migrations.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pg_db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS mandat');
    await client.query(`
      CREATE TABLE IF NOT EXISTS mandat.schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set((await client.query('SELECT filename FROM mandat.schema_migrations')).rows.map((r) => r.filename));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] ${file} — déjà appliquée`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] application de ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO mandat.schema_migrations (filename) VALUES ($1)', [file]);
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
