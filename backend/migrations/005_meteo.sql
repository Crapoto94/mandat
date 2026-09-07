-- "Météo" de l'engagement : indicateur de santé/risque, orthogonal à l'état
-- d'avancement (qui décrit la phase). Convention classique de suivi de
-- projet : ensoleillé = ça avance bien, nuageux = points de vigilance,
-- orageux = à risque / bloqué.
CREATE TABLE IF NOT EXISTS __SCHEMA__.meteos (
  code     VARCHAR(20) PRIMARY KEY,
  libelle  VARCHAR(60) NOT NULL,
  emoji    VARCHAR(8) NOT NULL,
  couleur  VARCHAR(20) NOT NULL,
  ordre    INTEGER NOT NULL
);

INSERT INTO __SCHEMA__.meteos (code, libelle, emoji, couleur, ordre) VALUES
  ('ensoleille', 'Ensoleillé — ça avance bien', '☀️', '#16a34a', 1),
  ('nuageux', 'Nuageux — points de vigilance', '⛅', '#f59e0b', 2),
  ('orageux', 'Orageux — à risque / bloqué', '⛈️', '#dc2626', 3)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE __SCHEMA__.engagements
  ADD COLUMN IF NOT EXISTS meteo_code VARCHAR(20) REFERENCES __SCHEMA__.meteos(code);
