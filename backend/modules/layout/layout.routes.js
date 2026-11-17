// Disposition des modules ("widgets") d'une fiche — activé/désactivé,
// position, réglable indépendamment par fiche (glisser-déposer côté front).
// cf. migrations/024_module_layout.sql. Monté deux fois (projets/engagements).
const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');
const { requireOwnerAccess } = require('../documents/access');

const router = express.Router();

function ownerWhere(owner) {
  return owner.engagementId != null ? { col: 'engagement_id', id: owner.engagementId } : { col: 'projet_id', id: owner.projetId };
}

router.get('/:id/module-layout', requireAuth, requireOwnerAccess, async (req, res) => {
  const { col, id } = ownerWhere(req.owner);
  const rows = await db.all(`SELECT module_key, enabled, position FROM module_layout WHERE ${col} = $1 ORDER BY position ASC`, [id]);
  res.json(rows);
});

/** Remplace la disposition complète en un appel — plus simple qu'un jeu de
 * routes par module vu qu'on l'enregistre toujours d'un coup (fin de
 * glisser-déposer / bascule d'activation). */
router.put('/:id/module-layout', requireAuth, requireOwnerAccess, async (req, res) => {
  const { col, id } = ownerWhere(req.owner);
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: 'items (tableau) requis' });
  const author = req.user.displayName || req.user.sub;

  for (let i = 0; i < items.length; i++) {
    const { module_key, enabled } = items[i];
    if (!module_key) continue;
    // La cible ON CONFLICT doit reprendre exactement l'index unique PARTIEL
    // correspondant (cf. migration 024 : un index par colonne de
    // propriétaire, chacun filtré sur "IS NOT NULL") — un simple
    // ON CONFLICT (col, module_key) sans ce filtre ne matche pas un index partiel.
    await db.run(
      `INSERT INTO module_layout (${col}, module_key, enabled, position, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (${col}, module_key) WHERE ${col} IS NOT NULL
       DO UPDATE SET enabled = EXCLUDED.enabled, position = EXCLUDED.position, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [id, module_key, enabled !== false, i, author]
    );
  }
  const rows = await db.all(`SELECT module_key, enabled, position FROM module_layout WHERE ${col} = $1 ORDER BY position ASC`, [id]);
  res.json(rows);
});

module.exports = router;
