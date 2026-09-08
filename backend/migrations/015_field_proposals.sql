-- Propositions de modification sur les champs Pilotage / Contribution —
-- élaboration / Contribution — directions-fonctions impactées : un agent
-- non-admin propose une valeur, affichée en attente (couleur dédiée côté
-- front) jusqu'à validation ou rejet par un admin (pour le moment ; le
-- workflow pourra être délégué aux pilotes plus tard). Un admin qui modifie
-- ces champs le fait directement, sans passer par une proposition.
CREATE TABLE IF NOT EXISTS __SCHEMA__.field_proposals (
  id                SERIAL PRIMARY KEY,
  engagement_id     INTEGER NOT NULL REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  champ             VARCHAR(60) NOT NULL,
  valeur_actuelle   TEXT,
  valeur_proposee   TEXT NOT NULL,
  proposed_by       VARCHAR(120),
  proposed_by_name  VARCHAR(255),
  statut            VARCHAR(20) NOT NULL DEFAULT 'en_attente', -- 'en_attente' | 'validee' | 'rejetee'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by       VARCHAR(120),
  reviewed_at       TIMESTAMPTZ
);

-- Une seule proposition en attente par (engagement, champ) à la fois — une
-- nouvelle proposition sur le même champ met à jour celle déjà en attente
-- plutôt que d'en empiler une seconde.
CREATE UNIQUE INDEX IF NOT EXISTS idx_field_proposals_pending
  ON __SCHEMA__.field_proposals(engagement_id, champ) WHERE statut = 'en_attente';
CREATE INDEX IF NOT EXISTS idx_field_proposals_engagement ON __SCHEMA__.field_proposals(engagement_id);
