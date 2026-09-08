// Base documentaire par projet (dossiers, fichiers, dépôt de zip,
// métadonnées) — cf. migrations/019_projet_documents.sql. Comportement
// visé : le plus proche possible d'un lecteur réseau (navigation par
// dossier, dépôt de fichiers/zip, renommage, métadonnées libres).
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
const { requireAuth, requireAuthQueryOrHeader } = require('../../middleware/auth');
const { requireProjetMembership } = require('./middleware');

const router = express.Router();

const UPLOAD_DIR = process.env.PROJET_DOCUMENTS_DIR || path.join(__dirname, '..', '..', '..', 'data', 'projet-documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo (zip inclus)

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_SIZE_BYTES } });

/** multer/busboy décode le nom de fichier en latin1 par défaut — cf. même
 * correctif que pour les pièces jointes d'engagement. */
function fixUploadedFilename(name) {
  return Buffer.from(name, 'latin1').toString('utf8');
}

// --- Dossiers ---------------------------------------------------------------
// Tout membre (+ admin) peut écrire dans la base documentaire — pas de rôle
// "lecture seule" pour l'instant, cf. modèle de permission simple des projets.

router.get('/:id/folders', requireAuth, requireProjetMembership, async (req, res) => {
  const folders = await docs.listFolders(req.params.id);
  res.json(folders);
});

router.post('/:id/folders', requireAuth, requireProjetMembership, async (req, res) => {
  const { nom, parent_id } = req.body || {};
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Nom de dossier requis' });
  const folder = await docs.createFolder(req.params.id, parent_id || null, nom, req.user.displayName || req.user.sub);
  res.status(201).json(folder);
});

router.delete('/:id/folders/:folderId', requireAuth, requireProjetMembership, async (req, res) => {
  const { deleted, storedNames } = await docs.deleteFolder(req.params.id, req.params.folderId);
  if (!deleted) return res.status(404).json({ error: 'Dossier introuvable' });
  for (const name of storedNames) fs.unlink(path.join(UPLOAD_DIR, name), () => {});
  res.status(204).end();
});

// --- Documents ----------------------------------------------------------------

router.get('/:id/documents', requireAuth, requireProjetMembership, async (req, res) => {
  const folderId = req.query.folder_id ? Number(req.query.folder_id) : null;
  const rows = await docs.listDocuments(req.params.id, folderId);
  res.json(rows);
});

/** Fil d'Ariane du dossier courant, pour l'affichage "lecteur réseau". */
router.get('/:id/folders/:folderId/path', requireAuth, requireProjetMembership, async (req, res) => {
  const chain = await docs.folderPath(req.params.folderId);
  res.json(chain);
});

/**
 * Dépôt de fichiers — éventuellement avec un chemin relatif par fichier
 * (`paths`, tableau JSON parallèle à `files`, ex. "SousDossier/fichier.txt")
 * pour reconstituer l'arborescence d'un DOSSIER glissé-déposé depuis
 * l'explorateur du navigateur (l'API drag-and-drop ne fournit pas les
 * fichiers d'un dossier directement — le frontend les aplati via
 * webkitGetAsEntry() puis renvoie leur chemin ici). Sans `paths`, tous les
 * fichiers vont directement dans `folder_id` (dépôt simple, comportement
 * historique).
 */
