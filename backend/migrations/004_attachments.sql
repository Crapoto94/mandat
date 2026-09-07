-- Fichiers joints à un engagement (documents, images collées dans l'éditeur
-- de la description...). Les fichiers eux-mêmes sont stockés hors du code,
-- sur disque (dossier dédié, cf. backend/modules/attachments), seule la
-- métadonnée est en base.
CREATE TABLE IF NOT EXISTS __SCHEMA__.engagement_attachments (
  id             SERIAL PRIMARY KEY,
  engagement_id  INTEGER NOT NULL REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  stored_name    VARCHAR(255) NOT NULL,   -- nom du fichier sur disque (aléatoire, non devinable)
  original_name  VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(120),
  size_bytes     INTEGER,
  uploaded_by    VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_engagement ON __SCHEMA__.engagement_attachments(engagement_id);
