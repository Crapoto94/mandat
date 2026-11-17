// Base documentaire partagée (dossiers, fichiers, dépôt de zip,
// métadonnées) — module identique pour les projets ET les engagements (cf.
// documents.service.js). Monté deux fois dans server.js, une fois par type
// de fiche (req.ownerKind posé au montage).
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { db } = require('../../db/pg_db');
const docs = require('./documents.service');
const officePreview = require('../../services/officePreview');
const { parseMsgBuffer, extractMsgAttachment } = require('../../services/msgParser');
const { requireAuth, requireAuthQueryOrHeader, requireAdmin } = require('../../middleware/auth');
const { requireOwnerAccess, requireLevel, loadDocOwnerFromRow } = require('./access');

const router = express.Router();

const UPLOAD_DIR = docs.UPLOAD_DIR;
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo (zip inclus)

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_SIZE_BYTES } });

/** multer/busboy décode le nom de fichier en latin1 par défaut. */
function fixUploadedFilename(name) {
  return Buffer.from(name, 'latin1').toString('utf8');
}

// --- Dossiers ---------------------------------------------------------------

router.get('/:id/folders', requireAuth, requireOwnerAccess, async (req, res) => {
  res.json(await docs.listFolders(req.owner));
});

router.post('/:id/folders', requireAuth, requireOwnerAccess, requireLevel('modification'), async (req, res) => {
  const { nom, parent_id } = req.body || {};
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Nom de dossier requis' });
  const folder = await docs.createFolder(req.owner, parent_id || null, nom, req.user.displayName || req.user.sub);
  res.status(201).json(folder);
});

router.delete('/:id/folders/:folderId', requireAuth, requireOwnerAccess, requireLevel('modification'), async (req, res) => {
  const { deleted, storedNames } = await docs.deleteFolder(req.owner, req.params.folderId);
  if (!deleted) return res.status(404).json({ error: 'Dossier introuvable' });
  for (const name of storedNames) fs.unlink(path.join(UPLOAD_DIR, name), () => {});
  res.status(204).end();
});

// --- Documents ----------------------------------------------------------------

router.get('/:id/documents', requireAuth, requireOwnerAccess, async (req, res) => {
  const folderId = req.query.folder_id ? Number(req.query.folder_id) : null;
  res.json(await docs.listDocuments(req.owner, folderId));
});

router.get('/:id/folders/:folderId/path', requireAuth, requireOwnerAccess, async (req, res) => {
  res.json(await docs.folderPath(req.params.folderId));
});

/**
 * Dépôt de fichiers — éventuellement avec un chemin relatif par fichier
 * (`paths`, tableau JSON parallèle à `files`) pour reconstituer
 * l'arborescence d'un DOSSIER glissé-déposé depuis l'explorateur.
 */
router.post('/:id/documents', requireAuth, requireOwnerAccess, requireLevel('modification'), upload.array('files', 200), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const rootFolderId = req.body.folder_id ? Number(req.body.folder_id) : null;
  const author = req.user.displayName || req.user.sub;

  let paths = null;
  if (req.body.paths) {
    try {
      paths = JSON.parse(req.body.paths);
      if (!Array.isArray(paths) || paths.length !== req.files.length) paths = null;
    } catch {
      paths = null;
    }
  }

  const folderCache = new Map();
  const created = [];
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    let folderId = rootFolderId;
    let originalName = fixUploadedFilename(file.originalname);

    if (paths) {
      const parts = String(paths[i] || '').split('/').filter(Boolean);
      const fileName = parts.pop();
      if (fileName) originalName = fileName;
      if (parts.length) folderId = await docs.resolveFolderPath(req.owner, rootFolderId, parts, author, folderCache);
    }

    const { document } = await docs.createDocument({
      owner: req.owner,
      folderId,
      storedName: file.filename,
      originalName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      author,
    });
    created.push(document);
  }
  res.status(201).json(created);
});

