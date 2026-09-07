// Module d'accès à l'API métier Hub DSI (référentiels Ville, scope `ville`).
// Jeton totalement distinct de l'APM — cf. guide §4. Utilisé ici uniquement
// en lecture, pour enrichir le référentiel des directions si disponible.
const axios = require('axios');

const HUB_URL = process.env.HUBDSI_API_URL;
const HUB_KEY = process.env.HUBDSI_API_KEY;

function hubConfigured() {
  return Boolean(HUB_URL && HUB_KEY);
}

/**
 * Retourne { data } en cas de succès, ou { error } avec le message exact
 * (timeout, DNS, refus de connexion, statut HTTP...) — remonté tel quel côté
 * admin plutôt qu'un message générique, pour diagnostiquer sans avoir à
 * consulter les logs du conteneur.
 */
async function hub(path) {
  if (!hubConfigured()) return { error: 'Hub DSI non configuré (HUBDSI_API_URL / HUBDSI_API_KEY manquants)' };
  try {
    const { data } = await axios.get(`${HUB_URL}${path}`, {
      headers: { 'X-API-Key': HUB_KEY },
      timeout: 8000,
    });
    return { data };
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status} ${JSON.stringify(err.response.data).slice(0, 200)}`
      : err.code || err.message;
    console.warn('[HubDSI]', path, 'a échoué -', detail);
    return { error: `${err.message} (${detail}) — URL appelée : ${HUB_URL}${path}` };
  }
}

// Repli si l'endpoint dédié (ci-dessous) est indisponible : plusieurs formes
// possibles selon la version du Hub DSI / le scope de la clé (le nom exact
// n'est pas garanti par la doc) — on essaie dans l'ordre.
const DIRECTIONS_FALLBACK_PATHS = [
  '/api/directions-services',
  '/api/admin/rh/organisation-chart',
  '/api/admin/rh/services-tree',
  '/api/admin/rh/hierarchy',
];

/**
 * Organisation Ville (directions / services), lecture seule — maîtrisée par
 * le Hub DSI. Passe d'abord par l'API dédiée en deux temps : liste des
 * directions, puis services de chacune (`/api/consumable/org-directions` +
 * `/api/consumable/org-services/:directionCode`) — plus fiable que
 * l'organigramme RH générique, repli si indisponible.
 */
async function getDirectionsServices() {
  const dirsResult = await hub('/api/consumable/org-directions');
  if (!dirsResult.error) {
    const directions = normalizeDirections(dirsResult.data);
    if (directions.length) {
      const all = [...directions];
      for (const { code } of directions) {
        const servicesResult = await hub(`/api/consumable/org-services/${encodeURIComponent(code)}`);
        if (!servicesResult.error) all.push(...normalizeDirections(servicesResult.data));
      }
      return { data: all };
    }
  }

  let lastError = dirsResult.error || 'Aucun endpoint testé';
  for (const path of DIRECTIONS_FALLBACK_PATHS) {
    const result = await hub(path);
    if (!result.error) return result;
    lastError = result.error;
  }
  return { error: lastError };
}

async function getElus() {
  return hub('/api/ville/elus');
}

/**
 * Normalise la réponse `/api/directions-services` (un organigramme —
 * hiérarchie de la Ville, potentiellement imbriquée sur plusieurs niveaux
 * direction → services, sous des noms de champs non garantis) en paires
 * {code, libelle} : parcourt récursivement toute la structure, à tous les
 * niveaux, qu'il s'agisse d'une direction ou d'un service — peu importe le
 * nom de la clé qui les contient. Le nom complet retenu est celui du
 * référentiel Hub DSI, tel quel.
 */
function normalizeDirections(raw) {
  const found = [];
  const seen = new Set();

  function visit(node) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const libelle = node.libelle || node.nom || node.name || node.designation || node.label;
    // Une hiérarchie RH mélange souvent unités organisationnelles ET agents :
    // on écarte tout nœud qui ressemble à une fiche personne (des directions
    // n'ont pas de matricule/email/poste), pour ne garder que les directions
    // et services.
    const looksLikePerson = node.matricule || node.email || node.mail || node.poste || node.fonction || node.telephone;
    // Une hiérarchie RH n'a pas forcément de sigle distinct du nom : à
    // défaut, le nom sert aussi de clé (le champ "code" n'est ici qu'un
    // identifiant unique pour le cache, pas censé matcher nos sigles).
    const code = node.code || node.sigle || node.acronyme || node.abbreviation || node.short_name || libelle;
    if (code && libelle && typeof libelle === 'string' && !looksLikePerson) {
      const key = String(code).trim().toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ code: String(code).trim(), libelle: String(libelle).trim() });
      }
    }

    // Descend dans toute sous-structure (organigramme = direction > services > ...),
    // quel que soit le nom du champ qui la porte.
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') visit(value);
    }
  }

  visit(raw);
  return found;
}

module.exports = { hubConfigured, getDirectionsServices, getElus, normalizeDirections };
