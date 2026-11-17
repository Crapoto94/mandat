// Migration .js (cf. scripts/migrate.js) : copie physique des fichiers sur
// disque pour la base documentaire unifiée (doc_documents, cf.
// 022_doc_storage_unified.sql) — une opération que le SQL seul ne peut pas
// faire.
//
// 1. Copie (jamais déplace) les fichiers de l'ancien dossier "projets"
//    (PROJET_DOCUMENTS_DIR) vers le nouveau dossier unifié (DOC_STORAGE_DIR)
//    — les doc_documents/doc_document_versions issus de la migration SQL
//    précédente pointent déjà vers ces mêmes stored_name.
// 2. Reprend les pièces jointes d'engagement (engagement_attachments, table
//    plus ancienne, jamais dans la GED) comme des doc_documents "racine" —
//    lignes DB + copie de fichier depuis ATTACHMENTS_DIR.
//
// Toujours des COPIES (jamais fs.unlink / rename côté source) : en cas de
// souci, l'ancien système (tables et fichiers projet_*/engagement_attachments)
// reste intact et pleinement fonctionnel.
const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.join(__dirname, '..');
const OLD_PROJET_DIR = process.env.PROJET_DOCUMENTS_DIR || path.join(BACKEND_ROOT, '..', 'data', 'projet-documents');
const OLD_ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || path.join(BACKEND_ROOT, '..', 'data', 'attachments');
const NEW_DIR = process.env.DOC_STORAGE_DIR || path.join(BACKEND_ROOT, '..', 'data', 'documents');

function copyDirFiles(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return { copied: 0, missing: 0 };
  fs.mkdirSync(destDir, { recursive: true });
  let copied = 0;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    if (!fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(destDir, name));
    copied++;
  }
  return { copied };
}

async function run({ client, schema }) {
  fs.mkdirSync(NEW_DIR, { recursive: true });

  const { copied: fromProjets } = copyDirFiles(OLD_PROJET_DIR, NEW_DIR);
  console.log(`[023_doc_storage_copy_files] ${fromProjets} fichier(s) copié(s) depuis ${OLD_PROJET_DIR}`);

  const { rows: alreadyMigrated } = await client.query(
    `SELECT COUNT(*)::int AS n FROM "${schema}".doc_documents WHERE engagement_id IS NOT NULL`
  );
  if (alreadyMigrated[0].n > 0) {
    console.log(`[023_doc_storage_copy_files] engagement_attachments déjà repris (${alreadyMigrated[0].n} ligne(s)) — étape ignorée`);
    return;
  }

  const { rows: attachments } = await client.query(`SELECT * FROM "${schema}".engagement_attachments`);
  console.log(`[023_doc_storage_copy_files] ${attachments.length} pièce(s) jointe(s) d'engagement à reprendre`);

  const existingStoredNames = new Set(
    (await client.query(`SELECT stored_name FROM "${schema}".doc_documents`)).rows.map((r) => r.stored_name)
  );

  let filesCopied = 0;
  let filesMissing = 0;
  for (const a of attachments) {
    // Nom de fichier réutilisé tel quel (extrêmement improbable qu'il entre
    // en collision avec un stored_name déjà présent, les deux étant des
    // UUID aléatoires) — filet de sécurité si jamais.
    let storedName = a.stored_name;
    if (existingStoredNames.has(storedName)) {
      const ext = path.extname(storedName);
      storedName = `${path.basename(storedName, ext)}-eng${a.id}${ext}`;
    }
    existingStoredNames.add(storedName);

    const baseName = (() => {
      const ext = path.extname(a.original_name);
      return ext ? a.original_name.slice(0, -ext.length) : a.original_name;
    })();

    await client.query(
      `INSERT INTO "${schema}".doc_documents
         (engagement_id, folder_id, stored_name, original_name, display_name, mime_type, size_bytes, uploaded_by, created_at, deleted_at, deleted_by)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [a.engagement_id, storedName, a.original_name, baseName, a.mime_type, a.size_bytes, a.uploaded_by, a.created_at, a.deleted_at, a.deleted_by]
    );

    const srcFile = path.join(OLD_ATTACHMENTS_DIR, a.stored_name);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, path.join(NEW_DIR, storedName));
      filesCopied++;
    } else {
      filesMissing++;
    }
  }
  console.log(`[023_doc_storage_copy_files] ${filesCopied} fichier(s) copié(s) depuis ${OLD_ATTACHMENTS_DIR}, ${filesMissing} introuvable(s) sur disque (ligne DB reprise quand même)`);
}

module.exports = { run };
