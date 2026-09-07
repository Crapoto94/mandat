-- Table de concordance des directions : le sigle (extrait des engagements)
-- est déjà en base (colonne code) ; on ajoute la possibilité de lui associer
-- un nom complet, soit saisi manuellement en admin, soit synchronisé depuis
-- le référentiel Hub DSI (GET /api/directions-services).
ALTER TABLE __SCHEMA__.directions
  ADD COLUMN IF NOT EXISTS libelle_manuel BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
