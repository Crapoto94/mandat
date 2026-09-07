-- Conserve la hiérarchie Direction → Service du référentiel Hub DSI
-- (parent_code NULL = direction de premier niveau ; sinon code de la
-- direction parente), pour un affichage groupé côté admin. Pas de contrainte
-- de clé étrangère : c'est un cache, mieux vaut tolérer un parent absent
-- qu'échouer toute la synchro sur un ordre d'insertion imparfait.
ALTER TABLE __SCHEMA__.hubdsi_referentiel
  ADD COLUMN IF NOT EXISTS parent_code VARCHAR(120);