router.post('/:id/documents', requireAuth, requireProjetMembership, upload.array('files', 200), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const rootFolderId = req.body.folder_id ? Number(req.body.folder_id) : null;
  const author = req.user.displayName || req.user.sub;
  const projetId = req.params.id;

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
      if (parts.length) folderId = await docs.resolveFolderPath(projetId, rootFolderId, parts, author, folderCache);
    }

    const { document } = await docs.createDocument({
      projetId,
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
router.post('/:id/documents/zip', requireAuth, requireProjetMembership, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const rootFolderId = req.body.folder_id ? Number(req.body.folder_id) : null;
  const author = req.user.displayName || req.user.sub;
  const projetId = req.params.id;

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
    // entryName utilise toujours '/' (format zip), y compris sous Windows.
    const parts = entry.entryName.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue; // entrée de dossier vide (déjà filtrée) ou nom vide
    const folderId = await docs.resolveFolderPath(projetId, rootFolderId, parts, author, folderCache);

    const storedName = `${crypto.randomUUID()}${path.extname(fileName).slice(0, 10)}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), entry.getData());

    const { document } = await docs.createDocument({
      projetId,
      folderId,
      storedName,
      originalName: fileName,
      mimeType: null,
      sizeBytes: entry.header.size,
      author,
    });
    created.push(document);
  }

  fs.unlink(req.file.path, () => {}); // le zip lui-même n'est pas conservé, seul son contenu l'est
  res.status(201).json({ created: created.length, documents: created });
});

router.patch('/:id/documents/:docId', requireAuth, requireProjetMembership, async (req, res) => {
  const row = await docs.updateDocument(req.params.id, req.params.docId, req.body || {});
  if (!row) return res.status(404).json({ error: 'Document introuvable' });
  res.json(row);
});

/** Historique des versions archivées d'un document (déposer un fichier du
 * même nom crée une nouvelle version plutôt qu'un doublon — cf. createDocument). */
router.get('/:id/documents/:docId/versions', requireAuth, requireProjetMembership, async (req, res) => {
  const versions = await docs.listVersions(req.params.id, req.params.docId);
  if (versions === null) return res.status(404).json({ error: 'Document introuvable' });
  res.json(versions);
});

router.delete('/:id/documents/:docId', requireAuth, requireProjetMembership, async (req, res) => {
  const row = await docs.softDeleteDocument(req.params.id, req.params.docId, req.user.displayName || req.user.sub);
  if (!row) return res.status(404).json({ error: 'Document introuvable' });
  res.status(204).end();
});

/** Sert le fichier — auth via header OU ?token= (aperçu <img>/<iframe>). Le
 * contrôle d'accès porte sur l'appartenance au PROJET du document (pas
 * seulement son existence), sinon un membre d'un autre projet pourrait
 * deviner l'id d'un document et le récupérer. Partagé par le téléchargement
 * et tous les aperçus (.msg, docx, xlsx, pptx) ci-dessous. */
async function loadAccessibleDocument(req, res) {
  const row = await db.get(`SELECT * FROM projet_documents WHERE id = $1 AND deleted_at IS NULL`, [req.params.docId]);
  if (!row) {
    res.status(404).json({ error: 'Fichier introuvable' });
    return null;
  }
  if (req.user.role !== 'admin') {
    const projetsService = require('./projets.service');
    const member = await projetsService.isMember(row.projet_id, req.user.sub);
    if (!member) {
      res.status(404).json({ error: 'Fichier introuvable' });
      return null;
    }
  }
  const filePath = path.join(UPLOAD_DIR, row.stored_name);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Fichier absent du stockage' });
    return null;
  }
  return { row, filePath };
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
    res.json(parseMsgBuffer(fs.readFileSync(loaded.filePath)));
  } catch (err) {
    res.status(500).json({ error: `Lecture du message impossible : ${err.message}` });
  }
});

router.get('/documents/:docId/preview/msg/attachments/:idx', requireAuthQueryOrHeader, async (req, res) => {
  const loaded = await loadAccessibleDocument(req, res);
  if (!loaded) return;
  try {
    const att = extractMsgAttachment(fs.readFileSync(loaded.filePath), parseInt(req.params.idx, 10));
    if (!att) return res.status(404).json({ error: 'Pièce jointe introuvable' });
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
    res.type(path.extname(att.fileName) || 'application/octet-stream');
    res.send(Buffer.from(att.content));
  } catch (err) {
    res.status(500).json({ error: `Extraction impossible : ${err.message}` });
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
    `SELECT v.*, d.projet_id, d.original_name, d.deleted_at AS doc_deleted_at
     FROM projet_document_versions v JOIN projet_documents d ON d.id = v.document_id
     WHERE v.id = $1`,
    [req.params.versionId]
  );
  if (!version) return res.status(404).json({ error: 'Version introuvable' });

  if (req.user.role !== 'admin') {
    const projetsService = require('./projets.service');
    const member = await projetsService.isMember(version.projet_id, req.user.sub);
    if (!member) return res.status(404).json({ error: 'Version introuvable' });
  }

  const filePath = path.join(UPLOAD_DIR, version.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier absent du stockage' });

  res.setHeader('Content-Type', version.mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`v${version.version}_${version.original_name}`)}`
  );
  fs.createReadStream(filePath).pipe(res);
});

// --- Champs de métadonnées (paramétrage projet) ------------------------------

router.get('/:id/metadata-fields', requireAuth, requireProjetMembership, async (req, res) => {
  const fields = await docs.listMetadataFields(req.params.id);
  res.json(fields);
});

router.post('/:id/metadata-fields', requireAuth, requireProjetMembership, async (req, res) => {
  const { cle, libelle, type, options, ordre } = req.body || {};
  if (!cle || !cle.trim() || !libelle || !libelle.trim()) {
    return res.status(400).json({ error: 'Clé et libellé requis' });
  }
  if (type && !['texte', 'date', 'liste'].includes(type)) {
    return res.status(400).json({ error: 'Type invalide (texte, date, ou liste)' });
  }
  try {
    const field = await docs.createMetadataField(req.params.id, { cle, libelle, type, options, ordre });
    res.status(201).json(field);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Cette clé existe déjà pour ce projet' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/metadata-fields/:fieldId', requireAuth, requireProjetMembership, async (req, res) => {
  const removed = await docs.deleteMetadataField(req.params.id, req.params.fieldId);
  if (!removed) return res.status(404).json({ error: 'Champ introuvable' });
  res.status(204).end();
});

module.exports = router;
