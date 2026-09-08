// Récapitulatif quotidien des alertes : chaque agent abonné à un engagement
// (bouton "cloche", cf. modules/engagements/alerts.routes.js) reçoit en fin
// de journée UN mail groupant tous les engagements suivis ayant eu une
// "nouveauté" (au sens de DERNIERE_ACTIVITE_EXPR — modification directe,
// commentaire, étape, pièce jointe) depuis la dernière notif reçue.
//
// Pas de dépendance à un scheduler externe (node-cron...) : un simple
// setInterval réveillé toutes les 5 minutes vérifie si l'heure configurée
// est atteinte et si le récapitulatif du jour n'a pas déjà été envoyé
// (table alert_digest_runs, un run par date — protège aussi contre un
// redémarrage du serveur en cours de journée).
const { db } = require('../db/pg_db');
const { sendMailLogged } = require('../services/mailLog');
const { DERNIERE_ACTIVITE_EXPR } = require('../modules/engagements/engagements.service');

const DIGEST_HOUR = Number(process.env.ALERTS_DIGEST_HOUR ?? 18);
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || process.env.CORS_ORIGIN || '').replace(/\/$/, '');

function engagementUrl(id) {
  return APP_PUBLIC_URL ? `${APP_PUBLIC_URL}/engagements/${id}` : `/engagements/${id}`;
}

// Mêmes libellés que frontend/src/lib/fieldLabels.ts (pas de code partagé
// entre front et back ici — dupliqué volontairement plutôt que de faire
// dépendre le job d'un build frontend).
const FIELD_LABELS = {
  etat_code: "l'état d'avancement",
  meteo_code: 'la météo',
  description_avancement: 'la description du point atteint',
  prochaines_etapes: 'les prochaines étapes',
  roles_precises: 'les rôles précisés',
  axe: "l'axe du projet",
  contenu: "le nom de l'engagement",
  pilotage: 'le pilotage',
  contribution_elaboration: "la contribution à l'élaboration",
  contribution_impactees: 'les directions impactées',
  echeance: "l'échéance",
  continu: 'le caractère continu (tout au long du mandat)',
  groupe_id: 'le groupe de travail',
  prioritaire_plenaire: 'le marquage prioritaire plénière',
};

/** Ce qui a concrètement changé sur un engagement depuis `since` — pour que
 * le mail dise "quoi", pas seulement "quelque chose a changé". */
async function describeChanges(engagementId, since) {
  const [fieldsChanged, commentCount, stepCount, attachmentCount] = await Promise.all([
    db.all(`SELECT DISTINCT champ FROM engagement_history WHERE engagement_id = $1 AND changed_at > $2`, [
      engagementId,
      since,
    ]),
    db.get(`SELECT COUNT(*)::int AS n FROM comments WHERE engagement_id = $1 AND created_at > $2`, [
      engagementId,
      since,
    ]),
    db.get(
      `SELECT COUNT(*)::int AS n FROM engagement_steps WHERE engagement_id = $1 AND GREATEST(created_at, updated_at) > $2`,
      [engagementId, since]
    ),
    db.get(
      `SELECT COUNT(*)::int AS n FROM engagement_attachments WHERE engagement_id = $1 AND created_at > $2 AND deleted_at IS NULL`,
      [engagementId, since]
    ),
  ]);

  const changes = fieldsChanged.map((f) => `${FIELD_LABELS[f.champ] || f.champ} modifié(e)`);
  if (commentCount.n) changes.push(commentCount.n === 1 ? '1 nouveau commentaire' : `${commentCount.n} nouveaux commentaires`);
  if (stepCount.n) changes.push(stepCount.n === 1 ? '1 étape ajoutée ou modifiée' : `${stepCount.n} étapes ajoutées ou modifiées`);
  if (attachmentCount.n)
    changes.push(attachmentCount.n === 1 ? '1 pièce jointe ajoutée' : `${attachmentCount.n} pièces jointes ajoutées`);
  return changes;
}

/** Engagements suivis ayant eu de l'activité depuis la dernière notif de
 * chaque abonné, groupés par utilisateur, avec le détail de ce qui a changé
 * pour chacun. */
async function collectNouveautesByUser() {
  const rows = await db.all(
    `SELECT ea.id AS alert_id, ea.engagement_id, ea.user_sub, ea.user_email, ea.user_display_name,
            ea.created_at, ea.last_notified_at,
            e.numero, e.contenu, et.libelle AS etat_libelle,
            ${DERNIERE_ACTIVITE_EXPR} AS derniere_activite
     FROM engagement_alerts ea
     JOIN engagements e ON e.id = ea.engagement_id
     LEFT JOIN etats et ON et.code = e.etat_code
     WHERE ${DERNIERE_ACTIVITE_EXPR} > COALESCE(ea.last_notified_at, ea.created_at)
       AND ea.user_email IS NOT NULL
     ORDER BY ea.user_sub, e.numero ASC`
  );

  const byUser = new Map();
  for (const row of rows) {
    const since = row.last_notified_at || row.created_at;
    row.changes = await describeChanges(row.engagement_id, since);

    if (!byUser.has(row.user_sub)) {
      byUser.set(row.user_sub, {
        email: row.user_email,
        displayName: row.user_display_name || row.user_sub,
        items: [],
        alertIds: [],
      });
    }
    const bucket = byUser.get(row.user_sub);
    bucket.items.push(row);
    bucket.alertIds.push(row.alert_id);
  }
  return byUser;
}

