const { Pool } = require('pg');

// Tous les identifiants proviennent du .env — aucune valeur en dur ici.
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT || 5432,
});

pool.on('error', (err) => {
  // Erreur sur un client inactif du pool : ne doit pas planter le process.
  console.error('[DB] Erreur inattendue du pool pg :', err.message);
});

// Petit wrapper pratique (placeholders $1, $2…), sur le modèle du guide.
const db = {
  all: (sql, p = []) => pool.query(sql, p).then((r) => r.rows),
  get: (sql, p = []) => pool.query(sql, p).then((r) => r.rows[0]),
  run: (sql, p = []) => pool.query(sql, p).then((r) => ({ rows: r.rows, changes: r.rowCount })),
};

async function checkConnection() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { pool, db, checkConnection };
