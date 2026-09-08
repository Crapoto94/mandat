// Authentification AD en LDAP direct — même méthode que le magapp/hub
// (c:\dev\appdsi\backend\shared\ad_auth.js) : bind technique, recherche du
// compte par sAMAccountName, puis bind avec le mot de passe de l'agent sur
// le DN trouvé. Utilisée à la place de l'authentification relayée par
// l'APM (services/apm.js) quand AD_HOST est configuré : certains comptes
// (ex. identifiants avec caractères spéciaux/accents ailleurs dans leur
// fiche AD) échouaient via l'APM sans qu'on en maîtrise la cause côté
// mandat — le contournement éprouvé du magapp est de parler directement au
// LDAP.
const ldap = require('ldapjs');

const AD_HOST = process.env.AD_HOST;
const AD_PORT = process.env.AD_PORT || '389';
const AD_BASE_DN = process.env.AD_BASE_DN;
const AD_BIND_DN = process.env.AD_BIND_DN;
const AD_BIND_PASSWORD = process.env.AD_BIND_PASSWORD;
const AD_REQUIRED_GROUP = process.env.AD_REQUIRED_GROUP || null;

const ATTRIBUTES = [
  'dn',
  'cn',
  'sAMAccountName',
  'displayName',
  'mail',
  'memberOf',
  'company',
  'department',
  'physicalDeliveryOfficeName',
  'mobile',
  'telephoneMobile',
  'title',
];

function ldapConfigured() {
  return Boolean(AD_HOST && AD_BASE_DN && AD_BIND_DN && AD_BIND_PASSWORD);
}

/** Une valeur LDAP peut revenir échappée en \xx (octets hexadécimaux) plutôt
 * qu'en UTF-8 propre, notamment pour les caractères accentués — d'où les
 * échecs sporadiques déjà observés côté magapp avant ce décodage. Reproduit
 * à l'identique (cf. appdsi/backend/shared/utils.js#decodeLDAPString). */
function decodeLDAPString(str) {
  if (!str) return str;
  if (Buffer.isBuffer(str)) return str.toString('utf8');
  if (typeof str !== 'string') return str;

  try {
    if (str.includes('\\')) {
      const bytes = [];
      for (let i = 0; i < str.length; i++) {
        if (str[i] === '\\' && i + 2 < str.length && /[0-9a-fA-F]{2}/.test(str.substring(i + 1, i + 3))) {
          bytes.push(parseInt(str.substring(i + 1, i + 3), 16));
          i += 2;
        } else {
          bytes.push(str.charCodeAt(i));
        }
      }
      return Buffer.from(bytes).toString('utf8').normalize('NFC');
    }
    return str.normalize('NFC');
  } catch {
    return str;
  }
}

function flattenLDAPEntry(entry) {
  if (!entry) return null;
  const pojo = entry.pojo;
  if (!pojo) return entry.object || entry;

  let rawDn = pojo.objectName || '';
  try {
    if (rawDn && typeof rawDn === 'string' && rawDn.includes('\\')) rawDn = decodeLDAPString(rawDn);
  } catch {
    // repli silencieux : DN brut conservé
  }

  const obj = { dn: rawDn };
  if (Array.isArray(pojo.attributes)) {
    for (const attr of pojo.attributes) {
      let val = attr.values.length === 1 ? attr.values[0] : attr.values;
      if (ATTRIBUTES.includes(attr.type)) {
        val = Array.isArray(val) ? val.map(decodeLDAPString) : decodeLDAPString(val);
      }
      obj[attr.type] = val;
    }
  }
  return obj;
}

/** Échappe les caractères spéciaux d'un filtre LDAP (RFC 4515) — l'identifiant
 * saisi par l'agent ne doit jamais pouvoir modifier la structure du filtre. */
function escapeLdapFilter(value) {
  return String(value).replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

function newClient() {
  return ldap.createClient({
    url: `ldap://${AD_HOST}:${AD_PORT}`,
    connectTimeout: 8000,
    timeout: 8000,
  });
}

function searchUser(client, username) {
  return new Promise((resolve, reject) => {
    const opts = {
      filter: `(sAMAccountName=${escapeLdapFilter(username)})`,
      scope: 'sub',
      attributes: ATTRIBUTES,
      referrals: false,
      paged: false,
    };
    client.search(AD_BASE_DN, opts, (err, res) => {
      if (err) return reject(err);
      let userEntry = null;
      res.on('searchEntry', (entry) => {
        userEntry = flattenLDAPEntry(entry);
      });
      res.on('error', reject);
      res.on('end', () => resolve(userEntry));
    });
  });
}

function toAgentInfo(entry) {
  const direction = entry.company || entry.department || entry.physicalDeliveryOfficeName || null;
  return {
    sAMAccountName: entry.sAMAccountName || null,
    displayName: entry.displayName || entry.cn || null,
    direction,
    mail: entry.mail || null,
    mobile: entry.mobile || entry.telephoneMobile || null,
    title: entry.title || null,
    dn: entry.dn,
    raw: entry,
  };
}

/** Authentifie un agent (bind technique + recherche + bind agent) et renvoie
 * ses infos si mot de passe correct, sinon null. Lève une erreur seulement
 * en cas de problème technique (LDAP injoignable, bind technique refusé). */
async function authenticate(username, password) {
  if (!ldapConfigured()) throw new Error('LDAP direct non configuré (AD_HOST/AD_BASE_DN/AD_BIND_DN/AD_BIND_PASSWORD manquants)');

  const techClient = newClient();
  try {
    await new Promise((resolve, reject) => {
      techClient.bind(AD_BIND_DN, AD_BIND_PASSWORD, (err) => (err ? reject(err) : resolve()));
    });

    const userEntry = await searchUser(techClient, username);
    if (!userEntry) return null; // compte inconnu

    const userClient = newClient();
    const bindOk = await new Promise((resolve) => {
      userClient.bind(userEntry.dn, password, (err) => {
        userClient.destroy();
        resolve(!err);
      });
    });
    if (!bindOk) return null; // mot de passe incorrect

    if (AD_REQUIRED_GROUP) {
      const needed = AD_REQUIRED_GROUP.toLowerCase().trim().normalize('NFC');
      const groups = Array.isArray(userEntry.memberOf) ? userEntry.memberOf : userEntry.memberOf ? [userEntry.memberOf] : [];
      const ok = groups.some((g) => g && g.toLowerCase().normalize('NFC').includes(needed));
      if (!ok) throw new Error(`Groupe requis non trouvé pour ce compte : ${AD_REQUIRED_GROUP}`);
    }

    return toAgentInfo(userEntry);
  } finally {
    techClient.destroy();
  }
}

/** Recherche seule (sans mot de passe) — pour l'outil admin "Vérifier un agent". */
async function lookup(username) {
  if (!ldapConfigured()) throw new Error('LDAP direct non configuré');
  const client = newClient();
  try {
    await new Promise((resolve, reject) => {
      client.bind(AD_BIND_DN, AD_BIND_PASSWORD, (err) => (err ? reject(err) : resolve()));
    });
    const userEntry = await searchUser(client, username);
    return userEntry ? toAgentInfo(userEntry) : null;
  } finally {
    client.destroy();
  }
}

module.exports = { ldapConfigured, authenticate, lookup };
