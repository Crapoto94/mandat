// Abonnements aux alertes "nouveautés" : chaque agent choisit, engagement
// par engagement, s'il veut recevoir un mail récapitulatif en fin de
// journée quand il y a eu de l'activité (cf. jobs/alertsDigest.js pour
// l'envoi effectif). Monté à part (/api/alerts) plutôt que sous
// /api/engagements pour ne pas entrer en collision avec /engagements/mine
// ("Mes engagements" par direction).
const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

/** Tous les engagements auxquels l'utilisateur courant est abonné — un seul
 * appel pour initialiser l'état des cloches sur la page liste, plutôt qu'un
 * GET par engagement. */
router.get('/mine', requireAuth, async (req, res) => {
  const rows = await db.all(`SELECT engagement_id FROM engagement_alerts WHERE user_sub = $1`, [req.user.sub]);
  res.json(rows.map((r) => r.engagement_id));
});

/** Abonne l'utilisateur courant aux alertes de cet engagement (upsert, avec
 * mail/nom à jour à chaque (ré)abonnement — utile si l'agent a changé de
 * mail entre-temps). */
router.post('/:id', requireAuth, async (req, res) => {
  const engagement = await db.get(`SELECT id FROM engagements WHERE id = $1`, [req.params.id]);
  if (!engagement) return res.status(404).json({ error: 'Engagement introuvable' });

  if (!req.user.email) {
    return res.status(400).json({
      error: "Aucune adresse mail connue pour ce compte — l'alerte ne pourrait pas être envoyée.",
    });
  }

  await db.run(
    `INSERT INTO engagement_alerts (engagement_id, user_sub, user_email, user_display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (engagement_id, user_sub) DO UPDATE SET
       user_email = EXCLUDED.user_email,
       user_display_name = EXCLUDED.user_display_name`,
    [req.params.id, req.user.sub, req.user.email, req.user.displayName || req.user.sub]
  );
  res.status(201).json({ subscribed: true });
});

/** Désabonne l'utilisateur courant. */
router.delete('/:id', requireAuth, async (req, res) => {
  await db.run(`DELETE FROM engagement_alerts WHERE engagement_id = $1 AND user_sub = $2`, [
    req.params.id,
    req.user.sub,
  ]);
  res.status(204).end();
});

module.exports = router;
