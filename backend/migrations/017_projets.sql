-- Projets : un engagement du mandat peut se décliner en plusieurs projets
-- (ou aucun), chacun avec son propre suivi. Un projet peut aussi exister
-- seul, sans engagement — pour un usage général par les services. L'accès
-- à un projet est réservé à ses membres (+ admin) : premier mécanisme de
-- permission de l'appli, différent du reste (engagements visibles de tous).
CREATE TABLE IF NOT EXISTS __SCHEMA__.projets (
  id             SERIAL PRIMARY KEY,
  engagement_id  INTEGER REFERENCES __SCHEMA__.engagements(id) ON DELETE SET NULL,
  nom            VARCHAR(255) NOT NULL,
  description    TEXT,
  axe            VARCHAR(500),
  etat_code      VARCHAR(40) NOT NULL DEFAULT 'a_lancer' REFERENCES __SCHEMA__.etats(code),
  meteo_code     VARCHAR(20) REFERENCES __SCHEMA__.meteos(code),
  echeance       VARCHAR(255),
  continu        BOOLEAN NOT NULL DEFAULT false,
  pilotage       VARCHAR(500),
  created_by     VARCHAR(255),
  updated_by     VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projets_engagement ON __SCHEMA__.projets(engagement_id);

DROP TRIGGER IF EXISTS trg_projets_updated_at ON __SCHEMA__.projets;
CREATE TRIGGER trg_projets_updated_at BEFORE UPDATE ON __SCHEMA__.projets
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.set_updated_at();

-- Membres : déterminent qui peut voir/modifier la page dédiée du projet.
CREATE TABLE IF NOT EXISTS __SCHEMA__.projet_membres (
  id            SERIAL PRIMARY KEY,
  projet_id     INTEGER NOT NULL REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  user_sub      VARCHAR(120) NOT NULL,
  display_name  VARCHAR(255),
  direction     VARCHAR(255),
  role          VARCHAR(60),  -- libre (ex: "Pilote", "Membre") — pas de catalogue pour l'instant
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by      VARCHAR(120),
  UNIQUE (projet_id, user_sub)
);
CREATE INDEX IF NOT EXISTS idx_projet_membres_user ON __SCHEMA__.projet_membres(user_sub);

CREATE TABLE IF NOT EXISTS __SCHEMA__.projet_steps (
  id            SERIAL PRIMARY KEY,
  projet_id     INTEGER NOT NULL REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  date_etape    DATE,
  description   TEXT NOT NULL,
  created_by    VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projet_steps_projet ON __SCHEMA__.projet_steps(projet_id);

CREATE TABLE IF NOT EXISTS __SCHEMA__.projet_comments (
  id                SERIAL PRIMARY KEY,
  projet_id         INTEGER NOT NULL REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  author_name       VARCHAR(255) NOT NULL,
  author_direction  VARCHAR(120),
  author_sub        VARCHAR(120),
  body              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_projet_comments_projet ON __SCHEMA__.projet_comments(projet_id);

CREATE TABLE IF NOT EXISTS __SCHEMA__.projet_history (
  id                SERIAL PRIMARY KEY,
  projet_id         INTEGER NOT NULL REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  champ             VARCHAR(60) NOT NULL,
  ancienne_valeur   TEXT,
  nouvelle_valeur   TEXT,
  changed_by        VARCHAR(255),
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projet_history_projet ON __SCHEMA__.projet_history(projet_id);
