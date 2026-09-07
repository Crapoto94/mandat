import { useRef, useState } from 'react'
import { api, apiErrorMessage, attachmentFileUrl } from '../lib/api'
import type { Attachment } from '../types'
import DocumentViewer from './DocumentViewer'
import { Paperclip, Download, Trash2, Upload, Eye } from 'lucide-react'

interface Props {
  engagementId: number
  attachments: Attachment[]
  onChange: () => void
}

export default function AttachmentsSection({ engagementId, attachments, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const data = new FormData()
        data.append('file', file)
        await api.post(`/engagements/${engagementId}/attachments`, data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      onChange()
    } catch (err) {
      setError(apiErrorMessage(err, "Envoi du fichier impossible"))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(id: number, name: string) {
    // Suppression douce (récupérable en corbeille admin), mais on confirme
    // quand même : ça retire le fichier de la vue de tous les agents.
    if (!confirm(`Supprimer "${name}" ? Le fichier ne sera plus visible sur la fiche (récupérable par un administrateur).`)) return
    await api.delete(`/engagements/${engagementId}/attachments/${id}`)
    onChange()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Paperclip size={16} /> Pièces jointes
      </h2>

      {!!attachments.length && (
        <ul className="mb-4 space-y-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <button
                onClick={() => setPreviewing(a)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title="Prévisualiser"
              >
                {a.mime_type?.startsWith('image/') ? (
                  <img src={attachmentFileUrl(a.id)} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <Paperclip size={14} className="shrink-0 text-slate-400" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800 hover:text-ville-blue">{a.original_name}</p>
                  <p className="text-xs text-slate-400">
                    {formatSize(a.size_bytes)} · {a.uploaded_by} · {new Date(a.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => setPreviewing(a)} className="text-slate-400 hover:text-ville-blue" title="Prévisualiser">
                  <Eye size={15} />
                </button>
                <a
                  href={`${attachmentFileUrl(a.id)}&download=1`}
                  className="text-slate-400 hover:text-ville-blue"
                  title="Télécharger"
                >
                  <Download size={15} />
                </a>
                <button onClick={() => remove(a.id, a.original_name)} className="text-slate-400 hover:text-red-600" title="Supprimer">
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!attachments.length && <p className="mb-4 text-sm text-slate-400">Aucune pièce jointe pour l'instant.</p>}

      <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
        <Upload size={14} />
        {busy ? 'Envoi…' : 'Ajouter un fichier'}
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={(e) => upload(e.target.files)}
          disabled={busy}
          className="hidden"
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {previewing && <DocumentViewer attachment={previewing} onClose={() => setPreviewing(null)} />}
    </div>
  )
}

function formatSize(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
