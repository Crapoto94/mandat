// Base documentaire partagée — sert identiquement les projets et les
// engagements (même tables doc_*, cf. migrations/022_doc_storage_unified.sql
// et 023_doc_storage_copy_files.js). Toute fonction ici prend un `owner` =
// { projetId } ou { engagementId } (jamais les deux), jamais un id nu, pour
// qu'on ne puisse pas se tromper de colonne par erreur d'appelant.
const path = require('path');
const fs = require('fs');
const { db } = require('../../db/pg_db');

const UPLOAD_DIR = process.env.DOC_STORAGE_DIR || path.join(__dirname, '..', '..', '..', 'data', 'documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Colonne + valeur portant la relation de propriété — dérivé une fois pour
 * toutes les requêtes de ce module. */
function ownerColumn(owner) {
  if (owner.projetId != null) return { col: 'projet_id', id: Number(owner.projetId) };
  if (owner.engagementId != null) return { col: 'engagement_id', id: Number(owner.engagementId) };
  throw new Error('owner invalide : ni projetId ni engagementId');
}

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

/** Tous les fichiers (disque) d'un propriétaire — version courante ET
 * versions archivées de chaque document, y compris déjà en corbeille — pour
 * tout nettoyer avant une suppression définitive du projet/engagement. */
async function listAllStoredNames(owner) {
  const { col, id } = ownerColumn(owner);
  const [current, versions] = await Promise.all([
    db.all(`SELECT stored_name FROM doc_documents WHERE ${col} = $1`, [id]),
    db.all(
      `SELECT v.stored_name FROM doc_document_versions v
       JOIN doc_documents d ON d.id = v.document_id
       WHERE d.${col} = $1`,
      [id]
    ),
  ]);
  return [...current.map((r) => r.stored_name), ...versions.map((r) => r.stored_name)];
}

async function listFolders(owner) {
  const { col, id } = ownerColumn(owner);
  return db.all(`SELECT * FROM doc_folders WHERE ${col} = $1 ORDER BY nom ASC`, [id]);
}

async function listDocuments(owner, folderId) {
  const { col, id } = ownerColumn(owner);
  const clause = folderId ? `folder_id = $2` : `folder_id IS NULL`;
  const params = folderId ? [id, folderId] : [id];
  return db.all(`SELECT * FROM doc_documents WHERE ${col} = $1 AND ${clause} AND deleted_at IS NULL ORDER BY display_name ASC`, params);
}

async function createFolder(owner, parentId, nom, author) {
  const { col, id } = ownerColumn(owner);
  return db.get(
    `INSERT INTO doc_folders (${col}, parent_id, nom, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, parentId || null, nom.trim(), author || null]
  );
}

/** Retrouve un sous-dossier par nom sous ce parent, ou le crée — utilisé
 * pour la création manuelle (éviter les doublons) et pour reconstituer
 * l'arborescence d'un zip déposé. */
async function findOrCreateFolder(owner, parentId, nom, author) {
  const { col, id } = ownerColumn(owner);
  const params = [id, nom];
  let clause = 'parent_id IS NULL';
  if (parentId) {
    params.push(parentId);
    clause = `parent_id = $${params.length}`;
  }
  const existing = await db.get(`SELECT * FROM doc_folders WHERE ${col} = $1 AND nom = $2 AND ${clause}`, params);
  if (existing) return existing;
  return createFolder(owner, parentId, nom, author);
}

/** Résout (en créant au besoin) la chaîne de sous-dossiers d'un chemin
 * relatif ("A/B/C") sous un dossier racine — partagé entre le dépôt de zip
 * et le dépôt d'un dossier glissé-déposé. `cache` (Map) est à fournir par
 * l'appelant et réutiliser sur tout un lot de fichiers. */
async function resolveFolderPath(owner, rootFolderId, dirParts, author, cache) {
  let currentPath = '';
  let parentId = rootFolderId;
  for (const part of dirParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (cache.has(currentPath)) {
      parentId = cache.get(currentPath);
      continue;
    }
    const folder = await findOrCreateFolder(owner, parentId, part, author);
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
    const folder = await db.get(`SELECT id, nom, parent_id FROM doc_folders WHERE id = $1`, [current]);
    if (!folder) break;
    chain.unshift({ id: folder.id, nom: folder.nom });
    current = folder.parent_id;
  }
  return chain;
}

async function deleteFolder(owner, folderId) {
  const { col, id } = ownerColumn(owner);
  const [current, versions] = await Promise.all([
    db.all(
      `WITH RECURSIVE sub AS (
         SELECT id FROM doc_folders WHERE id = $1 AND ${col} = $2
         UNION ALL
         SELECT f.id FROM doc_folders f JOIN sub ON f.parent_id = sub.id
       )
       SELECT stored_name FROM doc_documents WHERE folder_id IN (SELECT id FROM sub)`,
      [folderId, id]
    ),
    db.all(
      `WITH RECURSIVE sub AS (
         SELECT id FROM doc_folders WHERE id = $1 AND ${col} = $2
         UNION ALL
         SELECT f.id FROM doc_folders f JOIN sub ON f.parent_id = sub.id
       )
       SELECT v.stored_name FROM doc_document_versions v
       JOIN doc_documents d ON d.id = v.document_id
       WHERE d.folder_id IN (SELECT id FROM sub)`,
      [folderId, id]
    ),
  ]);
  const result = await db.run(`DELETE FROM doc_folders WHERE id = $1 AND ${col} = $2`, [folderId, id]);
  return { deleted: result.changes > 0, storedNames: [...current.map((d) => d.stored_name), ...versions.map((d) => d.stored_name)] };
}

/** Dépose un fichier — si un document actif du même nom existe déjà dans le
 * même dossier, ce dépôt en devient une NOUVELLE VERSION (l'ancienne est
 * archivée dans doc_document_versions, son fichier jamais supprimé) plutôt
 * qu'un second document séparé. Renvoie { document, isNewVersion }. */
async function createDocument({ owner, folderId, storedName, originalName, mimeType, sizeBytes, author }) {
  const { col, id } = ownerColumn(owner);
  const folderClause = folderId ? `folder_id = $2` : `folder_id IS NULL`;
  const params = folderId ? [id, folderId, originalName] : [id, originalName];
  const existing = await db.get(
    `SELECT * FROM doc_documents
     WHERE ${col} = $1 AND ${folderClause} AND LOWER(original_name) = LOWER($${params.length})
       AND deleted_at IS NULL`,
    params
  );

  if (existing) {
    await db.run(
      `INSERT INTO doc_document_versions (document_id, version, stored_name, mime_type, size_bytes, uploaded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [existing.id, existing.version, existing.stored_name, existing.mime_type, existing.size_bytes, existing.uploaded_by, existing.created_at]
    );
    const document = await db.get(
      `UPDATE doc_documents SET stored_name = $1, mime_type = $2, size_bytes = $3, uploaded_by = $4, version = version + 1, created_at = now()
       WHERE id = $5 RETURNING *`,
      [storedName, mimeType || null, sizeBytes || null, author || null, existing.id]
    );
    return { document, isNewVersion: true };
  }

  const document = await db.get(
    `INSERT INTO doc_documents (${col}, folder_id, stored_name, original_name, display_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [id, folderId || null, storedName, originalName, baseName(originalName), mimeType || null, sizeBytes || null, author || null]
  );
  return { document, isNewVersion: false };
}

async function listVersions(owner, docId) {
  const { col, id } = ownerColumn(owner);
  const doc = await db.get(`SELECT id FROM doc_documents WHERE id = $1 AND ${col} = $2`, [docId, id]);
  if (!doc) return null;
  return db.all(`SELECT * FROM doc_document_versions WHERE document_id = $1 ORDER BY version DESC`, [docId]);
}

async function updateDocument(owner, docId, { display_name, metadata, folder_id }) {
  const { col, id } = ownerColumn(owner);
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
  if (!sets.length) return db.get(`SELECT * FROM doc_documents WHERE id = $1 AND ${col} = $2`, [docId, id]);
  params.push(docId, id);
  return db.get(
    `UPDATE doc_documents SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND ${col} = $${params.length} RETURNING *`,
    params
  );
}

async function softDeleteDocument(owner, docId, author) {
  const { col, id } = ownerColumn(owner);
  return db.get(
    `UPDATE doc_documents SET deleted_at = now(), deleted_by = $1
     WHERE id = $2 AND ${col} = $3 AND deleted_at IS NULL RETURNING *`,
    [author || null, docId, id]
  );
}

// --- Champs de métadonnées (paramétrage) -------------------------------------

async function listMetadataFields(owner) {
  const { col, id } = ownerColumn(owner);
  return db.all(`SELECT * FROM doc_metadata_fields WHERE ${col} = $1 ORDER BY ordre ASC, id ASC`, [id]);
}

async function createMetadataField(owner, { cle, libelle, type, options, ordre }) {
  const { col, id } = ownerColumn(owner);
  return db.get(
    `INSERT INTO doc_metadata_fields (${col}, cle, libelle, type, options, ordre)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, cle.trim(), libelle.trim(), type || 'texte', options ? JSON.stringify(options) : null, ordre || 0]
  );
}

async function deleteMetadataField(owner, fieldId) {
  const { col, id } = ownerColumn(owner);
  const result = await db.run(`DELETE FROM doc_metadata_fields WHERE id = $1 AND ${col} = $2`, [fieldId, id]);
  return result.changes > 0;
}

module.exports = {
  UPLOAD_DIR,
  ownerColumn,
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
  listVersions,
  updateDocument,
  softDeleteDocument,
  listMetadataFields,
  createMetadataField,
  deleteMetadataField,
};
