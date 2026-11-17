// Restriction d'accès à l'application par groupe — cf.
// migrations/016_access_groups.sql pour le contexte. S'applique sur TOUTE
// connexion agent (APM ou LDAP direct) : le matricule (employeeID) et les
// appartenances de groupe (memberOf) ne sont fiables que via le LDAP
// direct, donc pour les niveaux RH (DG/DGA, Directeurs, Resp. service) on
// matche aussi par nom/prénom (toujours disponible, quel que soit le
// parcours de connexion) — moins strict qu'un matricule, mais suffisant
// pour trancher une appartenance à un niveau, et ça marche dès aujourd'hui
// sans attendre la configuration LDAP. Les groupes particuliers (AD),
// eux, nécessitent memberOf — donc le LDAP direct — et sont ignorés sinon.
const { db } = require('../db/pg_db');
const { createTtlCache } = require('../lib/ttlCache');

// Les référentiels de groupes sont coûteux à résoudre et étaient rejoués à
// chaque appel : `listNiveauMembers` fait un scan complet de
// `oracle.rh_v_extract_dsi` (vue Oracle exposée en PostgreSQL via FDW), et
// `getCustomGroupMembers` une résolution LDAP batchée côté Hub DSI dont le
// timeout est de 20 s. Empilés en boucle séquentielle sur le chemin de
// connexion (et, pour `isDgOuDirecteur`, sur celui de *chaque* requête), ils
// faisaient dépasser le délai du reverse-proxy nginx en prod — d'où les 504 au
// login. Ces référentiels bougent rarement : on les mémorise quelques minutes,
// et l'admin qui affiche la liste des membres force le rafraîchissement.
const NIVEAU_MEMBERS_TTL_MS = Number(process.env.ACCESS_CACHE_TTL_MS) || 60 * 1000;
const CUSTOM_GROUP_MEMBERS_TTL_MS = Number(process.env.ACCESS_GROUP_CACHE_TTL_MS) || 5 * 60 * 1000;

