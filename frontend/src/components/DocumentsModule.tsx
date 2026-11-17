import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, apiErrorMessage, projetDocumentUrl, projetDocumentVersionUrl, projetMsgAttachmentUrl } from '../lib/api'
import { resolveCidImages } from '../lib/msgBody'
import { useDialogs } from '../hooks/useDialogs'
import { ownerBase } from '../lib/owner'
import type { ModuleOwner, ProjetDocument, ProjetDocumentVersion, ProjetFolder, ProjetMetadataField } from '../types'
import MsgAttachmentPreviewModal from './MsgAttachmentPreviewModal'
import {
  Folder,
  FolderPlus,
  File,
  FileArchive,
  Upload,
  Download,
  Pencil,
  Trash2,
  X,
  ChevronRight,
  Settings,
  Home,
  Tag,
  Mail,
  Paperclip,
  History,
  Filter,
  CheckSquare,
  Square,
} from 'lucide-react'

function formatSize(bytes: number | null) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

/** Extension en majuscules, sans le point — le "type de fichier" affiché
 * (docx, pdf, xlsx...), dérivé du nom réel (jamais du nom affiché,
 * renommable et potentiellement sans extension). */
function fileTypeLabel(originalName: string): string {
  const ext = originalName.split('.').pop()
  return ext && ext !== originalName ? ext.toUpperCase() : '—'
}

type PreviewKind = 'pdf' | 'image' | 'msg' | 'docx' | 'xlsx' | 'pptx' | 'none'

