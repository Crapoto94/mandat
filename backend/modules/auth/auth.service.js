const bcrypt = require('bcryptjs');
const { db } = require('../../db/pg_db');
const apm = require('../../services/apm');
const { signToken } = require('../../middleware/auth');

/** Connexion agent Ville : bind LDAP via l'APM, JWT applicatif ensuite. */
async function loginAgent(username, password) {
  if (!username || !password) {
    return { ok: false, status: 400, error: 'Identifiant et mot de passe requis' };
  }

  const result = await apm.authenticateAgent(username, password);
  if (!result.success) {
    return { ok: false, status: 401, error: result.error || 'Identifiants invalides' };
  }

  // Enrichissement (direction, mail, mobile) — best effort, ne bloque pas la
  // connexion. Champs réels observés sur le schéma AD Ville : la direction
  // de rattachement est dans `company` ("entreprise" côté AD) — `department`
  // contient souvent le service de l'agent, pas sa direction — avec
  // `physicalDeliveryOfficeName` en repli sur d'anciens comptes. Jamais
  // `direction`/`service` (absents du schéma).
  const infos = await apm.getAgent(username);
  const displayName = infos?.displayName || infos?.name || username;
  const direction = infos?.company || infos?.department || infos?.physicalDeliveryOfficeName || null;
  const email = infos?.mail || infos?.email || null;
  const mobile = infos?.mobile || infos?.telephoneMobile || null;

  await db
    .run(
      `INSERT INTO agents_cache (username, display_name, email, mobile, direction, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (username) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         email = EXCLUDED.email,
         mobile = EXCLUDED.mobile,
         direction = EXCLUDED.direction,
         updated_at = now()`,
      [username, displayName, email, mobile, direction]
    )
    .catch((err) => console.warn('[auth] cache agent impossible :', err.message));

  const user = { sub: username, role: 'agent', displayName, direction, email };
  return { ok: true, token: signToken(user), user };
}

/** Connexion admin de secours : compte local, indépendant de l'AD/APM. */
async function loginAdmin(username, password) {
  if (!username || !password) {
    return { ok: false, status: 400, error: 'Identifiant et mot de passe requis' };
  }
  const account = await db.get(
    `SELECT * FROM admin_users WHERE username = $1 AND active = true`,
    [username]
  );
  if (!account) {
    return { ok: false, status: 401, error: 'Identifiants invalides' };
  }
  const match = await bcrypt.compare(password, account.password_hash);
  if (!match) {
    return { ok: false, status: 401, error: 'Identifiants invalides' };
  }

  await db
    .run(`UPDATE admin_users SET last_login_at = now() WHERE id = $1`, [account.id])
    .catch(() => {});

  const user = { sub: account.username, role: 'admin', displayName: account.display_name || account.username };
  return { ok: true, token: signToken(user), user };
}

module.exports = { loginAgent, loginAdmin };
