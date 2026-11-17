-- Généralise la base documentaire (jusqu'ici propre aux projets, tables
-- projet_folders/projet_documents/...) pour qu'elle serve identiquement aux
-- engagements — mêmes tables, même module (cf. modules/documents/). Tables
-- neuves plutôt qu'un renommage : le backend actuellement déployé lit
-- encore les tables projet_* sous leur nom d'origine, qui doivent donc
-- rester intactes jusqu'au déploiement du nouveau code. Une fois ce
-- déploiement fait et vérifié, les tables projet_* pourront être
-- supprimées dans une migration ultérieure — pas ici.

CREATE TABLE IF NOT EXISTS __SCHEMA__.doc_folders (
  id            SERIAL PRIMARY KEY,
  projet_id     INTEGER REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  engagement_id INTEGER REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES __SCHEMA__.doc_folders(id) ON DELETE CASCADE,
  nom           VARCHAR(255) NOT NULL,
  created_by    VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT doc_folders_owner_exclusive CHECK ((projet_id IS NOT NULL)::int + (engagement_id IS NOT NULL)::int = 1)
);
CREATE INDEX IF NOT EXISTS idx_doc_folders_projet ON __SCHEMA__.doc_folders(projet_id);
CREATE INDEX IF NOT EXISTS idx_doc_folders_engagement ON __SCHEMA__.doc_folders(engagement_id);
CREATE INDEX IF NOT EXISTS idx_doc_folders_parent ON __SCHEMA__.doc_folders(parent_id);

CREATE TABLE IF NOT EXISTS __SCHEMA__.doc_documents (
  id             SERIAL PRIMARY KEY,
  projet_id      INTEGER REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  engagement_id  INTEGER REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  folder_id      INTEGER REFERENCES __SCHEMA__.doc_folders(id) ON DELETE CASCADE,
  stored_name    VARCHAR(255) NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  display_name   VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(120),
  size_bytes     INTEGER,
  version        INTEGER NOT NULL DEFAULT 1,
  metadata       JSONB NOT NULL DEFAULT '{}',
  uploaded_by    VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  deleted_by     VARCHAR(255),
  CONSTRAINT doc_documents_owner_exclusive CHECK ((projet_id IS NOT NULL)::int + (engagement_id IS NOT NULL)::int = 1)
);
CREATE INDEX IF NOT EXISTS idx_doc_documents_projet ON __SCHEMA__.doc_documents(projet_id);
CREATE INDEX IF NOT EXISTS idx_doc_documents_engagement ON __SCHEMA__.doc_documents(engagement_id);
CREATE INDEX IF NOT EXISTS idx_doc_documents_folder ON __SCHEMA__.doc_documents(folder_id);

CREATE TABLE IF NOT EXISTS __SCHEMA__.doc_document_versions (
  id            SERIAL PRIMARY KEY,
  document_id   INTEGER NOT NULL REFERENCES __SCHEMA__.doc_documents(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(120),
  size_bytes    INTEGER,
  uploaded_by   VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_document_versions_doc ON __SCHEMA__.doc_document_versions(document_id);

CREATE TABLE IF NOT EXISTS __SCHEMA__.doc_metadata_fields (
  id            SERIAL PRIMARY KEY,
  projet_id     INTEGER REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  engagement_id INTEGER REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  cle           VARCHAR(60) NOT NULL,
  libelle       VARCHAR(255) NOT NULL,
  type          VARCHAR(20) NOT NULL DEFAULT 'texte',
  options       JSONB,
  ordre         INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT doc_metadata_fields_owner_exclusive CHECK ((projet_id IS NOT NULL)::int + (engagement_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_metadata_fields_unique_projet ON __SCHEMA__.doc_metadata_fields(projet_id, cle) WHERE projet_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_metadata_fields_unique_engagement ON __SCHEMA__.doc_metadata_fields(engagement_id, cle) WHERE engagement_id IS NOT NULL;

-- Reprend les données existantes de la GED "projets" — copie, la source
-- n'est pas touchée (cf. commentaire d'en-tête). Les nouvelles lignes
-- gardent le même stored_name : les fichiers eux-mêmes sont copiés sur
-- disque par la migration suivante (022b, .js), qui a besoin de ces id
-- pour construire sa correspondance ancien->nouveau document.
INSERT INTO __SCHEMA__.doc_folders (id, projet_id, parent_id, nom, created_by, created_at)
SELECT id, projet_id, parent_id, nom, created_by, created_at FROM __SCHEMA__.projet_folders;
SELECT setval(pg_get_serial_sequence('__SCHEMA__.doc_folders', 'id'), COALESCE((SELECT MAX(id) FROM __SCHEMA__.doc_folders), 1));

INSERT INTO __SCHEMA__.doc_documents (id, projet_id, folder_id, stored_name, original_name, display_name, mime_type, size_bytes, version, metadata, uploaded_by, created_at, deleted_at, deleted_by)
SELECT id, projet_id, folder_id, stored_name, original_name, display_name, mime_type, size_bytes, version, metadata, uploaded_by, created_at, deleted_at, deleted_by FROM __SCHEMA__.projet_documents;
SELECT setval(pg_get_serial_sequence('__SCHEMA__.doc_documents', 'id'), COALESCE((SELECT MAX(id) FROM __SCHEMA__.doc_documents), 1));

INSERT INTO __SCHEMA__.doc_document_versions (id, document_id, version, stored_name, mime_type, size_bytes, uploaded_by, created_at)
SELECT id, document_id, version, stored_name, mime_type, size_bytes, uploaded_by, created_at FROM __SCHEMA__.projet_document_versions;
SELECT setval(pg_get_serial_sequence('__SCHEMA__.doc_document_versions', 'id'), COALESCE((SELECT MAX(id) FROM __SCHEMA__.doc_document_versions), 1));

INSERT INTO __SCHEMA__.doc_metadata_fields (id, projet_id, cle, libelle, type, options, ordre)
SELECT id, projet_id, cle, libelle, type, options, ordre FROM __SCHEMA__.projet_metadata_fields;
SELECT setval(pg_get_serial_sequence('__SCHEMA__.doc_metadata_fields', 'id'), COALESCE((SELECT MAX(id) FROM __SCHEMA__.doc_metadata_fields), 1));
