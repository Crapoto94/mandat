// Crée le compte admin de secours initial si aucun n'existe encore.
// Identifiants pris dans SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD (.env).
// À exécuter une seule fois après `npm run migrate`.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, db } = require('../db/pg_db');

async function run() {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD manquant ou trop court (8 caractères min.) dans le .env');
  }

  const existing = await db.get(`SELECT id FROM mandat.admin_users WHERE username = $1`, [username]);
  if (existing) {
    console.log(`[seed-admin] Le compte "${username}" existe déjà — rien à faire.`);
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await db.run(
    `INSERT INTO mandat.admin_users (username, password_hash, display_name) VALUES ($1, $2, $3)`,
    [username, hash, 'Administrateur (secours)']
  );
  console.log(`[seed-admin] Compte admin "${username}" créé. Pensez à changer son mot de passe après la première connexion.`);
}

run()
  .catch((err) => {
    console.error('[seed-admin] ERREUR :', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
