// Base documentaire par projet — cf. migrations/019_projet_documents.sql.
const path = require('path');
const fs = require('fs');
const { db } = require('../../db/pg_db');

const UPLOAD_DIR = process.env.PROJET_DOCUMENTS_DIR || path.join(__dirname, '..', '..', '..', 'data', 'projet-documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Nom de fichier sans son extension — nom affiché par défaut à l'upload. */
function baseName(originalName) {
  const ext = path.extname(originalName);
  return ext ? originalName.slice(0, -ext.length) : originalName;
}

/** Supprime des fichiers du stockage disque — best effort (un fichier déjà
 * absent n'est pas une erreur). */
function deleteStoredFiles(storedNames) {
  for (const name of storedNames) fs.unlink(path.join(UPLOAD_DIR, name), () => {});
}

/** Tous les fichiers (disque) d'un projet, y compris déjà en corbeille —
 * pour tout nettoyer avant une suppression définitive du projet. */
async function listAllStoredNames(projetId) {
  const rows = await db.all(`SELECT stored_name FROM projet_documents WHERE projet_id = $1`, [projetId]);
  return rows.map((r) => r.stored_name);
}

async function listFolders(projetId) {
  return db.all(`SELECT * FROM projet_folders WHERE projet_id = $1 ORDER BY nom ASC`, [projetId]);
}

async function listDocuments(projetId, folderId) {
  const clause = folderId ? `folder_id = $2` : `folder_id IS NULL`;
  const params = folderId ? [projetId, folderId] : [projetId];
  return db.all(
    `SELECT * FROM projet_documents WHERE projet_id = $1 AND ${clause} AND deleted_at IS NULL ORDER BY display_name ASC`,
    params
  );
}

async function createFolder(projetId, parentId, nom, author) {
  return db.get(
    `INSERT INTO projet_folders (projet_id, parent_id, nom, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [projetId, parentId || null, nom.trim(), author || null]
  );
}

/** Retrouve un sous-dossier par nom sous ce parent, ou le crée — utilisé
 * pour la création manuelle (éviter les doublons) et pour reconstituer
 * l'arborescence d'un zip déposé. */
async function findOrCreateFolder(projetId, parentId, nom, author) {
  const params = [projetId, nom];
  let clause = 'parent_id IS NULL';
  if (parentId) {
    params.push(parentId);
    clause = `parent_id = $${params.length}`;
  }
  const existing = await db.get(
    `SELECT * FROM projet_folders WHERE projet_id = $1 AND nom = $2 AND ${clause}`,
    params
  );
  if (existing) return existing;
  return createFolder(projetId, parentId, nom, author);
}

/** Résout (en créant au besoin) la chaîne de sous-dossiers d'un chemin
 * relatif ("A/B/C") sous un dossier racine — partagé entre le dépôt de zip
 * et le dépôt d'un dossier glissé-déposé depuis l'explorateur du
 * navigateur (même logique de reconstitution d'arborescence). `cache`
 * (Map) est à fournir par l'appelant et réutiliser sur tout un lot de
 * fichiers, pour ne créer chaque dossier qu'une seule fois. */
async function resolveFolderPath(projetId, rootFolderId, dirParts, author, cache) {
  let currentPath = '';
  let parentId = rootFolderId;
  for (const part of dirParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (cache.has(currentPath)) {
      parentId = cache.get(currentPath);
      continue;
    }
    const folder = await findOrCreateFolder(projetId, parentId, part, author);
    cache.set(currentPath, folder.id);
    parentId = folder.id;
  }
  return parentId;
}

/** Chemin complet d'un dossier (fil d'Ariane), racine → feuille. */
async function folderPath(folderId) {
  const chain = [];
  let current = folderId;
  while (current) {
    const folder = await db.get(`SELECT id, nom, parent_id FROM projet_folders WHERE id = $1`, [current]);
    if (!folder) break;
    chain.unshift({ id: folder.id, nom: folder.nom });
    current = folder.parent_id;
  }
  return chain;
}

async function deleteFolder(projetId, folderId) {
  // Récupère récursivement tous les documents sous ce dossier (lui-même et
  // ses descendants) pour nettoyer leurs fichiers sur disque avant que le
  // ON DELETE CASCADE ne supprime les lignes.
  const docs = await db.all(
    `WITH RECURSIVE sub AS (
       SELECT id FROM projet_folders WHERE id = $1 AND projet_id = $2
       UNION ALL
       SELECT f.id FROM projet_folders f JOIN sub ON f.parent_id = sub.id
     )
     SELECT stored_name FROM projet_documents WHERE folder_id IN (SELECT id FROM sub) AND deleted_at IS NULL`,
    [folderId, projetId]
  );
  const result = await db.run(`DELETE FROM projet_folders WHERE id = $1 AND projet_id = $2`, [folderId, projetId]);
  return { deleted: result.changes > 0, storedNames: docs.map((d) => d.stored_name) };
}

async function createDocument({ projetId, folderId, storedName, originalName, mimeType, sizeBytes, author }) {
  return db.get(
    `INSERT INTO projet_documents (projet_id, folder_id, stored_name, original_name, display_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [projetId, folderId || null, storedName, originalName, baseName(originalName), mimeType || null, sizeBytes || null, author || null]
  );
}

async function updateDocument(projetId, docId, { display_name, metadata, folder_id }) {
  const sets = [];
  const params = [];
  if (display_name !== undefined) {
    params.push(display_name.trim());
    sets.push(`display_name = $${params.length}`);
  }
  if (metadata !== undefined) {
    params.push(JSON.stringify(metadata));
    sets.push(`metadata = $${params.length}`);
  }
  if (folder_id !== undefined) {
    params.push(folder_id || null);
    sets.push(`folder_id = $${params.length}`);
  }
  if (!sets.length) return db.get(`SELECT * FROM projet_documents WHERE id = $1 AND projet_id = $2`, [docId, projetId]);
  params.push(docId, projetId);
  return db.get(
    `UPDATE projet_documents SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND projet_id = $${params.length} RETURNING *`,
    params
  );
}

async function softDeleteDocument(projetId, docId, author) {
  return db.get(
    `UPDATE projet_documents SET deleted_at = now(), deleted_by = $1
     WHERE id = $2 AND projet_id = $3 AND deleted_at IS NULL RETURNING *`,
    [author || null, docId, projetId]
  );
}

// --- Champs de métadonnées (paramétrage projet) -----------------------------

async function listMetadataFields(projetId) {
  return db.all(`SELECT * FROM projet_metadata_fields WHERE projet_id = $1 ORDER BY ordre ASC, id ASC`, [projetId]);
}

async function createMetadataField(projetId, { cle, libelle, type, options, ordre }) {
  return db.get(
    `INSERT INTO projet_metadata_fields (projet_id, cle, libelle, type, options, ordre)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [projetId, cle.trim(), libelle.trim(), type || 'texte', options ? JSON.stringify(options) : null, ordre || 0]
  );
}

async function deleteMetadataField(projetId, fieldId) {
  const result = await db.run(`DELETE FROM projet_metadata_fields WHERE id = $1 AND projet_id = $2`, [fieldId, projetId]);
  return result.changes > 0;
}

module.exports = {
  UPLOAD_DIR,
  deleteStoredFiles,
  listAllStoredNames,
  resolveFolderPath,
  baseName,
  listFolders,
  listDocuments,
  createFolder,
  findOrCreateFolder,
  folderPath,
  deleteFolder,
  createDocument,
  updateDocument,
  softDeleteDocument,
  listMetadataFields,
  createMetadataField,
  deleteMetadataField,
};