function previewKind(mimeType: string | null, name: string): PreviewKind {
  const mt = (mimeType || '').toLowerCase()
  const n = name.toLowerCase()
  if (mt === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (mt.startsWith('image/')) return 'image'
  if (n.endsWith('.msg') || mt === 'application/vnd.ms-outlook') return 'msg'
  if (n.endsWith('.docx')) return 'docx'
  if (n.endsWith('.xlsx')) return 'xlsx'
  if (n.endsWith('.pptx')) return 'pptx'
  return 'none'
}

/**
 * Base documentaire — module identique pour un projet ou un engagement
 * (même composant, même API sous /projets/:id/... ou /engagements/:id/...
 * — cf. backend/modules/documents/) : dossiers/sous-dossiers, dépôt de
 * fichiers ou d'un zip (recrée l'arborescence), renommage, métadonnées
 * libres définies par fiche (paramétrage). Pensée pour se comporter le
 * plus possible comme un lecteur réseau.
 */
export default function DocumentsModule({ owner, canEdit = true, canAdminister = true }: { owner: ModuleOwner; canEdit?: boolean; canAdminister?: boolean }) {
  const base = ownerBase(owner)
  const [folders, setFolders] = useState<ProjetFolder[]>([])
  const [documents, setDocuments] = useState<ProjetDocument[]>([])
  const [fields, setFields] = useState<ProjetMetadataField[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<ProjetDocument | null>(null)
  const [historyDoc, setHistoryDoc] = useState<ProjetDocument | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [bulkMetaField, setBulkMetaField] = useState('')
  const [bulkMetaValue, setBulkMetaValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { confirmAsync, promptAsync, dialog } = useDialogs()

  function loadFolders() {
    api.get(`${base}/folders`).then((res) => setFolders(res.data))
  }
  function loadDocuments() {
    api
      .get(`${base}/documents`, { params: currentFolderId ? { folder_id: currentFolderId } : {} })
      .then((res) => setDocuments(res.data))
      .catch((err) => setError(apiErrorMessage(err, 'Documents indisponibles')))
  }
  function loadFields() {
    api.get(`${base}/metadata-fields`).then((res) => setFields(res.data))
  }

  useEffect(() => {
    loadFolders()
    loadFields()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.kind, owner.id])

  useEffect(loadDocuments, [owner.kind, owner.id, currentFolderId])
  useEffect(() => setSelectedIds(new Set()), [currentFolderId])

  const filterableFields = fields.filter((f) => documents.some((d) => d.metadata?.[f.cle]))
  const filteredDocuments = documents.filter((doc) =>
    filterableFields.every((f) => {
      const want = filters[f.cle]
      if (!want) return true
      const have = doc.metadata?.[f.cle] || ''
      return f.type === 'liste' ? have === want : have.toLowerCase().includes(want.toLowerCase())
    })
  )
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const childFolders = folders.filter((f) => f.parent_id === currentFolderId)
  const breadcrumb: ProjetFolder[] = []
  {
    let cur = currentFolderId
    while (cur) {
      const f = folders.find((x) => x.id === cur)
      if (!f) break
      breadcrumb.unshift(f)
      cur = f.parent_id
    }
  }

  async function createFolder(e: FormEvent) {
    e.preventDefault()
    if (!newFolderName.trim()) return
    try {
      await api.post(`${base}/folders`, { nom: newFolderName.trim(), parent_id: currentFolderId })
      setNewFolderName('')
      setCreatingFolder(false)
      loadFolders()
    } catch (err) {
      setError(apiErrorMessage(err, 'Création du dossier impossible'))
    }
  }

  async function removeFolder(folderId: number) {
    const ok = await confirmAsync({
      title: 'Supprimer le dossier',
      message: 'Supprimer ce dossier et tout son contenu ? Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    try {
      await api.delete(`${base}/folders/${folderId}`)
      loadFolders()
      loadDocuments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Suppression impossible'))
    }
  }

/** Envoie des fichiers, avec un chemin relatif optionnel par fichier
   * (dossier glissé-déposé) — le serveur reconstitue l'arborescence. */
  async function uploadFiles(fileList: FileList | File[], relativePaths?: (string | null)[]) {
    const files = Array.from(fileList)
    if (!files.length) return
    setError(null)
    setUploading(true)
    try {
      // Un unique .zip déposé seul (sans venir d'un dossier) : dépôt comme
      // archive, dossiers recréés automatiquement — le plus simple possible.
      if (!relativePaths && files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        const form = new FormData()
        form.append('file', files[0])
        if (currentFolderId) form.append('folder_id', String(currentFolderId))
        await api.post(`${base}/documents/zip`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        const form = new FormData()
        for (const f of files) form.append('files', f)
        if (currentFolderId) form.append('folder_id', String(currentFolderId))
        if (relativePaths) form.append('paths', JSON.stringify(relativePaths))
        await api.post(`${base}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      loadFolders()
      loadDocuments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Dépôt impossible'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /** Parcourt récursivement les entrées glissées-déposées (fichiers et
   * dossiers) via l'API navigateur webkitGetAsEntry — sans elle (Safari
   * ancien, ou simple sélection de fichiers), `e.dataTransfer.files`
   * suffit et ne contient jamais de dossier. */
  async function readEntry(entry: FileSystemEntry, prefix: string, files: File[], paths: string[]): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
      files.push(file)
      paths.push(prefix + entry.name)
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      for (const child of children) await readEntry(child, `${prefix}${entry.name}/`, files, paths)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const items = e.dataTransfer.items
    const supportsEntries = items && items.length > 0 && typeof items[0]?.webkitGetAsEntry === 'function'

    if (supportsEntries) {
      const files: File[] = []
      const paths: string[] = []
      for (const item of Array.from(items)) {
        const entry = item.webkitGetAsEntry?.()
        if (entry) await readEntry(entry, '', files, paths)
      }
      if (files.length) {
        // Aucun fichier n'est réellement dans un sous-dossier (dépôt de
        // fichiers "à plat", pas d'un dossier) : chemin = nom simple partout,
        // équivalent à un dépôt classique — pas besoin de forcer le mode "paths".
        const hasNesting = paths.some((p) => p.includes('/'))
        return uploadFiles(files, hasNesting ? paths : undefined)
      }
      return
    }
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files)
  }

  async function renameDocument(doc: ProjetDocument) {
    const name = await promptAsync({ title: 'Renommer', message: `Nouveau nom pour « ${doc.display_name} » :`, defaultValue: doc.display_name })
    if (!name || !name.trim() || name === doc.display_name) return
    try {
      await api.patch(`${base}/documents/${doc.id}`, { display_name: name.trim() })
      loadDocuments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Renommage impossible'))
    }
  }

  async function removeDocument(doc: ProjetDocument) {
    const ok = await confirmAsync({ title: 'Supprimer le document', message: `Supprimer "${doc.display_name}" ?`, confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    try {
      await api.delete(`${base}/documents/${doc.id}`)
      loadDocuments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Suppression impossible'))
    }
  }

  async function setMetadataValue(doc: ProjetDocument, cle: string, valeur: string) {
    const metadata = { ...doc.metadata, [cle]: valeur }
    try {
      await api.patch(`${base}/documents/${doc.id}`, { metadata })
      loadDocuments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Métadonnée non enregistrée'))
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === filteredDocuments.length ? new Set() : new Set(filteredDocuments.map((d) => d.id))))
  }

  /** Suppression groupée — les documents sélectionnés sont supprimés un par
   * un (suppression douce, comme à l'unité) ; en cas d'échec partiel, le
   * message d'erreur porte sur ceux qui ont échoué. */
  async function bulkDelete() {
    const ok = await confirmAsync({
      title: 'Supprimer les documents sélectionnés',
      message: `Supprimer ${selectedIds.size} document(s) ? Cette action est réversible depuis la corbeille (admin).`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const ids = Array.from(selectedIds)
    const results = await Promise.allSettled(ids.map((id) => api.delete(`${base}/documents/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) setError(`${failed} document(s) n'ont pas pu être supprimés`)
    setSelectedIds(new Set())
    loadDocuments()
  }

  /** Applique une même métadonnée (clé + valeur) à tous les documents
   * sélectionnés — fusionnée avec les métadonnées déjà présentes sur
   * chacun, jamais un écrasement complet. */
  async function bulkApplyMetadata() {
    if (!bulkMetaField || !bulkMetaValue.trim()) return
    const ids = Array.from(selectedIds)
    const results = await Promise.allSettled(
      ids.map((id) => {
        const doc = documents.find((d) => d.id === id)
        const metadata = { ...(doc?.metadata || {}), [bulkMetaField]: bulkMetaValue.trim() }
        return api.patch(`${base}/documents/${id}`, { metadata })
      })
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) setError(`${failed} document(s) n'ont pas pu être mis à jour`)
    setBulkMetaValue('')
    loadDocuments()
  }

  return (
    <div
      className={`rounded-xl border p-5 transition-colors ${dragOver ? 'border-ville-blue bg-ville-blue/5' : 'border-slate-200 bg-white'}`}
      onDragOver={(e) => {
        if (!canEdit) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={canEdit ? handleDrop : (e) => e.preventDefault()}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Folder size={16} /> Documents
        </h2>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setCreatingFolder(true)}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <FolderPlus size={13} /> Nouveau dossier
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-md bg-ville-blue px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              <Upload size={13} /> {uploading ? 'Dépôt…' : 'Ajouter des fichiers'}
            </button>
          )}
          {!!filterableFields.length && (
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              title="Filtrer par métadonnée"
              className={`relative rounded-md p-1.5 hover:bg-slate-100 hover:text-ville-blue ${filtersOpen || activeFilterCount ? 'text-ville-blue' : 'text-slate-400'}`}
            >
              <Filter size={15} />
              {!!activeFilterCount && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ville-blue text-[9px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          {canAdminister && (
            <button
              onClick={() => setSettingsOpen(true)}
              title="Champs de métadonnées"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ville-blue"
            >
              <Settings size={15} />
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
        </div>
      </div>

      {canEdit ? (
        <p className="mb-3 text-xs text-slate-400">
          Glissez-déposez des fichiers ici (ou un .zip seul : son contenu recrée les dossiers automatiquement).
        </p>
      ) : (
        <p className="mb-3 text-xs text-slate-400">Accès en consultation seule.</p>
      )}

      {/* Fil d'Ariane */}
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => setCurrentFolderId(null)}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-100 ${currentFolderId === null ? 'font-medium text-slate-800' : 'text-slate-500'}`}
        >
          <Home size={13} /> Racine
        </button>
        {breadcrumb.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight size={13} className="text-slate-300" />
            <button
              onClick={() => setCurrentFolderId(f.id)}
              className={`rounded px-1.5 py-0.5 hover:bg-slate-100 ${f.id === currentFolderId ? 'font-medium text-slate-800' : 'text-slate-500'}`}
            >
              {f.nom}
            </button>
          </span>
        ))}
      </div>

      {filtersOpen && !!filterableFields.length && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2.5">
          {filterableFields.map((f) => (
            <div key={f.id} className="flex items-center gap-1">
              <span className="text-xs text-slate-500">{f.libelle} :</span>
              {f.type === 'liste' ? (
                <select
                  value={filters[f.cle] || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, [f.cle]: e.target.value }))}
                  className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                >
                  <option value="">Tous</option>
                  {Array.from(new Set(documents.map((d) => d.metadata?.[f.cle]).filter(Boolean))).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={filters[f.cle] || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, [f.cle]: e.target.value }))}
                  placeholder="contient…"
                  className="w-28 rounded border border-slate-300 px-1.5 py-1 text-xs"
                />
              )}
            </div>
          ))}
          {!!activeFilterCount && (
            <button onClick={() => setFilters({})} className="text-xs text-slate-400 hover:text-slate-600">
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {!!selectedIds.size && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-ville-blue/30 bg-ville-blue/5 p-2.5">
          <span className="text-xs font-medium text-ville-blue">{selectedIds.size} sélectionné(s)</span>
          {!!fields.length && (
            <>
              <select
                value={bulkMetaField}
                onChange={(e) => setBulkMetaField(e.target.value)}
                className="rounded border border-slate-300 px-1.5 py-1 text-xs"
              >
                <option value="">Appliquer une métadonnée…</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.cle}>
                    {f.libelle}
                  </option>
                ))}
              </select>
              {bulkMetaField && (
                <>
                  <input
                    value={bulkMetaValue}
                    onChange={(e) => setBulkMetaValue(e.target.value)}
                    placeholder="Valeur"
                    className="w-28 rounded border border-slate-300 px-1.5 py-1 text-xs"
                  />
                  <button
                    onClick={bulkApplyMetadata}
                    disabled={!bulkMetaValue.trim()}
                    className="rounded-md bg-ville-blue px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Appliquer à {selectedIds.size}
                  </button>
                </>
              )}
            </>
          )}
          <button onClick={bulkDelete} className="ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
            <Trash2 size={13} /> Supprimer la sélection
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-400 hover:text-slate-600">
            Annuler
          </button>
        </div>
      )}

      {creatingFolder && (
        <form onSubmit={createFolder} className="mb-3 flex items-center gap-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            autoFocus
            placeholder="Nom du dossier"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-ville-blue px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Créer
          </button>
          <button type="button" onClick={() => setCreatingFolder(false)} className="text-xs text-slate-400 hover:text-slate-600">
            Annuler
          </button>
        </form>
      )}

      {error && <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      {!childFolders.length && !documents.length ? (
        <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          Dossier vide — déposez des fichiers ici.
        </p>
      ) : !childFolders.length && !filteredDocuments.length ? (
        <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          Aucun document ne correspond aux filtres.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
          {childFolders.map((f) => (
            <li key={`f${f.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
              <button onClick={() => setCurrentFolderId(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
                <Folder size={16} className="shrink-0 text-amber-500" />
                <span className="truncate font-medium text-slate-800">{f.nom}</span>
              </button>
              {canEdit && (
                <button onClick={() => removeFolder(f.id)} className="shrink-0 text-slate-400 hover:text-red-600" title="Supprimer le dossier">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
          {canEdit && !!filteredDocuments.length && (
            <li className="flex items-center gap-2 bg-slate-50/60 px-3 py-1">
              <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-ville-blue">
                {selectedIds.size === filteredDocuments.length ? <CheckSquare size={14} /> : <Square size={14} />}
                Tout sélectionner
              </button>
            </li>
          )}
          {filteredDocuments.map((doc) => (
            <li key={`d${doc.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
              {canEdit && (
                <button onClick={() => toggleSelected(doc.id)} className="shrink-0 text-slate-300 hover:text-ville-blue" title="Sélectionner">
                  {selectedIds.has(doc.id) ? <CheckSquare size={15} className="text-ville-blue" /> : <Square size={15} />}
                </button>
              )}
              <button
                onClick={() => setPreviewDoc(doc)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                title={doc.original_name}
              >
                {doc.original_name.toLowerCase().endsWith('.zip') ? (
                  <FileArchive size={16} className="shrink-0 text-slate-400" />
                ) : (
                  <File size={16} className="shrink-0 text-slate-400" />
                )}
                <span className="truncate text-slate-800">{doc.display_name}</span>
                <span
                  className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
                  title={doc.original_name}
                >
                  {fileTypeLabel(doc.original_name)}
                </span>
                {doc.version > 1 && (
                  <span
                    title={`Version ${doc.version} — un fichier du même nom a déjà été déposé ${doc.version - 1} fois`}
                    className="shrink-0 rounded-full bg-ville-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-ville-blue"
                  >
                    v{doc.version}
                  </span>
                )}
                <span className="shrink-0 text-xs text-slate-400">{formatSize(doc.size_bytes)}</span>
              </button>
              {!!fields.length && (
                <div className="flex flex-wrap items-center gap-1">
                  {fields.map((field) => (
                    <MetadataChip
                      key={field.id}
                      field={field}
                      value={doc.metadata?.[field.cle] || ''}
                      onChange={(v) => setMetadataValue(doc, field.cle, v)}
                    />
                  ))}
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                {doc.version > 1 && (
                  <button
                    onClick={() => setHistoryDoc(doc)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ville-blue"
                    title="Historique des versions"
                  >
                    <History size={14} />
                  </button>
                )}
                <a
                  href={projetDocumentUrl(doc.id, true)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ville-blue"
                  title="Télécharger"
                >
                  <Download size={14} />
                </a>
                {canEdit && (
                  <button onClick={() => renameDocument(doc)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ville-blue" title="Renommer">
                    <Pencil size={14} />
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => removeDocument(doc)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {previewDoc && <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
      {historyDoc && <VersionHistoryModal doc={historyDoc} onClose={() => setHistoryDoc(null)} />}
      {settingsOpen && (
        <MetadataSettingsModal owner={owner} fields={fields} onClose={() => setSettingsOpen(false)} onChange={loadFields} />
      )}
      {dialog}
    </div>
  )
}

function MetadataChip({
  field,
  value,
  onChange,
}: {
  field: ProjetMetadataField
  value: string
  onChange: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setDraft(value)
          setEditing(true)
        }}
        title={field.libelle}
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${value ? 'bg-ville-blue/10 text-ville-blue' : 'bg-slate-100 text-slate-400'}`}
      >
        <Tag size={10} /> {value || field.libelle}
      </button>
    )
  }

  return (
    <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
      {field.type === 'liste' ? (
        <select
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            onChange(e.target.value)
            setEditing(false)
          }}
          onBlur={() => setEditing(false)}
          className="rounded border border-slate-300 px-1 py-0.5 text-xs"
        >
          <option value="">—</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          autoFocus
          type={field.type === 'date' ? 'date' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onChange(draft)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onChange(draft)
              setEditing(false)
            }
          }}
          className="w-24 rounded border border-slate-300 px-1 py-0.5 text-xs"
        />
      )}
    </span>
  )
}

interface MsgPreview {
  subject: string
  from: string
  to: string[]
  cc: string[]
  date: string | null
  bodyText: string
  bodyHtml: string
  attachments: { index: number; fileName: string; contentLength: number; mimeType: string | null }[]
  inlineImages: { contentId: string; index: number }[]
}
interface XlsxPreview {
  sheets: { name: string; html: string }[]
}
interface PptxPreview {
  slides: { index: number; text: string }[]
}

function DocPreviewModal({ doc, onClose }: { doc: ProjetDocument; onClose: () => void }) {
  const kind = previewKind(doc.mime_type, doc.original_name)
  const url = projetDocumentUrl(doc.id)

  const [loading, setLoading] = useState(['msg', 'docx', 'xlsx', 'pptx'].includes(kind))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [msg, setMsg] = useState<MsgPreview | null>(null)
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [xlsx, setXlsx] = useState<XlsxPreview | null>(null)
  const [pptx, setPptx] = useState<PptxPreview | null>(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [previewAttachment, setPreviewAttachment] = useState<{ index: number; fileName: string; mimeType: string | null } | null>(null)

  useEffect(() => {
    if (kind === 'msg') {
      api.get(`/projets/documents/${doc.id}/preview/msg`).then((res) => setMsg(res.data)).catch((err) => setLoadError(apiErrorMessage(err, 'Lecture impossible'))).finally(() => setLoading(false))
    } else if (kind === 'docx') {
      api.get(`/projets/documents/${doc.id}/preview/docx`).then((res) => setDocxHtml(res.data.html)).catch((err) => setLoadError(apiErrorMessage(err, 'Aperçu impossible'))).finally(() => setLoading(false))
    } else if (kind === 'xlsx') {
      api.get(`/projets/documents/${doc.id}/preview/xlsx`).then((res) => setXlsx(res.data)).catch((err) => setLoadError(apiErrorMessage(err, 'Aperçu impossible'))).finally(() => setLoading(false))
    } else if (kind === 'pptx') {
      api.get(`/projets/documents/${doc.id}/preview/pptx`).then((res) => setPptx(res.data)).catch((err) => setLoadError(apiErrorMessage(err, 'Aperçu impossible'))).finally(() => setLoading(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, kind])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          {kind === 'msg' ? <Mail size={18} className="shrink-0 text-ville-blue" /> : <File size={18} className="shrink-0 text-ville-blue" />}
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
            {kind === 'msg' && msg ? (
              <>
                <span className="text-ville-blue">{msg.from || 'Expéditeur inconnu'}</span>
                <span className="text-slate-400"> — </span>
                {msg.subject}
              </>
            ) : (
              doc.display_name
            )}
          </p>
          <a
            href={projetDocumentUrl(doc.id, true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-ville-blue px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Download size={13} /> Télécharger
          </a>
          <button onClick={onClose} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden bg-slate-100">
          {kind === 'pdf' && <iframe src={url} title={doc.display_name} className="h-full w-full border-0" />}
          {kind === 'image' && (
            <div className="flex h-full items-center justify-center overflow-auto p-5">
              <img src={url} alt={doc.display_name} className="max-h-full max-w-full object-contain" />
            </div>
          )}

          {loading && <p className="p-8 text-center text-sm text-slate-500">Chargement de l'aperçu…</p>}
          {loadError && <p className="p-8 text-center text-sm text-red-600">{loadError}</p>}

          {kind === 'msg' && !loading && !loadError && msg && (
            <div className="flex h-full flex-col overflow-hidden bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
                  <Mail size={16} className="text-ville-blue" /> {msg.subject}
                </p>
                <p className="text-sm text-slate-600">
                  <span className="font-medium">De :</span> {msg.from || '—'}
                </p>
                {!!msg.to.length && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">À :</span> {msg.to.join(', ')}
                  </p>
                )}
                {!!msg.cc.length && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Cc :</span> {msg.cc.join(', ')}
                  </p>
                )}
                <p className="text-sm text-slate-600">
                  <span className="font-medium">Date :</span> {msg.date ? new Date(msg.date).toLocaleString('fr-FR') : '—'}
                </p>
              </div>
              {!!msg.attachments.length && (
                <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
                  {msg.attachments.map((a) => (
                    <button
                      key={a.index}
                      onClick={() => setPreviewAttachment(a)}
                      className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      <Paperclip size={12} /> {a.fileName}{' '}
                      <span className="rounded bg-slate-100 px-1 text-[9px] font-medium uppercase text-slate-500">{fileTypeLabel(a.fileName)}</span>
                      <span className="text-slate-400">({formatSize(a.contentLength)})</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                {msg.bodyHtml ? (
                  <iframe
                    srcDoc={resolveCidImages(msg.bodyHtml, msg.inlineImages, (idx) => projetMsgAttachmentUrl(doc.id, idx))}
                    sandbox=""
                    title={msg.subject}
                    className="h-full w-full border-0"
                  />
                ) : (
                  <div className="h-full overflow-y-auto whitespace-pre-wrap p-5 text-sm text-slate-800">{msg.bodyText}</div>
                )}
              </div>
            </div>
          )}

          {kind === 'docx' && !loading && !loadError && docxHtml !== null && (
            <div className="h-full overflow-y-auto bg-white p-8">
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: docxHtml }} />
            </div>
          )}

          {kind === 'xlsx' && !loading && !loadError && xlsx && (
            <div className="flex h-full flex-col bg-white">
              {xlsx.sheets.length > 1 && (
                <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
                  {xlsx.sheets.map((s, i) => (
                    <button
                      key={s.name}
                      onClick={() => setActiveSheet(i)}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${i === activeSheet ? 'bg-ville-blue text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              <div
                className="flex-1 overflow-auto p-4 text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1"
                dangerouslySetInnerHTML={{ __html: xlsx.sheets[activeSheet]?.html || '' }}
              />
            </div>
          )}

          {kind === 'pptx' && !loading && !loadError && pptx && (
            <div className="h-full overflow-y-auto bg-white p-5">
              <p className="mb-3 text-xs text-slate-400">
                Aperçu texte des diapositives (mise en forme et images non affichées) — téléchargez pour voir le rendu complet.
              </p>
              <div className="space-y-3">
                {pptx.slides.map((s) => (
                  <div key={s.index} className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Diapositive {s.index}</p>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{s.text || <span className="text-slate-300">(vide)</span>}</p>
                  </div>
                ))}
                {!pptx.slides.length && <p className="text-sm text-slate-400">Aucune diapositive détectée.</p>}
              </div>
            </div>
          )}

          {kind === 'none' && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <File size={56} className="text-slate-400" />
              <p className="text-sm text-slate-500">Prévisualisation non disponible pour ce type de fichier.</p>
            </div>
          )}
        </div>
      </div>
      {previewAttachment && (
        <MsgAttachmentPreviewModal
          fileName={previewAttachment.fileName}
          mimeType={previewAttachment.mimeType}
          rawUrl={projetMsgAttachmentUrl(doc.id, previewAttachment.index)}
          downloadUrl={projetMsgAttachmentUrl(doc.id, previewAttachment.index, true)}
          previewEndpoint={`/projets/documents/${doc.id}/preview/msg/attachments/${previewAttachment.index}/preview`}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  )
}

function VersionHistoryModal({ doc, onClose }: { doc: ProjetDocument; onClose: () => void }) {
  const [versions, setVersions] = useState<ProjetDocumentVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const base = doc.engagement_id ? `/engagements/${doc.engagement_id}` : `/projets/${doc.projet_id}`
    api
      .get(`${base}/documents/${doc.id}/versions`)
      .then((res) => setVersions(res.data))
      .catch((err) => setError(apiErrorMessage(err, 'Historique indisponible')))
  }, [doc.id, doc.projet_id, doc.engagement_id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <History size={16} /> Historique — {doc.display_name}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>
        <ul className="space-y-1.5">
          <li className="flex items-center justify-between rounded-md bg-ville-blue/5 px-3 py-1.5 text-sm">
            <span className="font-medium text-ville-blue">v{doc.version} (actuelle)</span>
            <span className="text-xs text-slate-400">{formatSize(doc.size_bytes)}</span>
          </li>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {versions?.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
              <div>
                <span className="font-medium text-slate-700">v{v.version}</span>{' '}
                <span className="text-xs text-slate-400">
                  {v.uploaded_by || 'inconnu'} · {new Date(v.created_at).toLocaleString('fr-FR')}
                </span>
              </div>
              <a href={projetDocumentVersionUrl(v.id)} className="flex items-center gap-1 text-xs font-medium text-ville-blue hover:underline">
                <Download size={12} /> {formatSize(v.size_bytes)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function MetadataSettingsModal({
  owner,
  fields,
  onClose,
  onChange,
}: {
  owner: ModuleOwner
  fields: ProjetMetadataField[]
  onClose: () => void
  onChange: () => void
}) {
  const base = ownerBase(owner)
  const [libelle, setLibelle] = useState('')
  const [type, setType] = useState<'texte' | 'date' | 'liste'>('texte')
  const [optionsText, setOptionsText] = useState('')
  const [error, setError] = useState<string | null>(null)

  /** La clé technique (cle) est dérivée du libellé — pas besoin de la
   * demander à l'utilisateur, qui ne s'en sert jamais directement. */
  function slugify(str: string) {
    return str
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!libelle.trim()) return
    try {
      await api.post(`${base}/metadata-fields`, {
        cle: slugify(libelle) || `champ_${Date.now()}`,
        libelle: libelle.trim(),
        type,
        options: type === 'liste' ? optionsText.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      })
      setLibelle('')
      setOptionsText('')
      setError(null)
      onChange()
    } catch (err) {
      setError(apiErrorMessage(err, 'Création impossible'))
    }
  }

  async function remove(id: number) {
    await api.delete(`${base}/metadata-fields/${id}`)
    onChange()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Métadonnées des documents</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>
        <ul className="mb-4 space-y-1.5">
          {fields.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
              <span>
                {f.libelle} <span className="text-xs text-slate-400">({f.type})</span>
              </span>
              <button onClick={() => remove(f.id)} className="text-slate-400 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {!fields.length && <p className="text-xs text-slate-400">Aucun champ défini pour l'instant.</p>}
        </ul>
        <form onSubmit={add} className="space-y-2 border-t border-slate-100 pt-3">
          <input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Libellé (ex : Type de document)"
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
            >
              <option value="texte">Texte</option>
              <option value="date">Date</option>
              <option value="liste">Liste</option>
            </select>
            {type === 'liste' && (
              <input
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Valeurs séparées par une virgule"
                className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
              />
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={!libelle.trim()}
            className="rounded-md bg-ville-blue px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            Ajouter le champ
          </button>
        </form>
      </div>
    </div>
  )
}
