const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../../db/pg_db');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { importFromFiles } = require('../../scripts/import-lib');
const apm = require('../../services/apm');
const engagementsService = require('../engagements/engagements.service');

const router = express.Router();
// Chemin paramétrable (cf. ATTACHMENTS_DIR dans attachments.routes.js) —
// en Docker, pointer UPLOADS_DIR vers le volume monté.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', '..', 'data', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({ dest: UPLOADS_DIR });

router.use(requireAuth, requireAdmin);

// --- Comptes de secours (admin local) ---------------------------------------

router.get('/admins', async (req, res) => {
  const rows = await db.all(
    `SELECT id, username, display_name, active, created_at, last_login_at FROM admin_users ORDER BY id ASC`
  );
  res.json(rows);
});

router.post('/admins', async (req, res) => {
  const { username, password, display_name } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: "Identifiant requis et mot de passe d'au moins 8 caractères" });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const created = await db.get(
      `INSERT INTO admin_users (username, password_hash, display_name)
       VALUES ($1, $2, $3) RETURNING id, username, display_name, active, created_at`,
      [username, hash, display_name || username]
    );
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Cet identifiant existe déjà' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/admins/:id', async (req, res) => {
  const { active, password, display_name } = req.body || {};
  const sets = [];
  const params = [];
  if (active !== undefined) {
    params.push(active);
    sets.push(`active = $${params.length}`);
  }
  if (display_name) {
    params.push(display_name);
    sets.push(`display_name = $${params.length}`);
  }
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min.)' });
    params.push(await bcrypt.hash(password, 10));
    sets.push(`password_hash = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Rien à mettre à jour' });

  params.push(req.params.id);
  const updated = await db.get(
    `UPDATE admin_users SET ${sets.join(', ')} WHERE id = $${params.length}
     RETURNING id, username, display_name, active, created_at`,
    params
  );
  if (!updated) return res.status(404).json({ error: 'Compte introuvable' });
  res.json(updated);
});

// --- Vérification annuaire (lecture seule, sans mot de passe) --------------

/**
 * Interroge l'AD (via l'APM, en lecture seule — aucune authentification,
 * juste la clé applicative) pour vérifier ce que l'annuaire Ville renvoie
 * pour un identifiant donné : nom, direction, mail. Sert à diagnostiquer
 * "l'agent X remonte-t-il bien, avec la bonne direction ?" sans jamais
 * avoir besoin du mot de passe de l'agent concerné.
 */
router.get('/agent-lookup', async (req, res) => {
  const identifier = (req.query.identifier || '').trim();
  if (!identifier) return res.status(400).json({ error: 'Paramètre identifier requis' });

  const infos = await apm.getAgent(identifier);
  if (!infos) {
    return res.status(404).json({ error: `Aucune fiche AD trouvée pour "${identifier}"` });
  }
  const direction = infos.department || infos.company || infos.physicalDeliveryOfficeName || null;
  const code = direction ? await engagementsService.resolveDirectionCode(direction) : null;
  const engagements = code ? await engagementsService.mine(code) : [];

  res.json({
    sAMAccountName: infos.sAMAccountName || null,
    displayName: infos.displayName || infos.name || null,
    direction,
    mail: infos.mail || null,
    title: infos.title || null,
    directionCode: code,
    engagements,
  });
});

// --- Réimport des fichiers Excel sources -------------------------------------

router.post('/import', upload.fields([{ name: 'suivi' }, { name: 'repartition' }]), async (req, res) => {
  const suiviFile = req.files?.suivi?.[0]?.path;
  const repartitionFile = req.files?.repartition?.[0]?.path;
  if (!suiviFile) {
    return res.status(400).json({ error: 'Le fichier de suivi (feuille Feuil1) est requis' });
  }
  try {
    const summary = await importFromFiles({ suiviFile, repartitionFile });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: `Import impossible : ${err.message}` });
  }
});

module.exports = router;
