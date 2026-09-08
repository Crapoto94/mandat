-- Restriction d'accès à l'application par groupe (en plus des comptes
-- admin, toujours autorisés) : DG/DGA, Directeurs, Resp. service (dérivés
-- de oracle.rh_v_extract_dsi) + groupes particuliers (hub.custom_groups,
-- groupes AD nommés, déjà maintenus par le magapp — jamais dupliqués ici,
-- juste référencés par id). N'a d'effet que sur le parcours de connexion
-- LDAP direct (cf. services/ldapAuth.js + services/accessControl.js) : sans
-- AD_HOST configuré, aucune restriction n'est appliquée (comportement
-- actuel inchangé).
CREATE TABLE IF NOT EXISTS __SCHEMA__.access_groups (
  id          SERIAL PRIMARY KEY,
  kind        VARCHAR(20) NOT NULL,   -- 'niveau' | 'custom_group'
  ref_code    VARCHAR(60) NOT NULL,   -- niveau: 'dg_dga'/'directeurs'/'resp_service' ; custom_group: id de hub.custom_groups
  enabled     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  VARCHAR(120),
  UNIQUE (kind, ref_code)
);

-- Les 3 niveaux de la demande initiale, activés par défaut — pour qu'activer
-- le LDAP direct (AD_HOST) ne verrouille pas immédiatement tout le monde
-- dehors : DG/DGA, Directeurs et Resp. service gardent l'accès tant qu'un
-- admin n'a pas explicitement reconfiguré la liste depuis l'admin.
INSERT INTO __SCHEMA__.access_groups (kind, ref_code, enabled) VALUES
  ('niveau', 'dg_dga', true),
  ('niveau', 'directeurs', true),
  ('niveau', 'resp_service', true)
ON CONFLICT (kind, ref_code) DO NOTHING;
