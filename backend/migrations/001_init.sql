-- Suivi des engagements du mandat — schéma dédié `mandat`
-- Convention Ville : un schéma = une application, tables préfixées par le schéma.

CREATE SCHEMA IF NOT EXISTS mandat;

-- ---------------------------------------------------------------------------
-- Référentiels
-- ---------------------------------------------------------------------------

-- États d'avancement possibles (liste fermée, reprise de la feuille "Feuil2"
-- du fichier de suivi original). L'ordre sert à l'affichage (colonnes kanban).
CREATE TABLE IF NOT EXISTS mandat.etats (
  code        VARCHAR(40) PRIMARY KEY,
  libelle     VARCHAR(80) NOT NULL,
  ordre       INTEGER NOT NULL,
  couleur     VARCHAR(20) NOT NULL DEFAULT '#64748b'
);

INSERT INTO mandat.etats (code, libelle, ordre, couleur) VALUES
  ('a_lancer',                 'À lancer',                    1, '#94a3b8'),
  ('en_cours',                 'En cours',                    2, '#0055A4'),
  ('en_attente_arbitrage',     'En attente d''arbitrage',     3, '#f59e0b'),
  ('partiellement_realise',    'Partiellement réalisé',       4, '#8b5cf6'),
  ('realise',                  'Réalisé',                     5, '#16a34a')
ON CONFLICT (code) DO NOTHING;

-- Groupes de travail CODIR (3 groupes, cf. répartition transmise)
CREATE TABLE IF NOT EXISTS mandat.groupes (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(10) UNIQUE NOT NULL,      -- G1, G2, G3
  nom         VARCHAR(255) NOT NULL,
  directions  TEXT[] NOT NULL DEFAULT '{}',      -- codes directions membres du groupe
  ordre       INTEGER NOT NULL DEFAULT 0
);

-- Directions / services (référentiel simple ; peut être enrichi plus tard
-- depuis l'API Hub DSI `GET /api/directions-services` quand le jeton dsk_
-- sera disponible — cf. services/hubdsi.js).
CREATE TABLE IF NOT EXISTS mandat.directions (
  code        VARCHAR(40) PRIMARY KEY,
  libelle     VARCHAR(255)
);

-- Répartition des groupes de travail CODIR (cf. consigne de répartition transmise).
INSERT INTO mandat.groupes (code, nom, directions, ordre) VALUES
  ('G1', 'Groupe 1', ARRAY['DDAC', 'DCCAS', 'DRH', 'DAJCP'], 1),
  ('G2', 'Groupe 2', ARRAY['DEP', 'DAC', 'DBC', 'DSPORT'], 2),
  ('G3', 'Groupe 3', ARRAY['DDU', 'DCOM', 'DJEUN', 'DSALE', 'DSI'], 3)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Comptes de secours (admin local) — indépendants de l'Active Directory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mandat.admin_users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(80) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(255),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Cache léger des agents authentifiés via l'AD (facultatif, évite de
-- re-solliciter l'annuaire à chaque affichage ; TTL géré côté appli).
CREATE TABLE IF NOT EXISTS mandat.agents_cache (
  username      VARCHAR(120) PRIMARY KEY,
  display_name  VARCHAR(255),
  email         VARCHAR(255),
  mobile        VARCHAR(40),
  direction     VARCHAR(120),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Engagements du mandat
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mandat.engagements (
  id                          SERIAL PRIMARY KEY,
  numero                      INTEGER UNIQUE NOT NULL,      -- numéro d'origine (1..55)
  axe                         VARCHAR(500) NOT NULL,
  contenu                     TEXT NOT NULL,
  pilotage                    VARCHAR(255),                 -- texte libre, ex "DDAC+DAJCP"
  contribution_elaboration    VARCHAR(500),
  contribution_impactees      VARCHAR(500),
  echeance                    VARCHAR(255),

  etat_code                   VARCHAR(40) NOT NULL DEFAULT 'a_lancer' REFERENCES mandat.etats(code),
  description_avancement      TEXT,
  prochaines_etapes           TEXT,
  roles_precises              TEXT,                          -- clarification des rôles / répartition (champ ajouté)

  groupe_id                   INTEGER REFERENCES mandat.groupes(id),  -- NULL = hors groupe (ex: engagement piloté par le Cabinet)

  prioritaire_plenaire        BOOLEAN NOT NULL DEFAULT false,
  prioritaire_note            TEXT,

  updated_by                  VARCHAR(255),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagements_groupe ON mandat.engagements(groupe_id);
CREATE INDEX IF NOT EXISTS idx_engagements_etat ON mandat.engagements(etat_code);
CREATE INDEX IF NOT EXISTS idx_engagements_axe ON mandat.engagements(axe);

-- Historique des modifications (traçabilité — plusieurs contributeurs sans
-- permissions granulaires, l'audit trail permet de savoir qui a changé quoi).
CREATE TABLE IF NOT EXISTS mandat.engagement_history (
  id             SERIAL PRIMARY KEY,
  engagement_id  INTEGER NOT NULL REFERENCES mandat.engagements(id) ON DELETE CASCADE,
  champ          VARCHAR(80) NOT NULL,
  ancienne_valeur TEXT,
  nouvelle_valeur TEXT,
  changed_by     VARCHAR(255),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_engagement ON mandat.engagement_history(engagement_id);

-- Fil de commentaires par engagement
CREATE TABLE IF NOT EXISTS mandat.comments (
  id             SERIAL PRIMARY KEY,
  engagement_id  INTEGER NOT NULL REFERENCES mandat.engagements(id) ON DELETE CASCADE,
  author_name    VARCHAR(255) NOT NULL,
  author_direction VARCHAR(120),
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_engagement ON mandat.comments(engagement_id);

-- ---------------------------------------------------------------------------
-- Sujets de coordination transversaux (peuvent dépasser un seul engagement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mandat.coordination_topics (
  id             SERIAL PRIMARY KEY,
  titre          VARCHAR(255) NOT NULL,
  description    TEXT,
  statut         VARCHAR(30) NOT NULL DEFAULT 'en_discussion'
                 CHECK (statut IN ('a_trancher', 'en_discussion', 'regle')),
  directions_concernees TEXT[] NOT NULL DEFAULT '{}',
  created_by     VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mandat.coordination_topic_engagements (
  topic_id       INTEGER NOT NULL REFERENCES mandat.coordination_topics(id) ON DELETE CASCADE,
  engagement_id  INTEGER NOT NULL REFERENCES mandat.engagements(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, engagement_id)
);

-- Trigger simple : maintenir updated_at à jour sur engagements / coordination_topics
CREATE OR REPLACE FUNCTION mandat.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_engagements_updated_at ON mandat.engagements;
CREATE TRIGGER trg_engagements_updated_at BEFORE UPDATE ON mandat.engagements
  FOR EACH ROW EXECUTE FUNCTION mandat.set_updated_at();

DROP TRIGGER IF EXISTS trg_coordination_updated_at ON mandat.coordination_topics;
CREATE TRIGGER trg_coordination_updated_at BEFORE UPDATE ON mandat.coordination_topics
  FOR EACH ROW EXECUTE FUNCTION mandat.set_updated_at();
