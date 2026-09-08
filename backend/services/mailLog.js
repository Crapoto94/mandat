// Enveloppe apm.sendMail() d'une journalisation systématique (table
// mail_log) — pour pouvoir répondre en admin à "qu'est-ce qui a été envoyé,
// à qui, et est-ce que ça a marché". apm.js reste un client API pur (aucun
// accès DB) : la journalisation est une préoccupation applicative, pas une
// préoccupation d'intégration APM — d'où ce module séparé plutôt qu'ajouté
// directement dans services/apm.js.
const { db } = require('../db/pg_db');
const apm = require('./apm');

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.content
 * @param {string} [opts.context] - 'alerts_digest' | 'relance' | 'manuel' | 'test'...
 * @param {string} [opts.sentBy] - user_sub si envoi manuel depuis l'appli
 */
async function sendMailLogged({ to, subject, content, context, sentBy, ...rest }) {
  try {
    const result = await apm.sendMail({ to, subject, content, ...rest });
    await logEntry({ to, subject, content, context, sentBy, status: 'ok' });
    return result;
  } catch (err) {
    await logEntry({ to, subject, content, context, sentBy, status: 'error', errorMessage: err.message });
    throw err;
  }
}

async function logEntry({ to, subject, content, context, sentBy, status, errorMessage }) {
  await db
    .run(
      `INSERT INTO mail_log (to_email, subject, content, context, status, error_message, sent_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [to, subject, content || null, context || null, status, errorMessage || null, sentBy || null]
    )
    .catch((err) => console.warn('[mailLog] échec de journalisation :', err.message));
}

module.exports = { sendMailLogged };
