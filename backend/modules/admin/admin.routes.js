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
const alertsDigest = require('../../jobs/alertsDigest');

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
  // Champ AD "entreprise" (`company`) : c'est lui qui porte la direction de
  // rattachement de l'agent côté Ville (pas `department`, qui contient
  // souvent le service). Sa valeur ne correspond pas forcément mot pour mot
  // au libellé de la direction : resolveDirectionCodes la fait passer par
  // la hiérarchie Hub DSI mise en cache pour retomber sur la bonne direction.
  const direction = infos.company || infos.department || infos.physicalDeliveryOfficeName || null;
  const codes = direction ? await engagementsService.resolveDirectionCodes(direction) : [];
  const engagements = codes.length ? await engagementsService.mine(codes) : [];

  res.json({
    sAMAccountName: infos.sAMAccountName || null,
    displayName: infos.displayName || infos.name || null,
    direction,
    mail: infos.mail || null,
    title: infos.title || null,
    directionCode: codes.join(', ') || null,
    directionCodes: codes,
    // Fiche AD complète telle que renvoyée par l'APM — affichée en admin
    // pour diagnostiquer QUEL champ porte réellement la direction (le
    // schéma AD Ville n'est pas homogène selon les comptes : `department`
    // contient parfois le service et pas la direction). À retirer une fois
    // le bon champ identifié et figé dans le code.
    raw: infos,
    engagements,
  });
});

// --- Journal d'activité (lecture seule) --------------------------------------

/**
 * Vue unifiée de tout ce qui a été fait sur les engagements — modifications
 * de champ (historique existant), commentaires postés, pièces jointes
 * ajoutées ou supprimées — triée du plus récent au plus ancien. Sert de
 * journal global pour l'admin, là où la fiche engagement n'affiche que
 * l'historique de son propre engagement.
 */
router.get('/activity-log', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const rows = await db.all(
    `(
       SELECT 'champ' AS type, h.changed_at AS at, h.changed_by AS auteur,
              e.id AS engagement_id, e.numero AS engagement_numero, e.contenu AS engagement_contenu,
              h.champ AS libelle, h.ancienne_valeur, h.nouvelle_valeur
       FROM engagement_history h
       JOIN engagements e ON e.id = h.engagement_id
     )
     UNION ALL
     (
       SELECT 'commentaire', c.created_at, c.author_name,
              e.id, e.numero, e.contenu,
              'commentaire', NULL, c.body
       FROM comments c
       JOIN engagements e ON e.id = c.engagement_id
     )
     UNION ALL
     (
       SELECT 'piece_jointe_ajoutee', a.created_at, a.uploaded_by,
              e.id, e.numero, e.contenu,
              a.original_name, NULL, NULL
       FROM engagement_attachments a
       JOIN engagements e ON e.id = a.engagement_id
     )
     UNION ALL
     (
       SELECT 'piece_jointe_supprimee', a.deleted_at, a.deleted_by,
              e.id, e.numero, e.contenu,
              a.original_name, NULL, NULL
       FROM engagement_attachments a
       JOIN engagements e ON e.id = a.engagement_id
       WHERE a.deleted_at IS NOT NULL
     )
     ORDER BY at DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

// --- Uniformisation des sigles de direction -----------------------------------

/**
 * Réécrit dans les engagements toutes les variantes connues d'un même sigle
 * (casse, orthographe legacy...) vers une écriture canonique unique, et
 * nettoie la table de concordance en conséquence (cf.
 * engagementsService.normalizeKnownDirectionAliases pour la liste et le
 * détail du mécanisme). Idempotent : rejouable sans risque.
 */
router.post('/directions/normalize-aliases', async (req, res) => {
  try {
    const summary = await engagementsService.normalizeKnownDirectionAliases();
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: `Uniformisation impossible : ${err.message}` });
  }
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

// --- Abonnements aux alertes "nouveautés" -------------------------------------

/** Qui est abonné à quel engagement (cloche sur la liste des engagements) —
 * pour que l'admin puisse voir qui suit quoi, sans avoir à demander. */
router.get('/alert-subscriptions', async (req, res) => {
  const rows = await db.all(
    `SELECT ea.id, ea.engagement_id, ea.user_sub, ea.user_email, ea.user_display_name,
            ea.created_at, ea.last_notified_at,
            e.numero AS engagement_numero, e.contenu AS engagement_contenu
     FROM engagement_alerts ea
     JOIN engagements e ON e.id = ea.engagement_id
     ORDER BY e.numero ASC, ea.user_display_name ASC`
  );
  res.json(rows);
});

// --- Journal des mails (alertes, relances, envois manuels) --------------------

router.get('/mail-log', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await db.all(
    `SELECT id, to_email, subject, context, status, error_message, sent_by, created_at
     FROM mail_log ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

/** Envoie un exemple de récapitulatif d'alertes (engagements fictifs) à
 * l'admin connecté (ou à ?to=... si fourni) — pour vérifier le rendu réel
 * du template mail sans attendre l'envoi automatique du soir. */
router.post('/mail-log/test-digest', async (req, res) => {
  const to = req.body?.to || req.user.email;
  if (!to) return res.status(400).json({ error: 'Aucune adresse mail (ni ?to fourni, ni mail connu pour ce compte)' });
  try {
    const result = await alertsDigest.sendExampleDigest({ to, displayName: req.user.displayName || req.user.sub });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Envoi impossible : ${err.message}` });
  }
});

module.exports = router;
