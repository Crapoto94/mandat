-- REX Canicule : retour d'expérience collaboratif des CODIR sur la canicule
-- 2026, sur le modèle du suivi des engagements du mandat.
--
-- Structure (miroir du tableau "Canicules 2026 - tableau REX") :
--   partie (1..3) > thématique > sujet (constat / ce qui a fonctionné / ce qui
--   est à améliorer / mesures 2027 / pilotage / décision)
-- + des actions à réaliser (liables aux engagements du mandat), des réflexes
-- communs (que chaque direction valide ou amende), le suivi des travaux
-- confort d'été/hiver, des commentaires et un journal des modifications.
--
-- Aucune table existante n'est modifiée : les liens vers le mandat passent
-- par une table de jointure vers "engagements".

CREATE TABLE IF NOT EXISTS __SCHEMA__.rex_thematiques (
  id           SERIAL PRIMARY KEY,
  partie       SMALLINT NOT NULL CHECK (partie BETWEEN 1 AND 3),
  ordre        INTEGER NOT NULL DEFAULT 0,
  titre        VARCHAR(255) NOT NULL,
  description  TEXT,
  created_by   VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rex_thematiques_titre ON __SCHEMA__.rex_thematiques(partie, titre);

CREATE TABLE IF NOT EXISTS __SCHEMA__.rex_sujets (
  id             SERIAL PRIMARY KEY,
  thematique_id  INTEGER NOT NULL REFERENCES __SCHEMA__.rex_thematiques(id) ON DELETE CASCADE,
  ordre          INTEGER NOT NULL DEFAULT 0,
  libelle        VARCHAR(500) NOT NULL,
  constat        TEXT,
  a_fonctionne   TEXT,
  a_ameliorer    TEXT,
  mesures        TEXT,
  pilotage       VARCHAR(500),
  decision       TEXT,
  statut         VARCHAR(30) NOT NULL DEFAULT 'a_discuter'
                 CHECK (statut IN ('a_discuter', 'a_arbitrer', 'valide', 'en_oeuvre', 'realise')),
  origine        VARCHAR(20) NOT NULL DEFAULT 'saisie' CHECK (origine IN ('tableau', 'cr', 'saisie')),
  created_by     VARCHAR(255),
  updated_by     VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rex_sujets_thematique ON __SCHEMA__.rex_sujets(thematique_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rex_sujets_unique ON __SCHEMA__.rex_sujets(thematique_id, libelle);

-- Actions à réaliser. `origine` distingue ce qui vient du compte rendu ('cr'),
-- ce qui a été déduit de l'analyse des documents ('analyse', à confirmer par
-- le pilote) et ce que les membres saisissent eux-mêmes ('saisie').
CREATE TABLE IF NOT EXISTS __SCHEMA__.rex_actions (
  id               SERIAL PRIMARY KEY,
  sujet_id         INTEGER REFERENCES __SCHEMA__.rex_sujets(id) ON DELETE SET NULL,
  titre            VARCHAR(500) NOT NULL,
  description      TEXT,
  pilote_direction VARCHAR(255),
  pilote_nom       VARCHAR(255),
  pilote_sub       VARCHAR(120),
  echeance         DATE,
  echeance_texte   VARCHAR(255),
  statut           VARCHAR(20) NOT NULL DEFAULT 'a_faire'
                   CHECK (statut IN ('a_faire', 'en_cours', 'fait', 'abandonne')),
  priorite         VARCHAR(10) NOT NULL DEFAULT 'normale' CHECK (priorite IN ('normale', 'haute')),
  origine          VARCHAR(20) NOT NULL DEFAULT 'saisie' CHECK (origine IN ('cr', 'analyse', 'saisie')),
  created_by       VARCHAR(255),
  updated_by       VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rex_actions_sujet ON __SCHEMA__.rex_actions(sujet_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rex_actions_unique ON __SCHEMA__.rex_actions(sujet_id, titre) WHERE sujet_id IS NOT NULL;

-- Réflexes communs : ce que TOUTES les directions font à un moment donné
-- (préparation, vigilance jaune/orange/rouge, après l'épisode).
CREATE TABLE IF NOT EXISTS __SCHEMA__.rex_reflexes (
  id           SERIAL PRIMARY KEY,
  moment       VARCHAR(20) NOT NULL
               CHECK (moment IN ('preparation', 'veille', 'orange', 'rouge', 'apres')),
  ordre        INTEGER NOT NULL DEFAULT 0,
  titre        VARCHAR(500) NOT NULL,
  description  TEXT,
  responsable  VARCHAR(500),
  delai        VARCHAR(120),
  sujet_id     INTEGER REFERENCES __SCHEMA__.rex_sujets(id) ON DELETE SET NULL,
  statut       VARCHAR(20) NOT NULL DEFAULT 'propose' CHECK (statut IN ('propose', 'valide', 'a_revoir')),
  origine      VARCHAR(20) NOT NULL DEFAULT 'saisie' CHECK (origine IN ('cr', 'analyse', 'saisie')),
  created_by   VARCHAR(255),
  updated_by   VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rex_reflexes_unique ON __SCHEMA__.rex_reflexes(moment, titre);

-- Liens vers les engagements du mandat (un sujet OU une action, jamais les deux).
CREATE TABLE IF NOT EXISTS __SCHEMA__.rex_engagement_links (
  id             SERIAL PRIMARY KEY,
  sujet_id       INTEGER REFERENCES __SCHEMA__.rex_sujets(id) ON DELETE CASCADE,
  action_id      INTEGER REFERENCES __SCHEMA__.rex_actions(id) ON DELETE CASCADE,
  engagement_id  INTEGER NOT NULL REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  motif          TEXT,
  created_by     VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rex_links_owner_exclusive CHECK ((sujet_id IS NOT NULL)::int + (action_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rex_links_sujet ON __SCHEMA__.rex_engagement_links(sujet_id, engagement_id) WHERE sujet_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rex_links_action ON __SCHEMA__.rex_engagement_links(action_id, engagement_id) WHERE action_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rex_links_engagement ON __SCHEMA__.rex_engagement_links(engagement_id);

-- Positionnement d'une direction (via un de ses agents) sur un sujet, une
-- action ou un réflexe : "d'accord" / "sous réserve" / "pas d'accord".
-- Un agent = une position par cible (modifiable).
CREATE TABLE IF NOT EXISTS __SCHEMA__.rex_positions (
  id            SERIAL PRIMARY KEY,
  cible_type    VARCHAR(10) NOT NULL CHECK (cible_type IN ('sujet', 'action', 'reflexe')),
  cible_id      INTEGER NOT NULL,
  user_sub      VARCHAR(120) NOT NULL,
  display_name  VARCHAR(255),
  direction     VARCHAR(120),
  position      VARCHAR(10) NOT NULL CHECK (position IN ('accord', 'reserve', 'desaccord')),
  commentaire   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cible_type, cible_id, user_sub)
);
CREATE INDEX IF NOT EXISTS idx_rex_positions_cible ON __SCHEMA__.rex_positions(cible_type, cible_id);

-- Fil de discussion. `cible_type` 'thematique' porte les observations du
-- compte rendu de réunion (is_cr = true, importées).
CREATE TABLE IF NOT EXISTS __SCHEMA__.rex_comments (
  id                SERIAL PRIMARY KEY,
  cible_type        VARCHAR(12) NOT NULL CHECK (cible_type IN ('thematique', 'sujet', 'action', 'reflexe')),
  cible_id          INTEGER NOT NULL,
  author_name       VARCHAR(255) NOT NULL,
  author_direction  VARCHAR(120),
  author_sub        VARCHAR(120),
  body              TEXT NOT NULL,
  is_cr             BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rex_comments_cible ON __SCHEMA__.rex_comments(cible_type, cible_id);

-- Journal des modifications (qui a changé quoi) — alimente aussi le fil d'activité.
CREATE TABLE IF NOT EXISTS __SCHEMA__.rex_history (
  id               SERIAL PRIMARY KEY,
  cible_type       VARCHAR(12) NOT NULL,
  cible_id         INTEGER NOT NULL,
  champ            VARCHAR(60) NOT NULL,
  ancienne_valeur  TEXT,
  nouvelle_valeur  TEXT,
  changed_by       VARCHAR(255),
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rex_history_cible ON __SCHEMA__.rex_history(cible_type, cible_id);
CREATE INDEX IF NOT EXISTS idx_rex_history_date ON __SCHEMA__.rex_history(changed_at DESC);

-- Travaux de confort d'été / d'hiver (tableau "Travaux confort été et hiver 2026").
CREATE TABLE IF NOT EXISTS __SCHEMA__.rex_travaux (
  id               SERIAL PRIMARY KEY,
  saison           VARCHAR(5) NOT NULL DEFAULT 'ete' CHECK (saison IN ('ete', 'hiver')),
  categorie        VARCHAR(255),
  equipement       VARCHAR(255) NOT NULL,
  nature           TEXT NOT NULL,
  date_realisation DATE,
  date_texte       VARCHAR(120),
  nb_brasseurs     INTEGER NOT NULL DEFAULT 0,
  nb_ventilateurs  INTEGER NOT NULL DEFAULT 0,
  observations     TEXT,
  created_by       VARCHAR(255),
  updated_by       VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rex_travaux_unique ON __SCHEMA__.rex_travaux(saison, equipement, nature, COALESCE(date_texte, ''), COALESCE(date_realisation, DATE '1900-01-01'));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rex_thematiques', 'rex_sujets', 'rex_actions', 'rex_reflexes', 'rex_travaux', 'rex_positions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON __SCHEMA__.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON __SCHEMA__.%1$s FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.set_updated_at()', t);
  END LOOP;
END $$;
