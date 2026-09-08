-- Certains engagements sont continus (pas d'échéance de type "terminé le") :
-- une posture, une mission récurrente... Ce booléen les distingue pour
-- l'affichage (symbole de continuité) plutôt que d'être déduit du champ
-- échéance en texte libre.
ALTER TABLE __SCHEMA__.engagements
  ADD COLUMN IF NOT EXISTS continu BOOLEAN NOT NULL DEFAULT false;
