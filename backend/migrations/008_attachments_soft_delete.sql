-- Suppression douce des pièces jointes : "supprimer" ne fait que masquer le
-- fichier (deleted_at renseigné), il reste visible/restaurable en corbeille
-- côté admin. Le fichier sur disque n'est jamais touché par une suppression
-- normale — seule la purge définitive (admin) le retire réellement.
ALTER TABLE __SCHEMA__.engagement_attachments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);
