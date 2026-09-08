-- Demandes et signalements de bug depuis la page "Nouveautés" — visibles
-- uniquement en admin (cf. modules/feedback/feedback.routes.js).
CREATE TABLE IF NOT EXISTS __SCHEMA__.feedback (
  id            SERIAL PRIMARY KEY,
  type          VARCHAR(20) NOT NULL DEFAULT 'demande', -- 'bug' | 'demande'
  titre         VARCHAR(255) NOT NULL,
  description   TEXT,
  page_url      VARCHAR(500),
  submitted_by  VARCHAR(120),
  submitted_by_name VARCHAR(255),
  statut        VARCHAR(20) NOT NULL DEFAULT 'nouveau',  -- 'nouveau' | 'traite'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  treated_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON __SCHEMA__.feedback(created_at DESC);
