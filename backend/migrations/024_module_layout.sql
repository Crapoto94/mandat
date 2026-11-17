-- Disposition des modules ("widgets") d'une fiche engagement ou projet :
-- activé/désactivé et position, réglable indépendamment sur chaque fiche
-- (glisser-déposer côté front). Une absence de ligne pour un module donné
-- vaut "activé, position par défaut" — pas besoin de pré-remplir toutes les
-- fiches existantes.
CREATE TABLE IF NOT EXISTS __SCHEMA__.module_layout (
  id            SERIAL PRIMARY KEY,
  engagement_id INTEGER REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  projet_id     INTEGER REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  module_key    VARCHAR(60) NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  position      INTEGER NOT NULL DEFAULT 0,
  updated_by    VARCHAR(255),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT module_layout_owner_exclusive CHECK ((engagement_id IS NOT NULL)::int + (projet_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_module_layout_unique_engagement ON __SCHEMA__.module_layout(engagement_id, module_key) WHERE engagement_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_module_layout_unique_projet ON __SCHEMA__.module_layout(projet_id, module_key) WHERE projet_id IS NOT NULL;
