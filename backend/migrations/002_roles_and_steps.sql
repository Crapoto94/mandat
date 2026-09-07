-- Rôles assignables à un agent sur un engagement, et étapes datées
-- (remplace l'usage du champ libre "prochaines_etapes" par une timeline
-- structurée, par engagement et globale).

-- Catalogue des rôles, paramétrable en admin (ex: Référent, Contributeur,
-- Décisionnaire...).
CREATE TABLE IF NOT EXISTS __SCHEMA__.roles (
  id       SERIAL PRIMARY KEY,
  libelle  VARCHAR(120) UNIQUE NOT NULL,
  ordre    INTEGER NOT NULL DEFAULT 0
);

INSERT INTO __SCHEMA__.roles (libelle, ordre) VALUES
  ('Référent', 1),
  ('Contributeur', 2),
  ('Décisionnaire', 3),
  ('Point de contact direction', 4)
ON CONFLICT (libelle) DO NOTHING;

-- Rôles assignés : un agent (identifié via l'AD si possible, sinon saisie
-- libre) tient un rôle donné sur un engagement.
CREATE TABLE IF NOT EXISTS __SCHEMA__.engagement_roles (
  id                  SERIAL PRIMARY KEY,
  engagement_id       INTEGER NOT NULL REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  role_id             INTEGER NOT NULL REFERENCES __SCHEMA__.roles(id) ON DELETE RESTRICT,
  agent_username      VARCHAR(120),           -- identifiant AD si trouvé via la recherche
  agent_display_name  VARCHAR(255) NOT NULL,
  agent_direction     VARCHAR(120),
  created_by          VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagement_roles_engagement ON __SCHEMA__.engagement_roles(engagement_id);

-- Étapes datées d'un engagement (timeline). Remplace l'usage du champ libre
-- "prochaines_etapes" ; celui-ci reste en base (non détruit) mais n'est
-- plus l'interface principale côté UI.
CREATE TABLE IF NOT EXISTS __SCHEMA__.engagement_steps (
  id             SERIAL PRIMARY KEY,
  engagement_id  INTEGER NOT NULL REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  date_etape     DATE,
  description    TEXT NOT NULL,
  created_by     VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagement_steps_engagement ON __SCHEMA__.engagement_steps(engagement_id);
CREATE INDEX IF NOT EXISTS idx_engagement_steps_date ON __SCHEMA__.engagement_steps(date_etape);

DROP TRIGGER IF EXISTS trg_engagement_steps_updated_at ON __SCHEMA__.engagement_steps;
CREATE TRIGGER trg_engagement_steps_updated_at BEFORE UPDATE ON __SCHEMA__.engagement_steps
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.set_updated_at();
