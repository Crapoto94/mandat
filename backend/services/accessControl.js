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

async function getGroupMembers(kind, refCode) {
  if (kind === 'niveau') return listNiveauMembers(refCode);
  if (kind === 'custom_group') {
    const grp = await db.get(`SELECT ad_group_dn, ad_group_cn, name FROM hub.custom_groups WHERE id = $1`, [refCode]);
    if (!grp) return [];
    const ldapAuth = require('./ldapAuth');
    return ldapAuth.listGroupMembers(grp.ad_group_dn);
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
  const members = await listNiveauMembers(code);
  return members.some((m) => {
    const nom = normalizeName(m.nom);
    const prenom = normalizeName(m.prenom);
    return nom && prenom && norm.includes(nom) && norm.includes(prenom);
  });
}

/** Autorise ou non un agent authentifié (les comptes admin locaux sont
 * toujours autorisés, en amont, avant cet appel). Si aucun groupe n'est
 * activé, personne n'est autorisé — verrouillage explicite demandé.
 * @param {object} info
 * @param {string} [info.employeeId] - matricule, fiable seulement via LDAP direct
 * @param {string[]} [info.memberOfDns] - appartenances AD, fiable seulement via LDAP direct
 * @param {string} [info.displayName] - toujours disponible (APM ou LDAP) : repli pour les niveaux RH
 */
async function isAgentAuthorized({ employeeId, memberOfDns, displayName }) {
  const enabled = await db.all(`SELECT kind, ref_code FROM access_groups WHERE enabled = true`);
  if (!enabled.length) return false;

  for (const g of enabled) {
    if (g.kind === 'niveau') {
      const def = NIVEAU_DEFS.find((d) => d.code === g.ref_code);
      if (!def) continue;
      if (employeeId) {
        const row = await db
          .get(
            `SELECT 1 FROM oracle.rh_v_extract_dsi WHERE "MATRICULE" = $1 AND ${ACTIVE_FILTER} AND (${def.condition}) LIMIT 1`,
            [employeeId]
          )
          .catch(() => null);
        if (row) return true;
      }
      if (await matchesNiveauByName(def.code, displayName).catch(() => false)) return true;
    } else if (g.kind === 'custom_group' && Array.isArray(memberOfDns)) {
      const grp = await db.get(`SELECT ad_group_dn FROM hub.custom_groups WHERE id = $1`, [g.ref_code]).catch(() => null);
      if (grp && memberOfDns.includes(grp.ad_group_dn)) return true;
    }
  }
  return false;
}

module.exports = { NIVEAU_DEFS, listNiveauMembers, listCustomGroups, listGroupsForAdmin, setEnabled, getGroupMembers, isAgentAuthorized };
