// Module d'accès à l'API métier Hub DSI (référentiels Ville, scope `ville`).
// Jeton totalement distinct de l'APM — cf. guide §4. Utilisé ici uniquement
// en lecture, pour enrichir le référentiel des directions si disponible.
const axios = require('axios');

const HUB_URL = process.env.HUBDSI_API_URL;
const HUB_KEY = process.env.HUBDSI_API_KEY;

function hubConfigured() {
  return Boolean(HUB_URL && HUB_KEY);
}

async function hub(path) {
  if (!hubConfigured()) return null;
  try {
    const { data } = await axios.get(`${HUB_URL}${path}`, {
      headers: { 'X-API-Key': HUB_KEY },
      timeout: 8000,
    });
    return data;
  } catch (err) {
    console.warn('[HubDSI]', path, 'a échoué -', err.message);
    return null;
  }
}

/** Organisation Ville (directions / services), lecture seule — maîtrisée par le Hub DSI. */
async function getDirectionsServices() {
  return hub('/api/directions-services');
}

async function getElus() {
  return hub('/api/ville/elus');
}

/**
 * Normalise la réponse (forme non documentée avec certitude) en paires
 * {code, libelle} : accepte un tableau direct ou un objet enveloppant
 * (data/results/directions/services), et plusieurs noms de champs possibles.
 */
function normalizeDirections(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : raw.data || raw.results || raw.directions || raw.services || raw.items || [];
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      const code = item.code || item.sigle || item.acronyme || item.abbreviation || item.short_name;
      const libelle = item.libelle || item.nom || item.name || item.designation || item.label;
      return code && libelle ? { code: String(code).trim(), libelle: String(libelle).trim() } : null;
    })
    .filter(Boolean);
}

module.exports = { hubConfigured, getDirectionsServices, getElus, normalizeDirections };
