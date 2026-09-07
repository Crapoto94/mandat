const { Pool } = require('pg');

// Nom du schéma dédié à l'appli — jamais en dur dans les requêtes (cf. guide
// §1.1) : on le lit du .env et on l'impose via search_path sur chaque
// connexion du pool. Validé strictement car interpolé tel quel dans du SQL
// (les identifiants ne se paramètrent pas avec $1, $2… côté Postgres).
const SCHEMA = validateSchemaName(process.env.POSTGRES_SCHEMA || 'mandat');

function validateSchemaName(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`POSTGRES_SCHEMA invalide : "${name}" (lettres/chiffres/underscore uniquement)`);
  }
  return name;
}

// Tous les identifiants proviennent du .env — aucune valeur en dur ici.
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT || 5432,
});

// Impose le schéma dédié sur chaque nouvelle connexion du pool : toutes les
// requêtes non qualifiées (SELECT * FROM engagements...) s'y résolvent.
pool.on('connect', (client) => {
  client.query(`SET search_path TO "${SCHEMA}", public`).catch((err) => {
    console.error('[DB] Impossible de positionner le search_path :', err.message);
  });
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

module.exports = { pool, db, checkConnection, SCHEMA };
