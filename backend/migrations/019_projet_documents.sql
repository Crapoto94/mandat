-- Base documentaire par projet — dossiers, sous-dossiers, fichiers,
-- métadonnées personnalisées définies par projet. Se comporte comme un
-- lecteur réseau : navigation par dossier, dépôt de fichiers (ou d'un zip,
-- qui recrée l'arborescence), renommage, métadonnées libres.
CREATE TABLE IF NOT EXISTS __SCHEMA__.projet_folders (
  id          SERIAL PRIMARY KEY,
  projet_id   INTEGER NOT NULL REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  parent_id   INTEGER REFERENCES __SCHEMA__.projet_folders(id) ON DELETE CASCADE,
  nom         VARCHAR(255) NOT NULL,
  created_by  VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projet_folders_projet ON __SCHEMA__.projet_folders(projet_id);
CREATE INDEX IF NOT EXISTS idx_projet_folders_parent ON __SCHEMA__.projet_folders(parent_id);

CREATE TABLE IF NOT EXISTS __SCHEMA__.projet_documents (
  id             SERIAL PRIMARY KEY,
  projet_id      INTEGER NOT NULL REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  folder_id      INTEGER REFERENCES __SCHEMA__.projet_folders(id) ON DELETE CASCADE,
  stored_name    VARCHAR(255) NOT NULL,   -- nom sur disque (aléatoire, non devinable)
  original_name  VARCHAR(255) NOT NULL,   -- nom d'origine tel que déposé (jamais modifié)
  display_name   VARCHAR(255) NOT NULL,   -- nom affiché/renommable — par défaut, original sans extension
  mime_type      VARCHAR(120),
  size_bytes     INTEGER,
  metadata       JSONB NOT NULL DEFAULT '{}',
  uploaded_by    VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  deleted_by     VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_projet_documents_projet ON __SCHEMA__.projet_documents(projet_id);
CREATE INDEX IF NOT EXISTS idx_projet_documents_folder ON __SCHEMA__.projet_documents(folder_id);

-- Schéma des métadonnées : défini par projet (paramétrage), appliqué à ses documents.
CREATE TABLE IF NOT EXISTS __SCHEMA__.projet_metadata_fields (
  id         SERIAL PRIMARY KEY,
  projet_id  INTEGER NOT NULL REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  cle        VARCHAR(60) NOT NULL,
  libelle    VARCHAR(255) NOT NULL,
  type       VARCHAR(20) NOT NULL DEFAULT 'texte', -- 'texte' | 'date' | 'liste'
  options    JSONB, -- liste des valeurs possibles si type = 'liste'
  ordre      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (projet_id, cle)
);
