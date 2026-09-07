// Module unique d'accès à l'API centrale APM (services transverses Ville).
// Toute la mutualisation mail / SMS / AD passe par ici — on ne réimplémente
// jamais ces intégrations ailleurs dans l'appli (cf. guide §3).
const axios = require('axios');

const APM_URL = process.env.APM_API_URL || 'https://api.ivry.local';
const APM_KEY = process.env.APM_API_KEY;

function headers() {
  return { 'X-API-KEY': APM_KEY };
}

function apmConfigured() {
  return Boolean(APM_KEY);
}

/** Authentifie un agent Ville (bind LDAP) via l'AD. Permission requise : ad_auth. */
async function authenticateAgent(username, password) {
  if (!apmConfigured()) {
    return { success: false, error: 'APM non configuré (APM_API_KEY manquant)' };
  }
  try {
    const { data } = await axios.post(
      `${APM_URL}/api/v1/ad/authenticate`,
      { username, password },
      { headers: headers(), timeout: 8000 }
    );
    return data; // { success: true, dn: "CN=..." }
  } catch (err) {
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

/** Récupère les infos d'un agent (mail, direction, mobile...). Permission : ad_read. */
async function getAgent(identifier) {
  if (!apmConfigured()) return null;
  try {
    const { data } = await axios.get(`${APM_URL}/api/v1/ad/user`, {
      params: { identifier },
      headers: headers(),
      timeout: 8000,
    });
    return data;
  } catch (err) {
    console.warn('[APM] ad/user a échoué pour', identifier, '-', err.message);
    return null;
  }
}

/** Recherche d'agents par nom. Permission : ad_search. */
async function searchAgents(q) {
  if (!apmConfigured()) return [];
  try {
    const { data } = await axios.get(`${APM_URL}/api/v1/ad/search`, {
      params: { q },
      headers: headers(),
      timeout: 8000,
    });
    return data?.results || data || [];
  } catch (err) {
    console.warn('[APM] ad/search a échoué pour', q, '-', err.message);
    return [];
  }
}

/** Envoi de mail (habillé du template institutionnel côté APM). Permission : mail_send. */
async function sendMail({ to, subject, content, footer1, footer2, footer3, footerColor, ...rest }) {
  if (!apmConfigured()) {
    throw new Error('APM non configuré (APM_API_KEY manquant)');
  }
  const { data } = await axios.post(
    `${APM_URL}/api/v1/mail/send`,
    {
      to,
      subject,
      content,
      footer1: footer1 || 'Ville d’Ivry-sur-Seine',
      footer2: footer2 || 'Suivi des engagements du mandat',
      footer3: footer3 || 'mandat@ivry94.fr',
      footerColor: footerColor || '#0055A4',
      ...rest,
    },
    { headers: headers(), timeout: 15000 }
  );
  return data;
}

/** Envoi de SMS. Permission : sms_send. */
async function sendSms({ mobile, message }) {
  if (!apmConfigured()) {
    throw new Error('APM non configuré (APM_API_KEY manquant)');
  }
  const { data } = await axios.post(
    `${APM_URL}/api/v1/sms/send`,
    { mobile, message },
    { headers: headers(), timeout: 10000 }
  );
  return data;
}

/** Ping léger pour le endpoint de santé (n'utilise pas de crédit d'appel métier). */
async function status() {
  if (!apmConfigured()) return { configured: false, reachable: false };
  try {
    await axios.get(`${APM_URL}/api/status`, { timeout: 4000 });
    return { configured: true, reachable: true };
  } catch (err) {
    return { configured: true, reachable: false, error: err.message };
  }
}

module.exports = {
  apmConfigured,
  authenticateAgent,
  getAgent,
  searchAgents,
  sendMail,
  sendSms,
  status,
};
