-- Journal des mails envoyés par l'appli (alertes quotidiennes, relances
-- manuelles...) — consultable en admin, pour pouvoir vérifier "qu'est-ce qui
-- a été envoyé, à qui, et est-ce que ça a marché".
CREATE TABLE IF NOT EXISTS __SCHEMA__.mail_log (
  id             SERIAL PRIMARY KEY,
  to_email       VARCHAR(255) NOT NULL,
  subject        VARCHAR(500) NOT NULL,
  content        TEXT,
  context        VARCHAR(60),   -- 'alerts_digest' | 'relance' | 'manuel' | 'test' ...
  status         VARCHAR(20) NOT NULL, -- 'ok' | 'error'
  error_message  TEXT,
  sent_by        VARCHAR(120),  -- user_sub si envoyé manuellement depuis l'appli, sinon NULL (job auto)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mail_log_created ON __SCHEMA__.mail_log(created_at DESC);
