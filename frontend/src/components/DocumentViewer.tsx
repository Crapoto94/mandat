import { useEffect, useState } from 'react'
import { api, apiErrorMessage, attachmentFileUrl, msgAttachmentUrl } from '../lib/api'
import type { Attachment } from '../types'
import { X, Download, File, Mail, Paperclip } from 'lucide-react'

interface MsgPreview {
  subject: string
  from: string
  to: string[]
  cc: string[]
  date: string | null
  bodyText: string
  bodyHtml: string
  attachments: { index: number; fileName: string; contentLength: number }[]
}

function previewKind(mimeType: string | null, filename: string): 'pdf' | 'image' | 'msg' | 'none' {
  const name = filename.toLowerCase()
  if (name.endsWith('.msg') || (mimeType || '').toLowerCase() === 'application/vnd.ms-outlook') return 'msg'
  const mt = (mimeType || '').toLowerCase()
  if (mt === 'application/pdf') return 'pdf'
  if (mt.startsWith('image/')) return 'image'
  return 'none'
}

function formatSize(bytes: number | null) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export default function DocumentViewer({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const kind = previewKind(attachment.mime_type, attachment.original_name)
  const [msg, setMsg] = useState<MsgPreview | null>(null)
  const [msgError, setMsgError] = useState<string | null>(null)
  const [msgLoading, setMsgLoading] = useState(kind === 'msg')

  useEffect(() => {
    if (kind !== 'msg') return
    setMsgLoading(true)
    api
      .get(`/attachments/${attachment.id}/msg`)
      .then((res) => setMsg(res.data))
      .catch((err) => setMsgError(apiErrorMessage(err, 'Impossible de lire ce message')))
      .finally(() => setMsgLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.id, kind])

  const contentUrl = attachmentFileUrl(attachment.id)
  const downloadUrl = `${contentUrl}&download=1`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <File size={18} className="shrink-0 text-ville-blue" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800" title={attachment.original_name}>
            {attachment.original_name}
          </p>
          <span className="shrink-0 text-xs text-slate-400">{formatSize(attachment.size_bytes)}</span>
          <a
            href={downloadUrl}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-ville-blue px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Download size={13} /> Télécharger
          </a>
          <button onClick={onClose} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-100">
          {kind === 'pdf' && <iframe src={contentUrl} title={attachment.original_name} className="h-full w-full border-0" />}

          {kind === 'image' && (
            <div className="flex h-full items-center justify-center overflow-auto p-5">
              <img src={contentUrl} alt={attachment.original_name} className="max-h-full max-w-full object-contain" />
            </div>
          )}

          {kind === 'msg' && (
            <div className="flex h-full flex-col overflow-hidden bg-white">
              {msgLoading && <p className="p-8 text-center text-sm text-slate-500">Lecture du message…</p>}
              {msgError && <p className="p-8 text-center text-sm text-red-600">{msgError}</p>}
              {!msgLoading && !msgError && msg && (
                <>
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
                      <span className="font-medium">Date :</span>{' '}
                      {msg.date ? new Date(msg.date).toLocaleString('fr-FR') : '—'}
                    </p>
                  </div>
                  {!!msg.attachments.length && (
                    <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
                      {msg.attachments.map((a) => (
                        <a
                          key={a.index}
                          href={msgAttachmentUrl(attachment.id, a.index)}
                          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          <Paperclip size={12} /> {a.fileName}{' '}
                          <span className="text-slate-400">({formatSize(a.contentLength)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    {msg.bodyHtml ? (
                      <iframe srcDoc={msg.bodyHtml} sandbox="" title={msg.subject} className="h-full w-full border-0" />
                    ) : (
                      <div className="h-full overflow-y-auto whitespace-pre-wrap p-5 text-sm text-slate-800">
                        {msg.bodyText}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {kind === 'none' && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <File size={56} className="text-slate-400" />
              <p className="text-sm text-slate-500">Prévisualisation non disponible pour ce type de fichier.</p>
              <a
                href={downloadUrl}
                className="flex items-center gap-1.5 rounded-md bg-ville-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Download size={14} /> Télécharger {attachment.original_name}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
