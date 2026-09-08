// Édition collaborative : verrous légers par (engagement, champ), avec
// présence visible ("X est en cours de modification"). Basé sur un
// heartbeat périodique côté frontend — pas de WebSocket, un polling GET
// suffit pour cet usage (peu d'utilisateurs simultanés, pas de besoin de
// latence sub-seconde).
const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// Un verrou sans heartbeat depuis ce délai est considéré abandonné (session
// fermée, crash...) : n'importe qui peut alors le reprendre.
const LOCK_TIMEOUT_SECONDS = 30;

async function purgeStale(engagementId) {
  await db.run(
    `DELETE FROM field_locks WHERE engagement_id = $1 AND last_heartbeat_at < now() - interval '${LOCK_TIMEOUT_SECONDS} seconds'`,
    [engagementId]
  );
}

/** Verrous actifs sur un engagement — pour que TOUS les viewers affichent qui édite quoi. */
router.get('/:id/locks', requireAuth, async (req, res) => {
  await purgeStale(req.params.id);
  const rows = await db.all(
    `SELECT champ, user_sub, display_name, started_at FROM field_locks WHERE engagement_id = $1`,
    [req.params.id]
  );
  res.json(rows);
});

/** Prend ou renouvelle (heartbeat) le verrou d'un champ. 409 si détenu par quelqu'un d'autre. */
router.post('/:id/locks/:champ', requireAuth, async (req, res) => {
  await purgeStale(req.params.id);
  const userSub = req.user.sub;
  const displayName = req.user.displayName || req.user.sub;

  const existing = await db.get(`SELECT * FROM field_locks WHERE engagement_id = $1 AND champ = $2`, [
    req.params.id,
    req.params.champ,
  ]);

  if (existing && existing.user_sub !== userSub) {
    return res.status(409).json({
      error: `${existing.display_name} modifie déjà ce champ`,
      holder: { display_name: existing.display_name, started_at: existing.started_at },
    });
  }

  const row = await db.get(
    `INSERT INTO field_locks (engagement_id, champ, user_sub, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (engagement_id, champ) DO UPDATE SET last_heartbeat_at = now(), display_name = EXCLUDED.display_name
     RETURNING *`,
    [req.params.id, req.params.champ, userSub, displayName]
  );
  res.json(row);
});

/** Libère un verrou (fin d'édition normale — blur, sauvegarde, fermeture). */
router.delete('/:id/locks/:champ', requireAuth, async (req, res) => {
  await db.run(`DELETE FROM field_locks WHERE engagement_id = $1 AND champ = $2 AND user_sub = $3`, [
    req.params.id,
    req.params.champ,
    req.user.sub,
  ]);
  res.status(204).end();
});

module.exports = router;