function buildEmailContent(displayName, items) {
  const rows = items
    .map(
      (it) => `<li style="margin-bottom:10px;">
        <a href="${engagementUrl(it.engagement_id)}" style="color:#0055A4;text-decoration:none;font-weight:600;">
          Engagement n°${it.numero}
        </a> — ${escapeHtml(it.contenu)}
        ${
          it.changes?.length
            ? `<br/><span style="color:#334155;font-size:13px;">Modifié : ${it.changes.map(escapeHtml).join(', ')}</span>`
            : ''
        }
        ${it.etat_libelle ? `<br/><span style="color:#64748b;font-size:12px;">État actuel : ${escapeHtml(it.etat_libelle)}</span>` : ''}
      </li>`
    )
    .join('\n');
  return `<p>Bonjour ${escapeHtml(displayName)},</p>
    <p>Voici les engagements que vous suivez ayant eu de nouveaux éléments aujourd'hui :</p>
    <ul style="padding-left:18px;">${rows}</ul>
    <p style="color:#94a3b8;font-size:12px;">
      Vous recevez ce mail car vous vous êtes abonné(e) aux alertes de ces engagements (cloche sur la liste des
      engagements). Vous pouvez vous désabonner à tout moment depuis l'application.
    </p>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function digestSubject(count) {
  return count === 1
    ? `Suivi mandat — 1 nouveauté sur un engagement suivi`
    : `Suivi mandat — ${count} nouveautés sur vos engagements suivis`;
}

async function sendDigestForUser(userSub, bucket) {
  await sendMailLogged({
    to: bucket.email,
    subject: digestSubject(bucket.items.length),
    content: buildEmailContent(bucket.displayName, bucket.items),
    context: 'alerts_digest',
  });
  await db.run(`UPDATE engagement_alerts SET last_notified_at = now() WHERE id = ANY($1)`, [bucket.alertIds]);
}

/** Envoie le récapitulatif à tous les abonnés concernés. N'échoue jamais
 * globalement sur l'échec d'un envoi individuel (agent avec mail invalide,
 * APM temporairement indisponible...) — chaque utilisateur est indépendant. */
async function runDigest() {
  const byUser = await collectNouveautesByUser();
  if (!byUser.size) {
    console.log('[alertsDigest] rien à notifier aujourd\'hui.');
    return;
  }
  let sent = 0;
  let failed = 0;
  for (const [userSub, bucket] of byUser) {
    try {
      await sendDigestForUser(userSub, bucket);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[alertsDigest] échec d'envoi pour ${userSub} :`, err.message);
    }
  }
  console.log(`[alertsDigest] terminé — ${sent} mail(s) envoyé(s), ${failed} échec(s).`);
}

/** Réclame atomiquement le run du jour (évite un double envoi si plusieurs
 * ticks tombent dans la fenêtre, ou après un redémarrage le même jour). */
async function claimTodayRun() {
  const row = await db.get(
    `INSERT INTO alert_digest_runs (run_date) VALUES (current_date) ON CONFLICT DO NOTHING RETURNING run_date`
  );
  return !!row;
}

async function tick() {
  const hour = new Date().getHours();
  if (hour < DIGEST_HOUR) return;
  try {
    const claimed = await claimTodayRun();
    if (!claimed) return; // déjà envoyé aujourd'hui
    await runDigest();
  } catch (err) {
    console.error('[alertsDigest] erreur inattendue :', err.message);
  }
}

/** Exemple de récapitulatif, avec des engagements fictifs — pour permettre à
 * un admin de vérifier le rendu réel (via le template mail de l'APM) sans
 * attendre l'envoi automatique du soir ni dépendre de vraies données. */
async function sendExampleDigest({ to, displayName }) {
  const items = [
    {
      engagement_id: 1,
      numero: 12,
      contenu: 'Créer une maison des associations, point de rendez-vous de la vie associative ivryenne.',
      etat_libelle: 'En cours',
      changes: ["l'état d'avancement modifié(e)", '1 nouveau commentaire'],
    },
    {
      engagement_id: 2,
      numero: 27,
      contenu: 'Favoriser les mobilités actives et développer un plan vélo ambitieux.',
      etat_libelle: 'Partiellement réalisé',
      changes: ['la météo modifié(e)', 'la description du point atteint modifié(e)', '1 étape ajoutée ou modifiée'],
    },
    {
      engagement_id: 3,
      numero: 41,
      contenu: "Ouvrir un budget participatif pour les projets d'initiative citoyenne.",
      etat_libelle: 'À lancer',
      changes: ['1 pièce jointe ajoutée'],
    },
  ];
  return sendMailLogged({
    to,
    subject: `[Exemple] ${digestSubject(items.length)}`,
    content:
      `<p style="color:#b45309;background:#fffbeb;padding:8px 12px;border-radius:6px;">
        Ceci est un exemple généré à la demande, avec des engagements fictifs — pas un vrai récapitulatif.
      </p>` + buildEmailContent(displayName, items),
    context: 'test',
  });
}

function start() {
  // Un premier check peu après le démarrage (utile si le serveur redémarre
  // après l'heure cible un jour où le run n'a pas encore eu lieu), puis à
  // intervalle régulier.
  setTimeout(tick, 30 * 1000);
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log(`[alertsDigest] planifié — vérification toutes les 5 min, envoi après ${DIGEST_HOUR}h.`);
}

module.exports = { start, runDigest, sendExampleDigest };
