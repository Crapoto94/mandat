-- Niveau d'accès porté par chaque rôle du catalogue — consultation (lecture
-- seule), modification (édition, comportement actuel), administration
-- (édition + gestion des membres/rôles + suppression). Un agent sans rôle
-- assigné n'a par défaut aucun accès à un projet (inchangé) ; sur un
-- engagement il garde un accès de base "consultation" (visible par tous,
-- comme aujourd'hui), l'édition nécessitant "modification" ou plus — cf.
-- services/permissions.js.
ALTER TABLE __SCHEMA__.roles ADD COLUMN IF NOT EXISTS niveau_acces VARCHAR(20) NOT NULL DEFAULT 'modification';
ALTER TABLE __SCHEMA__.roles DROP CONSTRAINT IF EXISTS roles_niveau_acces_check;
ALTER TABLE __SCHEMA__.roles ADD CONSTRAINT roles_niveau_acces_check CHECK (niveau_acces IN ('consultation', 'modification', 'administration'));

-- Rôle "Propriétaire" (niveau administration) : assigné automatiquement au
-- créateur d'un projet (cf. modules/projets/projets.service.js) — sans ça,
-- avec "Membre" (modification) comme avant, le créateur ne pourrait plus
-- gérer les rôles de son propre projet (assigner/retirer d'autres agents),
-- action désormais réservée au niveau administration.
INSERT INTO __SCHEMA__.roles (libelle, ordre, niveau_acces)
  VALUES ('Propriétaire', -1, 'administration')
  ON CONFLICT (libelle) DO UPDATE SET niveau_acces = 'administration';
