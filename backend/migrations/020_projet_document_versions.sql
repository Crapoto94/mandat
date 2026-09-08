-- Déposer un fichier du même nom (dans le même dossier) crée une nouvelle
-- version du document existant plutôt qu'un doublon — l'ancienne version
-- reste accessible (fichier conservé sur disque, jamais écrasé).
ALTER TABLE __SCHEMA__.projet_documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS __SCHEMA__.projet_document_versions (
  id            SERIAL PRIMARY KEY,
  document_id   INTEGER NOT NULL REFERENCES __SCHEMA__.projet_documents(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(120),
  size_bytes    INTEGER,
  uploaded_by   VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projet_document_versions_doc ON __SCHEMA__.projet_document_versions(document_id);