/** Dépôt d'un zip : recrée l'arborescence de dossiers, un document par fichier. */
router.post('/:id/documents/zip', requireAuth, requireOwnerAccess, requireLevel('modification'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const rootFolderId = req.body.folder_id ? Number(req.body.folder_id) : null;
  const author = req.user.displayName || req.user.sub;

  let zip;
  try {
    zip = new AdmZip(req.file.path);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: `Zip invalide : ${err.message}` });
  }

  const folderCache = new Map();
  const created = [];
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  for (const entry of entries) {
    const parts = entry.entryName.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;
    const folderId = await docs.resolveFolderPath(req.owner, rootFolderId, parts, author, folderCache);

    const storedName = `${crypto.randomUUID()}${path.extname(fileName).slice(0, 10)}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), entry.getData());

    const { document } = await docs.createDocument({
      owner: req.owner,
      folderId,
      storedName,
      originalName: fileName,
      mimeType: null,
      sizeBytes: entry.header.size,
      author,
    });
    created.push(document);
  }

  fs.unlink(req.file.path, () => {});
  res.status(201).json({ created: created.length, documents: created });
});

router.patch('/:id/documents/:docId', requireAuth, requireOwnerAccess, requireLevel('modification'), async (req, res) => {
  const row = await docs.updateDocument(req.owner, req.params.docId, req.body || {});
  if (!row) return res.status(404).json({ error: 'Document introuvable' });
  res.json(row);
});

router.get('/:id/documents/:docId/versions', requireAuth, requireOwnerAccess, async (req, res) => {
  const versions = await docs.listVersions(req.owner, req.params.docId);
  if (versions === null) return res.status(404).json({ error: 'Document introuvable' });
  res.json(versions);
});

router.delete('/:id/documents/:docId', requireAuth, requireOwnerAccess, requireLevel('modification'), async (req, res) => {
  const row = await docs.softDeleteDocument(req.owner, req.params.docId, req.user.displayName || req.user.sub);
  if (!row) return res.status(404).json({ error: 'Document introuvable' });
  res.status(204).end();
});

/** Sert le fichier — auth via header OU ?token= (aperçu <img>/<iframe>). Le
 * contrôle d'accès porte sur l'appartenance réelle du document (déduite de
 * la ligne elle-même : engagement = tout agent, projet = membres). Partagé
 * par le téléchargement et tous les aperçus ci-dessous. */
async function loadAccessibleDocument(req, res) {
  const row = await db.get(`SELECT * FROM doc_documents WHERE id = $1 AND deleted_at IS NULL`, [req.params.docId]);
  if (!row) {
    res.status(404).json({ error: 'Fichier introuvable' });
    return null;
  }
  const owner = await loadDocOwnerFromRow(row, req);
  if (!owner) {
    res.status(404).json({ error: 'Fichier introuvable' });
    return null;
  }
  const filePath = path.join(UPLOAD_DIR, row.stored_name);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Fichier absent du stockage' });
    return null;
  }
  return { row, filePath, owner };
}

router.get('/documents/:docId/file', requireAuthQueryOrHeader, async (req, res) => {
  const loaded = await loadAccessibleDocument(req, res);
  if (!loaded) return;
  const { row, filePath } = loaded;

  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
  fs.createReadStream(filePath).pipe(res);
});

/** Aperçu structuré selon le type de fichier — pour la visionneuse
 * (PDF/image gérés directement côté frontend via /file ; .msg, docx, xlsx,
 * pptx nécessitent un traitement serveur, d'où ces routes dédiées). */
router.get('/documents/:docId/preview/msg', requireAuthQueryOrHeader, async (req, res) => {
  const loaded = await loadAccessibleDocument(req, res);
  if (!loaded) return;
  try {
    res.json(await parseMsgBuffer(fs.readFileSync(loaded.filePath)));
  } catch (err) {
    res.status(500).json({ error: `Lecture du message impossible : ${err.message}` });
  }
});

/** Pièce jointe embarquée dans un .msg, par index — servie "inline" par
 * défaut (aperçu PDF/image direct) sauf `?download=1`. */
router.get('/documents/:docId/preview/msg/attachments/:idx', requireAuthQueryOrHeader, async (req, res) => {
  const loaded = await loadAccessibleDocument(req, res);
  if (!loaded) return;
  try {
    const att = extractMsgAttachment(fs.readFileSync(loaded.filePath), parseInt(req.params.idx, 10));
    if (!att) return res.status(404).json({ error: 'Pièce jointe introuvable' });
    const disposition = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
    res.type(att.mimeType || path.extname(att.fileName) || 'application/octet-stream');
    res.send(Buffer.from(att.content));
  } catch (err) {
    res.status(500).json({ error: `Extraction impossible : ${err.message}` });
  }
});

/** Aperçu structuré d'une pièce jointe embarquée dans un .msg, elle-même
 * docx/xlsx/pptx. */
router.get('/documents/:docId/preview/msg/attachments/:idx/preview/:kind', requireAuthQueryOrHeader, async (req, res) => {
  const loaded = await loadAccessibleDocument(req, res);
  if (!loaded) return;
  const { kind } = req.params;
  if (!['docx', 'xlsx', 'pptx'].includes(kind)) return res.status(400).json({ error: 'Type non pris en charge' });
  try {
    const att = extractMsgAttachment(fs.readFileSync(loaded.filePath), parseInt(req.params.idx, 10));
    if (!att) return res.status(404).json({ error: 'Pièce jointe introuvable' });
    const buffer = Buffer.from(att.content);
    if (kind === 'docx') res.json(await officePreview.previewDocx(buffer));
    else if (kind === 'xlsx') res.json(officePreview.previewXlsx(buffer));
    else res.json(officePreview.previewPptx(buffer));
  } catch (err) {
    res.status(500).json({ error: `Aperçu impossible : ${err.message}` });
  }
});

router.get('/documents/:docId/preview/docx', requireAuthQueryOrHeader, async (req, res) => {
  const loaded = await loadAccessibleDocument(req, res);
  if (!loaded) return;
  try {
    res.json(await officePreview.previewDocx(fs.readFileSync(loaded.filePath)));
  } catch (err) {
    res.status(500).json({ error: `Aperçu impossible : ${err.message}` });
  }
});

router.get('/documents/:docId/preview/xlsx', requireAuthQueryOrHeader, async (req, res) => {
  const loaded = await loadAccessibleDocument(req, res);
  if (!loaded) return;
  try {
    res.json(officePreview.previewXlsx(fs.readFileSync(loaded.filePath)));
  } catch (err) {
    res.status(500).json({ error: `Aperçu impossible : ${err.message}` });
  }
});

router.get('/documents/:docId/preview/pptx', requireAuthQueryOrHeader, async (req, res) => {
  const loaded = await loadAccessibleDocument(req, res);
  if (!loaded) return;
  try {
    res.json(officePreview.previewPptx(fs.readFileSync(loaded.filePath)));
  } catch (err) {
    res.status(500).json({ error: `Aperçu impossible : ${err.message}` });
  }
});

/** Fichier d'une version archivée (historique) — même contrôle d'accès que
 * la version courante, via le document parent. */
router.get('/documents/versions/:versionId/file', requireAuthQueryOrHeader, async (req, res) => {
  const version = await db.get(
    `SELECT v.*, d.projet_id, d.engagement_id, d.original_name, d.deleted_at AS doc_deleted_at
     FROM doc_document_versions v JOIN doc_documents d ON d.id = v.document_id
     WHERE v.id = $1`,
    [req.params.versionId]
  );
  if (!version) return res.status(404).json({ error: 'Version introuvable' });

  const owner = await loadDocOwnerFromRow(version, req);
  if (!owner) return res.status(404).json({ error: 'Version introuvable' });

  const filePath = path.join(UPLOAD_DIR, version.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier absent du stockage' });

  res.setHeader('Content-Type', version.mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`v${version.version}_${version.original_name}`)}`
  );
  fs.createReadStream(filePath).pipe(res);
});

