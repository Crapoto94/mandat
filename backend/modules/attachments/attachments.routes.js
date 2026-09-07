// Fichiers joints à un engagement (documents, et images collées dans
// l'éditeur de description — cf. RichTextEditor côté frontend). Stockage
// sur disque, hors du code, dans un volume dédié (cf. guide §5 "Uploads &
// fichiers").
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('../../db/pg_db');
const { requireAuth, requireAuthQueryOrHeader, requireAdmin } = require('../../middleware/auth');
const { parseMsgBuffer, extractMsgAttachment } = require('../../services/msgParser');

const router = express.Router();

// Chemin paramétrable : en local, à côté du repo ; en Docker, pointer
// (via ATTACHMENTS_DIR) vers un volume monté pour que les fichiers
// survivent aux rebuilds du conteneur (cf. docker-compose.yml).
const UPLOAD_DIR = process.env.ATTACHMENTS_DIR || path.join(__dirname, '..', '..', '..', 'data', 'attachments');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_SIZE_BYTES } });

const ATTACHMENT_FIELDS = 'id, engagement_id, original_name, mime_type, size_bytes, uploaded_by, created_at, deleted_at, deleted_by';

/**
 * multer/busboy décode le nom de fichier du multipart en latin1 par défaut
 * (RFC 2388 ne fixe pas d'encodage) : un nom envoyé en UTF-8 par le
 * navigateur (accents) en ressort mojibake ("gÃ©nÃ©rique"). On le
 * réinterprète en UTF-8 pour retrouver le nom d'origine tel quel — jamais
 * de renommage du fichier lui-même.
 */
function fixUploadedFilename(name) {
  return Buffer.from(name, 'latin1').toString('utf8');
}

router.get('/engagements/:id/attachments', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT ${ATTACHMENT_FIELDS} FROM engagement_attachments
     WHERE engagement_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

router.post('/engagements/:id/attachments', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

  const engagement = await db.get(`SELECT id FROM engagements WHERE id = $1`, [req.params.id]);
  if (!engagement) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Engagement introuvable' });
  }

  const row = await db.get(
    `INSERT INTO engagement_attachments
       (engagement_id, stored_name, original_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${ATTACHMENT_FIELDS}`,
    [
      req.params.id,
      req.file.filename,
      fixUploadedFilename(req.file.originalname),
      req.file.mimetype,
      req.file.size,
      req.user.displayName || req.user.sub,
    ]
  );
  res.status(201).json(row);
});

/** Suppression douce : masque le fichier (visible en corbeille admin), ne touche jamais le disque. */
router.delete('/engagements/:id/attachments/:attachmentId', requireAuth, async (req, res) => {
  const row = await db.get(
    `UPDATE engagement_attachments SET deleted_at = now(), deleted_by = $1
     WHERE id = $2 AND engagement_id = $3 AND deleted_at IS NULL RETURNING id`,
    [req.user.displayName || req.user.sub, req.params.attachmentId, req.params.id]
  );
  if (!row) return res.status(404).json({ error: 'Fichier introuvable' });
  res.status(204).end();
});

// --- Corbeille (admin) ------------------------------------------------------

router.get('/admin/attachments/trash', requireAuth, requireAdmin, async (req, res) => {
  const rows = await db.all(
    `SELECT a.${ATTACHMENT_FIELDS.replace(/, /g, ', a.')}, e.numero AS engagement_numero, e.contenu AS engagement_contenu
     FROM engagement_attachments a
     JOIN engagements e ON e.id = a.engagement_id
     WHERE a.deleted_at IS NOT NULL
     ORDER BY a.deleted_at DESC`
  );
  res.json(rows);
});

router.post('/admin/attachments/:id/restore', requireAuth, requireAdmin, async (req, res) => {
  const row = await db.get(
    `UPDATE engagement_attachments SET deleted_at = NULL, deleted_by = NULL
     WHERE id = $1 AND deleted_at IS NOT NULL RETURNING ${ATTACHMENT_FIELDS}`,
    [req.params.id]
  );
  if (!row) return res.status(404).json({ error: 'Fichier introuvable dans la corbeille' });
  res.json(row);
});

router.delete('/admin/attachments/:id/purge', requireAuth, requireAdmin, async (req, res) => {
  const row = await db.get(
    `DELETE FROM engagement_attachments WHERE id = $1 AND deleted_at IS NOT NULL RETURNING stored_name`,
    [req.params.id]
  );
  if (!row) return res.status(404).json({ error: 'Fichier introuvable dans la corbeille' });
  fs.unlink(path.join(UPLOAD_DIR, row.stored_name), () => {});
  res.status(204).end();
});

// --- Contenu / prévisualisation ---------------------------------------------

/**
 * Sert le fichier lui-même (image affichée dans l'éditeur, PDF en <iframe>,
 * téléchargement). Auth via header OU ?token= : une balise <img>/<iframe>
 * ne peut pas fixer d'en-tête.
 */
router.get('/attachments/:id/file', requireAuthQueryOrHeader, async (req, res) => {
  const row = await db.get(`SELECT * FROM engagement_attachments WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Fichier introuvable' });

  const filePath = path.join(UPLOAD_DIR, row.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier absent du stockage' });

  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
  fs.createReadStream(filePath).pipe(res);
});

/** Prévisualisation structurée d'un fichier .msg (Outlook) — sujet, expéditeur, corps, pièces jointes. */
router.get('/attachments/:id/msg', requireAuthQueryOrHeader, async (req, res) => {
  const row = await db.get(`SELECT * FROM engagement_attachments WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Fichier introuvable' });
  const filePath = path.join(UPLOAD_DIR, row.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier absent du stockage' });
  try {
    const parsed = parseMsgBuffer(fs.readFileSync(filePath));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: `Lecture du message impossible : ${err.message}` });
  }
});

/** Pièce jointe embarquée dans un .msg, par index (cf. msg.attachments[].index). */
router.get('/attachments/:id/msg/attachments/:idx', requireAuthQueryOrHeader, async (req, res) => {
  const row = await db.get(`SELECT * FROM engagement_attachments WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Fichier introuvable' });
  const filePath = path.join(UPLOAD_DIR, row.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier absent du stockage' });
  try {
    const att = extractMsgAttachment(fs.readFileSync(filePath), parseInt(req.params.idx, 10));
    if (!att) return res.status(404).json({ error: 'Pièce jointe introuvable' });
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
    res.type(path.extname(att.fileName) || 'application/octet-stream');
    res.send(Buffer.from(att.content));
  } catch (err) {
    res.status(500).json({ error: `Extraction impossible : ${err.message}` });
  }
});

module.exports = router;
