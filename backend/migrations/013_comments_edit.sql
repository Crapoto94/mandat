-- Permet à un agent de modifier ses propres commentaires : il faut pouvoir
-- identifier l'auteur de façon fiable (author_name est un libellé
-- d'affichage, pas un identifiant) et savoir si un commentaire a été
-- modifié après coup.
ALTER TABLE __SCHEMA__.comments
  ADD COLUMN IF NOT EXISTS author_sub VARCHAR(120),
  ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ;
