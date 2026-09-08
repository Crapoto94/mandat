-- Adresse mail des comptes admin de secours — utilisée pour notifier les
-- nouvelles demandes/bugs remontés depuis la page "Nouveautés".
ALTER TABLE __SCHEMA__.admin_users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
