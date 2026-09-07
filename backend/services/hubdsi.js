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

    const code = node.code || node.sigle || node.acronyme || node.abbreviation || node.short_name;
    const libelle = node.libelle || node.nom || node.name || node.designation || node.label;
    if (code && libelle) {
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
