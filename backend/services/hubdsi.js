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

// Repli si aucun des endpoints dédiés ne répond : plusieurs formes possibles
// selon la version du Hub DSI / le scope de la clé (le nom exact n'est pas
// garanti par la doc) — on essaie dans l'ordre, un seul niveau de hiérarchie.
const DIRECTIONS_FALLBACK_PATHS = ['/api/directions-services', '/api/admin/rh/services-tree', '/api/admin/rh/hierarchy'];

/**
 * Organisation Ville (DGA → directions → services → secteurs), lecture
 * seule — maîtrisée par le Hub DSI. Trois stratégies, dans l'ordre :
 *  1. `/api/admin/rh/organisation-chart` : l'arbre complet en un seul appel,
 *     parcouru récursivement en conservant le fil parent→enfant à tous les
 *     niveaux (DGA/direction/service/secteur).
 *  2. À défaut, `/api/consumable/org-directions` puis
 *     `/api/consumable/org-services/:directionCode` pour chaque direction
 *     (deux niveaux : direction → services, éventuellement plus si la
 *     réponse "services" est elle-même imbriquée).
 *  3. À défaut, les anciens candidats à plat (un seul niveau).
 */
async function getDirectionsServices() {
  const chartResult = await hub('/api/admin/rh/organisation-chart');
  if (!chartResult.error) {
    const tree = normalizeDirections(chartResult.data);
    if (tree.length) return { data: tree, structured: true };
  }

  const dirsResult = await hub('/api/consumable/org-directions');
  if (!dirsResult.error) {
    const directions = normalizeDirections(dirsResult.data);
    if (directions.length) {
      const seen = new Set(directions.map((d) => d.code.toUpperCase()));
      const all = directions.map((d) => ({ ...d, parentCode: null }));

      for (const direction of directions) {
        const servicesResult = await hub(`/api/consumable/org-services/${encodeURIComponent(direction.code)}`);
        if (servicesResult.error) continue;
        // Racine du sous-arbre = la direction : les enfants directs héritent
        // de son code comme parent, les niveaux plus profonds (secteurs)
        // gardent leur propre parent au sein de ce sous-arbre.
        for (const service of normalizeDirections(servicesResult.data, direction.code)) {
          const key = service.code.toUpperCase();
          // Certaines réponses "services" réincluent la direction elle-même
          // en tête de liste : on l'ignore (déjà présente, sans parent).
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(service);
        }
      }
      return { data: all, structured: true };
    }
  }

  let lastError = chartResult.error || dirsResult.error || 'Aucun endpoint testé';
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
 * Normalise une réponse Hub DSI (organigramme potentiellement imbriqué sur
 * plusieurs niveaux — DGA > direction > service > secteur —, sous des noms
 * de champs non garantis) en paires {code, libelle, parentCode} : parcourt
 * récursivement toute la structure en gardant le fil du dernier nœud
 * "valide" rencontré comme parent des suivants, peu importe le nom des
 * clés qui les portent. `rootParentCode` fixe le parent du premier niveau
 * (utile quand on normalise un sous-arbre déjà rattaché à une direction).
 */
function normalizeDirections(raw, rootParentCode = null) {
  const found = [];
  const seen = new Set();

  function visit(node, parentCode) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, parentCode));
      return;
    }

    const libelle = node.libelle || node.nom || node.name || node.designation || node.label;
    // Une hiérarchie RH mélange souvent unités organisationnelles ET agents :
    // on écarte tout nœud qui ressemble à une fiche personne (des directions
    // n'ont pas de matricule/email/poste), pour ne garder que les directions,
    // services et secteurs.
    const looksLikePerson = node.matricule || node.email || node.mail || node.poste || node.fonction || node.telephone;
    // Une hiérarchie RH n'a pas forcément de sigle distinct du nom : à
    // défaut, le nom sert aussi de clé (le champ "code" n'est ici qu'un
    // identifiant unique pour le cache, pas censé matcher nos sigles).
    const code = node.code || node.sigle || node.acronyme || node.abbreviation || node.short_name || libelle;
    // Le Hub DSI renvoie aussi des codes courts sans rapport avec des
    // directions/services (codes budgétaires type "BB", "BF"...) : un nom
    // complet de direction/service/secteur fait toujours plus de quelques lettres.
    const looksLikeShortCode = typeof libelle === 'string' && libelle.trim().length <= 4;

    let ownCode = null;
    if (code && libelle && typeof libelle === 'string' && !looksLikePerson && !looksLikeShortCode) {
      ownCode = String(code).trim();
      const key = ownCode.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ code: ownCode, libelle: String(libelle).trim(), parentCode: parentCode || null });
      }
    }

    // Descend dans toute sous-structure (organigramme = direction > services
    // > secteurs > ...), quel que soit le nom du champ qui la porte ; les
    // enfants héritent de CE nœud comme parent (ou du parent hérité si ce
    // nœud n'était pas lui-même valide, ex. un simple tableau/wrapper).
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') visit(value, ownCode || parentCode);
    }
  }

  visit(raw, rootParentCode);
  return found;
}

module.exports = { hubConfigured, getDirectionsServices, getElus, normalizeDirections };
