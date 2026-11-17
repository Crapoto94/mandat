// Rôles assignés — module identique pour projets et engagements (catalogue
// commun "roles", géré ailleurs — cf. modules/roles/roles.routes.js, monté
// sous /api/roles ; assignations ici, table "assigned_roles", cf.
// migrations/021_assigned_roles.sql). Monté deux fois dans server.js (une
// fois par type de fiche, req.ownerKind posé au montage) — mêmes routes
// (/:id/roles) des deux côtés.
const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');
const { requireOwnerAccess, requireLevel } = require('../documents/access');

const router = express.Router();

function ownerWhere(owner) {
  return owner.engagementId != null ? { col: 'engagement_id', id: owner.engagementId } : { col: 'projet_id', id: owner.projetId };
}

router.get('/:id/roles', requireAuth, requireOwnerAccess, async (req, res) => {
  const { col, id } = ownerWhere(req.owner);
  const rows = await db.all(
    `SELECT ar.*, r.libelle AS role_libelle
     FROM assigned_roles ar JOIN roles r ON r.id = ar.role_id
     WHERE ar.${col} = $1 ORDER BY ar.created_at ASC`,
    [id]
  );
  res.json(rows);
});

router.post('/:id/roles', requireAuth, requireOwnerAccess, requireLevel('administration'), async (req, res) => {
  const { col, id } = ownerWhere(req.owner);
  const { role_id, agent_username, agent_display_name, agent_direction } = req.body || {};
  if (!role_id || !agent_display_name || !agent_display_name.trim()) {
    return res.status(400).json({ error: 'role_id et agent_display_name sont requis' });
  }
  const role = await db.get(`SELECT id, libelle FROM roles WHERE id = $1`, [role_id]);
  if (!role) return res.status(400).json({ error: 'Rôle inconnu' });

  const assignment = await db.get(
    `INSERT INTO assigned_roles (${col}, role_id, agent_username, agent_display_name, agent_direction, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, role_id, agent_username || null, agent_display_name.trim(), agent_direction || null, req.user.displayName || req.user.sub]
  );
  res.status(201).json({ ...assignment, role_libelle: role.libelle });
});

router.delete('/:id/roles/:roleAssignmentId', requireAuth, requireOwnerAccess, requireLevel('administration'), async (req, res) => {
  const { col, id } = ownerWhere(req.owner);
  const result = await db.run(`DELETE FROM assigned_roles WHERE id = $1 AND ${col} = $2`, [req.params.roleAssignmentId, id]);
  if (!result.changes) return res.status(404).json({ error: 'Assignation introuvable' });
  res.status(204).end();
});

module.exports = router;