// --- Champs de métadonnées (paramétrage) -------------------------------------

router.get('/:id/metadata-fields', requireAuth, requireOwnerAccess, async (req, res) => {
  res.json(await docs.listMetadataFields(req.owner));
});

// Paramétrage du schéma de métadonnées (pas juste remplir une valeur) :
// impacte tous les documents de la fiche, réservé au niveau "administration".
router.post('/:id/metadata-fields', requireAuth, requireOwnerAccess, requireLevel('administration'), async (req, res) => {
  const { cle, libelle, type, options, ordre } = req.body || {};
  if (!cle || !cle.trim() || !libelle || !libelle.trim()) {
    return res.status(400).json({ error: 'Clé et libellé requis' });
  }
  if (type && !['texte', 'date', 'liste'].includes(type)) {
    return res.status(400).json({ error: 'Type invalide (texte, date, ou liste)' });
  }
  try {
    const field = await docs.createMetadataField(req.owner, { cle, libelle, type, options, ordre });
    res.status(201).json(field);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Cette clé existe déjà' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/metadata-fields/:fieldId', requireAuth, requireOwnerAccess, requireLevel('administration'), async (req, res) => {
  const removed = await docs.deleteMetadataField(req.owner, req.params.fieldId);
  if (!removed) return res.status(404).json({ error: 'Champ introuvable' });
  res.status(204).end();
});

// --- Corbeille (admin) -------------------------------------------------------
// La suppression d'un document est douce : le fichier reste sur disque, la
// ligne visible ici jusqu'à restauration ou purge définitive par un admin.

router.get('/admin/documents/trash', requireAuth, requireAdmin, async (req, res) => {
  const rows = await db.all(
    `SELECT d.*,
            p.nom AS projet_nom,
            e.numero AS engagement_numero, e.contenu AS engagement_contenu
     FROM doc_documents d
     LEFT JOIN projets p ON p.id = d.projet_id
     LEFT JOIN engagements e ON e.id = d.engagement_id
     WHERE d.deleted_at IS NOT NULL
     ORDER BY d.deleted_at DESC`
  );
  res.json(rows);
});

router.post('/admin/documents/:docId/restore', requireAuth, requireAdmin, async (req, res) => {
  const row = await db.get(
    `UPDATE doc_documents SET deleted_at = NULL, deleted_by = NULL
     WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
    [req.params.docId]
  );
  if (!row) return res.status(404).json({ error: 'Document introuvable dans la corbeille' });
  res.json(row);
});

router.delete('/admin/documents/:docId/purge', requireAuth, requireAdmin, async (req, res) => {
  const row = await db.get(`SELECT stored_name FROM doc_documents WHERE id = $1 AND deleted_at IS NOT NULL`, [req.params.docId]);
  if (!row) return res.status(404).json({ error: 'Document introuvable dans la corbeille' });
  const versions = await db.all(`SELECT stored_name FROM doc_document_versions WHERE document_id = $1`, [req.params.docId]);
  await db.run(`DELETE FROM doc_documents WHERE id = $1`, [req.params.docId]);
  docs.deleteStoredFiles([row.stored_name, ...versions.map((v) => v.stored_name)]);
  res.status(204).end();
});

module.exports = router;
