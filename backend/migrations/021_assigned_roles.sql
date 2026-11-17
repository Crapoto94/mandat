-- Généralise l'assignation de rôles (jusqu'ici propre aux engagements, table
-- "engagement_roles") pour qu'elle serve identiquement aux projets — même
-- catalogue de rôles (table "roles", inchangée), même module d'assignation
-- des deux côtés. Table neuve plutôt qu'un renommage de "engagement_roles" :
-- le backend actuellement déployé en production lit encore cette table sous
-- son nom d'origine, qui doit donc rester intacte jusqu'au déploiement du
-- nouveau code (cf. modules/documents/roles.service.js, qui lira/écrira
-- "assigned_roles" pour les deux types de rattachement).
CREATE TABLE IF NOT EXISTS __SCHEMA__.assigned_roles (
  id                  SERIAL PRIMARY KEY,
  engagement_id       INTEGER REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  projet_id           INTEGER REFERENCES __SCHEMA__.projets(id) ON DELETE CASCADE,
  role_id             INTEGER NOT NULL REFERENCES __SCHEMA__.roles(id) ON DELETE RESTRICT,
  agent_username      VARCHAR(120),
  agent_display_name  VARCHAR(255) NOT NULL,
  agent_direction     VARCHAR(120),
  created_by          VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assigned_roles_owner_exclusive CHECK ((engagement_id IS NOT NULL)::int + (projet_id IS NOT NULL)::int = 1)
);
CREATE INDEX IF NOT EXISTS idx_assigned_roles_engagement ON __SCHEMA__.assigned_roles(engagement_id);
CREATE INDEX IF NOT EXISTS idx_assigned_roles_projet ON __SCHEMA__.assigned_roles(projet_id);

-- Reprend les assignations déjà en place — sans y toucher, purement une
-- copie — pour que le nouveau module démarre avec les mêmes données que
-- l'ancien : les rôles d'engagement existants, et les membres de projet
-- existants (accueillis sous un rôle générique "Membre", réassignable
-- ensuite vers un rôle plus précis du catalogue).
INSERT INTO __SCHEMA__.roles (libelle, ordre)
  VALUES ('Membre', 0)
  ON CONFLICT (libelle) DO NOTHING;

INSERT INTO __SCHEMA__.assigned_roles (engagement_id, role_id, agent_username, agent_display_name, agent_direction, created_by, created_at)
SELECT engagement_id, role_id, agent_username, agent_display_name, agent_direction, created_by, created_at
FROM __SCHEMA__.engagement_roles;

INSERT INTO __SCHEMA__.assigned_roles (projet_id, role_id, agent_username, agent_display_name, agent_direction, created_by, created_at)
SELECT
  pm.projet_id,
  COALESCE((SELECT r.id FROM __SCHEMA__.roles r WHERE r.libelle = pm.role), (SELECT id FROM __SCHEMA__.roles WHERE libelle = 'Membre')),
  pm.user_sub,
  COALESCE(pm.display_name, pm.user_sub),
  pm.direction,
  pm.added_by,
  pm.added_at
FROM __SCHEMA__.projet_membres pm;
