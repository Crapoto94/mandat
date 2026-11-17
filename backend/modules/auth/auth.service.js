const bcrypt = require('bcryptjs');
const { db } = require('../../db/pg_db');
const apm = require('../../services/apm');
const ldapAuth = require('../../services/ldapAuth');
const accessControl = require('../../services/accessControl');
const { signToken } = require('../../middleware/auth');

// Plafond de temps pour le contrôle d'accès avant de répondre à l'agent. Le
// contrôle croise des référentiels distants lents (vue Oracle exposée via
// postgres_fdw, résolution LDAP des groupes particuliers via le Hub DSI) : sans
// plafond, une source lente fait dépasser le délai du reverse-proxy nginx et le
// login se termine en 504 — l'agent voit « Request failed with status code 504 »
// alors que le backend va très bien. On abandonne au bout de ce délai et on
// laisse passer (fail-open, cf. checkAccessGroups) : mieux vaut autoriser un
// agent dont l'appartenance n'a pas pu être vérifiée que le priver de l'accès
// pour une panne technique. Les résultats étant mis en cache côté
// accessControl, ce plafond ne se paie qu'à froid (démarrage du conteneur).
const ACCESS_CHECK_TIMEOUT_MS = Number(process.env.ACCESS_CHECK_TIMEOUT_MS) || 8000;

/** Rejette `promise` si elle n'est pas résolue dans `ms` ms. La promesse
 * d'origine n'est pas annulée (aucun support de l'abandon dans les drivers
 * utilisés) : elle est seulement oubliée, son résultat arrivant plus tard
 * n'affectera plus personne — les charges en cours sont mémorisées en cache. */
function withDeadline(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function cacheAgent({ username, displayName, email, mobile, direction }) {
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
}

/** Mise à jour de `agents_cache` : information de confort (fiche agent, listes
 * de correspondance), jamais nécessaire à l'authentification. Elle ne doit donc
 * pas retarder la réponse au client — on l'envoie sans l'attendre, avec un
 * plafond, pour qu'une base lente n'entraîne pas un timeout sur le login. */
function cacheAgentInBackground(info) {
  withDeadline(cacheAgent(info), 3000, 'délai dépassé')
    .catch((err) => console.warn('[auth] cache agent non mis à jour :', err.message));
}

/** Restriction d'accès par groupe (DG/DGA, Directeurs, Resp. service,
 * groupes particuliers — cf. Admin → "Accès par groupe"). Appliquée sur
 * toute connexion agent, LDAP ou APM (le displayName suffit pour matcher un
 * niveau RH par nom ; employeeId/memberOfDns, disponibles seulement via le
 * LDAP direct, affinent le matching et sont seuls utilisables pour les
 * groupes particuliers). Renvoie un message d'erreur si refusé, sinon null.
 * Échec de la vérification elle-même (base RH/Hub injoignable, Oracle FDW qui
 * ne répond pas, délai dépassé...) : n'exclut pas l'agent pour une raison
 * technique qui ne le concerne pas. */
async function checkAccessGroups({ employeeId, memberOfDns, username, displayName, email }) {
  try {
    const authorized = await withDeadline(
      accessControl.isAgentAuthorized({ employeeId, memberOfDns, username, displayName, email }),
      ACCESS_CHECK_TIMEOUT_MS,
      `délai de ${ACCESS_CHECK_TIMEOUT_MS} ms dépassé`
    );
    if (!authorized) return "Accès non autorisé — votre compte n'appartient à aucun groupe habilité";
    return null;
  } catch (err) {
    console.warn('[auth] vérification accès par groupe impossible :', err.message);
    return null;
  }
}

/** Connexion agent Ville via LDAP direct — même méthode que le magapp/hub
 * (services/ldapAuth.js) : un seul aller-retour AD fait à la fois
 * l'authentification et la récupération des infos (direction, mail...). */
async function loginAgentViaLdap(username, password) {
  let agent;
  try {
    agent = await ldapAuth.authenticate(username, password);
  } catch (err) {
    return { ok: false, status: 502, error: `AD injoignable : ${err.message}` };
  }
  if (!agent) {
    return { ok: false, status: 401, error: 'Identifiants invalides' };
  }

  const accessError = await checkAccessGroups({
    employeeId: agent.employeeId,
    memberOfDns: agent.memberOf,
    username: agent.sAMAccountName || username,
    displayName: agent.displayName,
    email: agent.mail,
  });
  if (accessError) return { ok: false, status: 403, error: accessError };

  const displayName = agent.displayName || username;
  cacheAgentInBackground({ username, displayName, email: agent.mail, mobile: agent.mobile, direction: agent.direction });

  const user = { sub: username, role: 'agent', displayName, direction: agent.direction, email: agent.mail };
  return { ok: true, token: signToken(user), user };
}

/** Connexion agent Ville via l'APM (bind LDAP relayé) — repli historique si
 * le LDAP direct n'est pas configuré (AD_HOST absent de .env). */
async function loginAgentViaApm(username, password) {
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

  // Pas de matricule/memberOf fiables via l'APM : les niveaux RH matchent
  // par nom, et les groupes particuliers (AD) par repli sur la liste des
  // membres résolue via le Hub DSI (sAMAccountName/e-mail/displayName).
  const accessError = await checkAccessGroups({ username, displayName, email });
  if (accessError) return { ok: false, status: 403, error: accessError };

  cacheAgentInBackground({ username, displayName, email, mobile, direction });

  const user = { sub: username, role: 'agent', displayName, direction, email };
  return { ok: true, token: signToken(user), user };
}

/** Connexion agent Ville : LDAP direct si configuré (AD_HOST — cf.
 * .env.example, même méthode que le magapp), sinon relayée par l'APM. */
async function loginAgent(username, password) {
  if (!username || !password) {
    return { ok: false, status: 400, error: 'Identifiant et mot de passe requis' };
  }
  // Un identifiant saisi en email ("jflores@ivry94.fr") doit fonctionner
  // comme le sAMAccountName seul — même normalisation que le magapp.
  const cleanUsername = username.replace(/@ivry94\.fr$/i, '').trim();

  if (ldapAuth.ldapConfigured()) {
    return loginAgentViaLdap(cleanUsername, password);
  }
  return loginAgentViaApm(cleanUsername, password);
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