function stripDiacritics(str) {
  return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Uppercase, sans accents, lettres/espaces seulement — pour comparer un nom
 * saisi côté RH avec un displayName AD sans se faire piéger par la casse,
 * les accents ou une ponctuation différente. */
function normalizeName(str) {
  return stripDiacritics(String(str || '').toUpperCase())
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Même filtre "agent actif" que le magapp (appdsi/backend/modules/rh/encadrants.controller.js).
const ACTIVE_FILTER = `("POSITION_L" LIKE 'Activité%' OR "POSITION_L" LIKE 'Temps partiel%')`;

// Même classification par POSTE_L que le magapp, pour rester cohérent avec
// la liste "Directeurs et Chefs de service" qu'il maintient déjà.
const NIVEAU_DEFS = [
  {
    code: 'dg_dga',
    libelle: 'DG / DGA',
    condition: `"POSTE_L" LIKE 'DIRECTEUR%GENERAL%'`,
  },
  {
    code: 'directeurs',
    libelle: 'Directeurs',
    condition: `"POSTE_L" LIKE 'DIRECTEUR%'
      AND "POSTE_L" NOT LIKE '%GENERAL%'
      AND "POSTE_L" NOT LIKE '%CABINET%'
      AND "POSTE_L" NOT LIKE '%ARTISTIQUE%'
      AND "POSTE_L" NOT LIKE '%MAISON DE QUARTIER%'
      AND "POSTE_L" NOT LIKE '%CRECHE%'
      AND "POSTE_L" NOT LIKE '%MULTI ACCUEIL%'
      AND "POSTE_L" NOT LIKE '%MULTI-ACCUEIL%'
      AND "POSTE_L" NOT LIKE '%RESIDENCES AUTONOMIE%'`,
  },
  {
    code: 'resp_service',
    libelle: 'Resp. service',
    condition: `"POSTE_L" LIKE 'RESPONSABLE DU SERVICE%'`,
  },
];

const niveauMembersCache = createTtlCache({ ttlMs: NIVEAU_MEMBERS_TTL_MS, maxEntries: NIVEAU_DEFS.length });
const customGroupMembersCache = createTtlCache({ ttlMs: CUSTOM_GROUP_MEMBERS_TTL_MS, maxEntries: 64 });

/** Membres d'un niveau RH, mis en cache (cf. commentaire des TTL plus haut).
 *  `fresh: true` court-circuite le cache — réservé à l'affichage admin de la
 *  liste des membres, qui doit refléter l'état courant du référentiel. */
function niveauMembers(code, { fresh = false } = {}) {
  if (fresh) return listNiveauMembers(code);
  return niveauMembersCache.get(code, () => listNiveauMembers(code));
}

async function listNiveauMembers(code) {
  const def = NIVEAU_DEFS.find((d) => d.code === code);
  if (!def) return [];
  return db.all(
    `SELECT "MATRICULE" AS matricule, "NOM" AS nom, "PRENOM" AS prenom, "DIRECTION_L" AS direction, "POSTE_L" AS poste
     FROM oracle.rh_v_extract_dsi
     WHERE ${ACTIVE_FILTER} AND (${def.condition})
     ORDER BY "NOM", "PRENOM"`
  );
}

async function listCustomGroups() {
  return db.all(`SELECT id, name, ad_group_dn, ad_group_cn, description FROM hub.custom_groups ORDER BY name`);
}

/** Vue combinée pour l'admin : les 3 niveaux + les groupes particuliers,
 * avec leur état activé/désactivé. Le compte de membres des niveaux est
 * inclus (requête SQL légère) ; celui des groupes AD ne l'est pas (résolu
 * à la demande via LDAP, plus coûteux). */
async function listGroupsForAdmin() {
  const [enabledRows, customGroups] = await Promise.all([
    db.all(`SELECT kind, ref_code, enabled FROM access_groups`),
    listCustomGroups().catch(() => []), // hub.custom_groups peut être absent selon l'environnement
  ]);
  const enabledMap = new Map(enabledRows.map((r) => [`${r.kind}:${r.ref_code}`, r.enabled]));

  const niveaux = await Promise.all(
    NIVEAU_DEFS.map(async (def) => ({
      kind: 'niveau',
      ref_code: def.code,
      libelle: def.libelle,
      enabled: enabledMap.get(`niveau:${def.code}`) ?? false,
      member_count: (await listNiveauMembers(def.code)).length,
    }))
  );

  const customs = customGroups.map((g) => ({
    kind: 'custom_group',
    ref_code: String(g.id),
    libelle: g.name,
    description: g.description || null,
    enabled: enabledMap.get(`custom_group:${g.id}`) ?? false,
    member_count: null,
  }));

  return [...niveaux, ...customs];
}

async function setEnabled(kind, refCode, enabled, updatedBy) {
  if (!['niveau', 'custom_group'].includes(kind)) throw new Error('kind invalide');
  await db.run(
    `INSERT INTO access_groups (kind, ref_code, enabled, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (kind, ref_code) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [kind, refCode, enabled, updatedBy || null]
  );
}

/** Membres d'un groupe particulier (AD) : LDAP direct si mandat a sa propre
 * config (AD_HOST…), sinon repli sur AppDSI via l'API Hub DSI — AppDSI a
 * toujours sa config AD et sait résoudre aussi bien un groupe de sécurité
 * "local" (ex. Directeurs) qu'un groupe basé sur une liste de diffusion AD
 * (ex. Secrétaires de directions, cf. encadrants.controller.js côté AppDSI),
 * alors que le LDAP direct de mandat est optionnel et souvent pas configuré
 * en prod. Les deux applis partagent la même table hub.custom_groups (même
 * id), donc pas de traduction à faire côté identifiant.
 */
async function getCustomGroupMembers(grp) {
  const ldapAuth = require('./ldapAuth');
  if (ldapAuth.ldapConfigured()) {
    try {
      return await ldapAuth.listGroupMembers(grp.ad_group_dn);
    } catch (err) {
      console.warn('[accessControl] LDAP direct en échec pour', grp.name, '— repli Hub DSI :', err.message);
    }
  }
  const hubdsi = require('./hubdsi');
  const result = await hubdsi.getCustomGroupMembers(grp.id);
  if (result.error) throw new Error(`groupe "${grp.name}" indisponible (LDAP direct non configuré et Hub DSI injoignable : ${result.error})`);
  return (result.data.members || []).map((m) => ({
    sAMAccountName: m.username || null,
    displayName: m.displayName || null,
    mail: m.email || null,
    title: m.title || null,
    direction: m.department || null,
  }));
}

/** Membres d'un groupe particulier, mis en cache (cf. commentaire des TTL
 *  plus haut) : c'est le poste le plus lourd du contrôle d'accès (résolution
 *  LDAP batchée, jusqu'à 20 s de timeout côté Hub DSI) et il était rejoué à
 *  chaque tentative de connexion. `fresh: true` court-circuite le cache pour
 *  l'affichage admin de la liste des membres. */
function customGroupMembers(grp, { fresh = false } = {}) {
  if (fresh) return getCustomGroupMembers(grp);
  return customGroupMembersCache.get(String(grp.id), () => getCustomGroupMembers(grp));
}

async function getGroupMembers(kind, refCode) {
  if (kind === 'niveau') return listNiveauMembers(refCode);
  if (kind === 'custom_group') {
    const grp = await db.get(`SELECT id, ad_group_dn, ad_group_cn, name FROM hub.custom_groups WHERE id = $1`, [refCode]);
    if (!grp) return [];
    return customGroupMembers(grp, { fresh: true });
  }
  return [];
}

/** Un agent d'un niveau donné dont le displayName AD (ex. "CHEVALIER Marc")
 * contient à la fois le NOM et le PRENOM RH (normalisés) est considéré
 * membre — tolère l'ordre et la casse, pas une correspondance exacte. */
async function matchesNiveauByName(code, displayName) {
  if (!displayName) return false;
  const norm = normalizeName(displayName);
  if (!norm) return false;
  const members = await niveauMembers(code);
  return members.some((m) => {
    const nom = normalizeName(m.nom);
    const prenom = normalizeName(m.prenom);
    return nom && prenom && norm.includes(nom) && norm.includes(prenom);
  });
}

/** L'agent appartient-il à un groupe particulier ? Voie directe (DN présent
 * dans memberOf, uniquement via LDAP direct) ou, sinon, repli sur la liste
 * des membres résolue via getCustomGroupMembers (LDAP direct ou Hub DSI) —
 * indispensable pour le parcours APM, où memberOf n'est jamais disponible
 * (sinon aucun groupe particulier ne pourrait jamais matcher, cf. prod où
 * AD_HOST n'est pas configuré). Le rapprochement se fait sur des identifiants
 * fiables (sAMAccountName exact, e-mail, puis displayName normalisé). */
async function matchesCustomGroup(grp, { memberOfDns, username, displayName, email }) {
  if (Array.isArray(memberOfDns) && grp.ad_group_dn && memberOfDns.includes(grp.ad_group_dn)) return true;

  const members = await customGroupMembers(grp).catch((err) => {
    console.warn('[accessControl] membres du groupe', grp.name, 'indisponibles :', err.message);
    return [];
  });
  const uname = String(username || '').toLowerCase().trim();
  const mail = String(email || '').toLowerCase().trim();
  const norm = normalizeName(displayName);
  return members.some((m) => {
    const mUser = String(m.sAMAccountName || '').toLowerCase().trim();
    if (uname && mUser && mUser === uname) return true;
    const mMail = String(m.mail || '').toLowerCase().trim();
    if (mail && mMail && mMail === mail) return true;
    const mNorm = normalizeName(m.displayName);
    return Boolean(norm && mNorm && norm === mNorm);
  });
}

/** Autorise ou non un agent authentifié (les comptes admin locaux sont
 * toujours autorisés, en amont, avant cet appel). Si aucun groupe n'est
 * activé, personne n'est autorisé — verrouillage explicite demandé.
 * @param {object} info
 * @param {string} [info.employeeId] - matricule, fiable seulement via LDAP direct
 * @param {string[]} [info.memberOfDns] - appartenances AD, fiable seulement via LDAP direct
 * @param {string} [info.username] - sAMAccountName, disponible sur les deux parcours
 * @param {string} [info.displayName] - toujours disponible (APM ou LDAP)
 * @param {string} [info.email] - disponible sur les deux parcours
 */
async function isAgentAuthorized({ employeeId, memberOfDns, username, displayName, email }) {
  const enabled = await db.all(`SELECT kind, ref_code FROM access_groups WHERE enabled = true`);
  if (!enabled.length) return false;

  // Les groupes activés sont évalués EN PARALLÈLE : la durée totale est celle
  // du groupe le plus lent, pas la somme de tous. En séquentiel, trois niveaux
  // RH (scan de la vue Oracle via FDW) plus deux groupes particuliers (résolution
  // LDAP, timeout 20 s) dépassent largement le délai du reverse-proxy nginx.
  const verdicts = await Promise.all(
    enabled.map(async (g) => {
      try {
        if (g.kind === 'niveau') {
          const def = NIVEAU_DEFS.find((d) => d.code === g.ref_code);
          if (!def) return false;
          if (employeeId) {
            const row = await db
              .get(
                `SELECT 1 FROM oracle.rh_v_extract_dsi WHERE "MATRICULE" = $1 AND ${ACTIVE_FILTER} AND (${def.condition}) LIMIT 1`,
                [employeeId]
              )
              .catch(() => null);
            if (row) return true;
          }
          return await matchesNiveauByName(def.code, displayName);
        }
        if (g.kind === 'custom_group') {
          const grp = await db
            .get(`SELECT id, ad_group_dn, ad_group_cn, name FROM hub.custom_groups WHERE id = $1`, [g.ref_code])
            .catch(() => null);
          if (!grp) return false;
          return await matchesCustomGroup(grp, { memberOfDns, username, displayName, email });
        }
        return false;
      } catch (err) {
        console.warn(`[accessControl] groupe ${g.kind}:${g.ref_code} non évaluable :`, err.message);
        return false;
      }
    })
  );
  return verdicts.some(Boolean);
}

/** Un DG/DGA ou Directeur a par défaut des droits d'édition sur les
 * engagements et leurs projets enfants (cf. services/permissions.js) —
 * indépendant de l'activation "accès à l'appli" par niveau (ici c'est un
 * droit métier, pas une autorisation de connexion) : on regarde toujours
 * les deux niveaux RH, activés ou non pour la connexion. */
async function isDgOuDirecteur(displayName) {
  return (await matchesNiveauByName('dg_dga', displayName)) || (await matchesNiveauByName('directeurs', displayName));
}

module.exports = { NIVEAU_DEFS, listNiveauMembers, listCustomGroups, listGroupsForAdmin, setEnabled, getGroupMembers, isAgentAuthorized, isDgOuDirecteur };
