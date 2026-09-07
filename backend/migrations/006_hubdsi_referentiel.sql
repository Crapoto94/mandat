-- Cache local de la liste des directions/services renvoyée par le Hub DSI
-- (GET /api/directions-services), rafraîchi à chaque synchro. Sert à peupler
-- une liste déroulante en admin pour affecter le nom officiel à un sigle —
-- séparé de `directions` (nos sigles rencontrés dans les engagements), qui
-- reste la table de concordance elle-même.
CREATE TABLE IF NOT EXISTS __SCHEMA__.hubdsi_referentiel (
  code        VARCHAR(120) PRIMARY KEY,
  libelle     VARCHAR(255) NOT NULL,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
