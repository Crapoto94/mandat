-- Édition collaborative : verrou léger par (engagement, champ), avec
-- présence visible pour les autres ("X est en cours de modification").
-- Le verrou n'est jamais permanent : sans heartbeat depuis LOCK_TIMEOUT
-- (cf. backend), il est considéré périmé et n'importe qui peut le reprendre
-- — évite qu'une session fermée brutalement (crash, fermeture d'onglet)
-- bloque durablement un champ.
CREATE TABLE IF NOT EXISTS __SCHEMA__.field_locks (
  engagement_id      INTEGER NOT NULL REFERENCES __SCHEMA__.engagements(id) ON DELETE CASCADE,
  champ              VARCHAR(60) NOT NULL,
  user_sub           VARCHAR(120) NOT NULL,
  display_name       VARCHAR(255) NOT NULL,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (engagement_id, champ)
);
