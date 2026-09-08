-- Abonnements aux alertes "nouveautés" par engagement, par utilisateur —
-- chaque agent choisit les engagements qu'il veut suivre ; un job (cf.
-- backend/jobs/alertsDigest.js) envoie en fin de journée un mail récapitulatif
-- des engagements suivis ayant eu de l'activité depuis la dernière notif.
CREATE TABLE IF NOT EXISTS __SCHEMA__.engagement_alerts (
  id                 SERIAL PRIMARY KEY,
  engagement_id      INTEGER NOT NULL REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  user_sub           VARCHAR(120) NOT NULL,
  user_email         VARCHAR(255),
  user_display_name  VARCHAR(255),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_notified_at   TIMESTAMPTZ,
  UNIQUE (engagement_id, user_sub)
);
CREATE INDEX IF NOT EXISTS idx_engagement_alerts_user ON __SCHEMA__.engagement_alerts(user_sub);

-- Garde-fou pour n'envoyer le récapitulatif quotidien qu'une seule fois par
-- jour, même en cas de redémarrage du serveur en cours de journée.
CREATE TABLE IF NOT EXISTS __SCHEMA__.alert_digest_runs (
  run_date  DATE PRIMARY KEY,
  ran_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
