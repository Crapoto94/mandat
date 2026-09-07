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
const { requireAuth, requireAuthQueryOrHeader } = require('../../middleware/auth');

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

router.get('/engagements/:id/attachments', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT id, engagement_id, original_name, mime_type, size_bytes, uploaded_by, created_at
     FROM engagement_attachments WHERE engagement_id = $1 ORDER BY created_at DESC`,
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
     RETURNING id, engagement_id, original_name, mime_type, size_bytes, uploaded_by, created_at`,
    [
      req.params.id,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      req.user.displayName || req.user.sub,
    ]
  );
  res.status(201).json(row);
});

router.delete('/engagements/:id/attachments/:attachmentId', requireAuth, async (req, res) => {
  const row = await db.get(`SELECT stored_name FROM engagement_attachments WHERE id = $1 AND engagement_id = $2`, [
    req.params.attachmentId,
    req.params.id,
  ]);
  if (!row) return res.status(404).json({ error: 'Fichier introuvable' });

  await db.run(`DELETE FROM engagement_attachments WHERE id = $1`, [req.params.attachmentId]);
  fs.unlink(path.join(UPLOAD_DIR, row.stored_name), () => {}); // best effort, ne bloque pas la réponse
  res.status(204).end();
});

/**
 * Sert le fichier lui-même (image affichée dans l'éditeur, téléchargement).
 * Auth via header OU ?token= : une balise <img> ne peut pas fixer d'en-tête.
 */
router.get('/attachments/:id/file', requireAuthQueryOrHeader, async (req, res) => {
  const row = await db.get(`SELECT * FROM engagement_attachments WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Fichier introuvable' });

  const filePath = path.join(UPLOAD_DIR, row.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier absent du stockage' });

  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.original_name)}"`);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
