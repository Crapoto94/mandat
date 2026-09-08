import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, apiErrorMessage, projetDocumentUrl } from '../lib/api'
import type { ProjetDocument, ProjetFolder, ProjetMetadataField } from '../types'
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
} from 'lucide-react'

function formatSize(bytes: number | null) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function previewKind(mimeType: string | null, name: string): 'pdf' | 'image' | 'none' {
  const mt = (mimeType || '').toLowerCase()
  if (mt === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (mt.startsWith('image/')) return 'image'
  return 'none'
}

/**
 * Base documentaire d'un projet — pensée pour se comporter le plus possible
 * comme un lecteur réseau : dossiers/sous-dossiers, dépôt de fichiers ou
 * d'un zip (recrée l'arborescence), renommage, métadonnées libres définies
 * par projet (paramétrage).
 */
export default function ProjetDocuments({ projetId }: { projetId: number }) {
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
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function loadFolders() {
    api.get(`/projets/${projetId}/folders`).then((res) => setFolders(res.data))
  }
  function loadDocuments() {
    api
      .get(`/projets/${projetId}/documents`, { params: currentFolderId ? { folder_id: currentFolderId } : {} })
      .then((res) => setDocuments(res.data))
      .catch((err) => setError(apiErrorMessage(err, 'Documents indisponibles')))
  }
  function loadFields() {
    api.get(`/projets/${projetId}/metadata-fields`).then((res) => setFields(res.data))
  }

  useEffect(() => {
    loadFolders()
    loadFields()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetId])

  useEffect(loadDocuments, [projetId, currentFolderId])

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
      await api.post(`/projets/${projetId}/folders`, { nom: newFolderName.trim(), parent_id: currentFolderId })
      setNewFolderName('')
      setCreatingFolder(false)
      loadFolders()
    } catch (err) {
      setError(apiErrorMessage(err, 'Création du dossier impossible'))
    }
  }

  async function removeFolder(folderId: number) {
    if (!confirm('Supprimer ce dossier et tout son contenu ? Cette action est irréversible.')) return
    try {
      await api.delete(`/projets/${projetId}/folders/${folderId}`)
      loadFolders()
      loadDocuments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Suppression impossible'))
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return
    setError(null)
    setUploading(true)
    try {
      // Un unique .zip déposé seul : on le dépose comme archive (dossiers
      // recréés automatiquement) — comportement "le plus simple possible".
      // Sinon (un ou plusieurs fichiers, zip ou non), dépôt direct.
      if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        const form = new FormData()
        form.append('file', files[0])
        if (currentFolderId) form.append('folder_id', String(currentFolderId))
        await api.post(`/projets/${projetId}/documents/zip`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        const form = new FormData()
        for (const f of files) form.append('files', f)
        if (currentFolderId) form.append('folder_id', String(currentFolderId))
        await api.post(`/projets/${projetId}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
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

  async function renameDocument(doc: ProjetDocument) {
    const name = prompt('Nouveau nom :', doc.display_name)
    if (!name || !name.trim() || name === doc.display_name) return
    try {
      await api.patch(`/projets/${projetId}/documents/${doc.id}`, { display_name: name.trim() })
      loadDocuments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Renommage impossible'))
    }
  }

  async function removeDocument(doc: ProjetDocument) {
    if (!confirm(`Supprimer "${doc.display_name}" ?`)) return
    try {
      await api.delete(`/projets/${projetId}/documents/${doc.id}`)
      loadDocuments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Suppression impossible'))
    }
  }

  async function setMetadataValue(doc: ProjetDocument, cle: string, valeur: string) {
    const metadata = { ...doc.metadata, [cle]: valeur }
    try {
      await api.patch(`/projets/${projetId}/documents/${doc.id}`, { metadata })
      loadDocuments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Métadonnée non enregistrée'))
    }
  }

  return (
    <div
      className={`rounded-xl border p-5 transition-colors ${dragOver ? 'border-ville-blue bg-ville-blue/5' : 'border-slate-200 bg-white'}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files)
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Folder size={16} /> Documents
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreatingFolder(true)}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <FolderPlus size={13} /> Nouveau dossier
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-md bg-ville-blue px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            <Upload size={13} /> {uploading ? 'Dépôt…' : 'Ajouter des fichiers'}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Champs de métadonnées"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ville-blue"
          >
            <Settings size={15} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-400">
        Glissez-déposez des fichiers ici (ou un .zip seul : son contenu recrée les dossiers automatiquement).
      </p>

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
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
          {childFolders.map((f) => (
            <li key={`f${f.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
              <button onClick={() => setCurrentFolderId(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
                <Folder size={16} className="shrink-0 text-amber-500" />
                <span className="truncate font-medium text-slate-800">{f.nom}</span>
              </button>
              <button onClick={() => removeFolder(f.id)} className="shrink-0 text-slate-400 hover:text-red-600" title="Supprimer le dossier">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {documents.map((doc) => (
            <li key={`d${doc.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
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
                <a
                  href={projetDocumentUrl(doc.id, true)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ville-blue"
                  title="Télécharger"
                >
                  <Download size={14} />
                </a>
                <button onClick={() => renameDocument(doc)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ville-blue" title="Renommer">
                  <Pencil size={14} />
                </button>
                <button onClick={() => removeDocument(doc)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Supprimer">
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {previewDoc && <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
      {settingsOpen && (
        <MetadataSettingsModal projetId={projetId} fields={fields} onClose={() => setSettingsOpen(false)} onChange={loadFields} />
      )}
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

function DocPreviewModal({ doc, onClose }: { doc: ProjetDocument; onClose: () => void }) {
  const kind = previewKind(doc.mime_type, doc.original_name)
  const url = projetDocumentUrl(doc.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <File size={18} className="shrink-0 text-ville-blue" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{doc.display_name}</p>
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
          {kind === 'none' && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <File size={56} className="text-slate-400" />
              <p className="text-sm text-slate-500">Prévisualisation non disponible pour ce type de fichier.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetadataSettingsModal({
  projetId,
  fields,
  onClose,
  onChange,
}: {
  projetId: number
  fields: ProjetMetadataField[]
  onClose: () => void
  onChange: () => void
}) {
  const [cle, setCle] = useState('')
  const [libelle, setLibelle] = useState('')
  const [type, setType] = useState<'texte' | 'date' | 'liste'>('texte')
  const [optionsText, setOptionsText] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!cle.trim() || !libelle.trim()) return
    try {
      await api.post(`/projets/${projetId}/metadata-fields`, {
        cle: cle.trim().toLowerCase().replace(/\s+/g, '_'),
        libelle: libelle.trim(),
        type,
        options: type === 'liste' ? optionsText.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      })
      setCle('')
      setLibelle('')
      setOptionsText('')
      onChange()
    } catch (err) {
      setError(apiErrorMessage(err, 'Création impossible'))
    }
  }

  async function remove(id: number) {
    await api.delete(`/projets/${projetId}/metadata-fields/${id}`)
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
