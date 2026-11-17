import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '../lib/api'
import { X, Download, File } from 'lucide-react'

type Kind = 'pdf' | 'image' | 'docx' | 'xlsx' | 'pptx' | 'none'

function previewKind(mimeType: string | null, fileName: string): Kind {
  const mt = (mimeType || '').toLowerCase()
  const n = fileName.toLowerCase()
  if (mt === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (mt.startsWith('image/')) return 'image'
  if (n.endsWith('.docx')) return 'docx'
  if (n.endsWith('.xlsx')) return 'xlsx'
  if (n.endsWith('.pptx')) return 'pptx'
  return 'none'
}

/**
 * Aperçu d'une pièce jointe embarquée dans un .msg (pas un document de la
 * GED : pas d'id permanent, juste un index dans le message) — mêmes formats
 * pris en charge que DocPreviewModal, mais sans la mise en scène GED
 * (métadonnées, versions...).
 */
export default function MsgAttachmentPreviewModal({
  fileName,
  mimeType,
  rawUrl,
  downloadUrl,
  previewEndpoint,
  onClose,
}: {
  fileName: string
  mimeType: string | null
  rawUrl: string
  downloadUrl: string
  /** Base d'URL relative (sous /api) pour l'aperçu structuré docx/xlsx/pptx, ex.
   * `/attachments/12/msg/attachments/0/preview` — on y ajoute `/docx` etc. */
  previewEndpoint: string
  onClose: () => void
}) {
  const kind = previewKind(mimeType, fileName)
  const [loading, setLoading] = useState(['docx', 'xlsx', 'pptx'].includes(kind))
  const [error, setError] = useState<string | null>(null)
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [xlsx, setXlsx] = useState<{ sheets: { name: string; html: string }[] } | null>(null)
  const [pptx, setPptx] = useState<{ slides: { index: number; text: string }[] } | null>(null)
  const [activeSheet, setActiveSheet] = useState(0)

  useEffect(() => {
    if (kind === 'docx') {
      api.get(`${previewEndpoint}/docx`).then((res) => setDocxHtml(res.data.html)).catch((err) => setError(apiErrorMessage(err, 'Aperçu impossible'))).finally(() => setLoading(false))
    } else if (kind === 'xlsx') {
      api.get(`${previewEndpoint}/xlsx`).then((res) => setXlsx(res.data)).catch((err) => setError(apiErrorMessage(err, 'Aperçu impossible'))).finally(() => setLoading(false))
    } else if (kind === 'pptx') {
      api.get(`${previewEndpoint}/pptx`).then((res) => setPptx(res.data)).catch((err) => setError(apiErrorMessage(err, 'Aperçu impossible'))).finally(() => setLoading(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewEndpoint, kind])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-5"
      onClick={(e) => {
        // Empêche la fermeture de se propager à la visionneuse parente
        // (le .msg ouvert juste en dessous) : un clic sur ce fond ne doit
        // fermer que cet aperçu imbriqué.
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <File size={18} className="shrink-0 text-ville-blue" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800" title={fileName}>
            {fileName}
          </p>
          <a href={downloadUrl} className="flex shrink-0 items-center gap-1.5 rounded-md bg-ville-blue px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90">
            <Download size={13} /> Télécharger
          </a>
          <button onClick={onClose} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden bg-slate-100">
          {kind === 'pdf' && <iframe src={rawUrl} title={fileName} className="h-full w-full border-0" />}
          {kind === 'image' && (
            <div className="flex h-full items-center justify-center overflow-auto p-5">
              <img src={rawUrl} alt={fileName} className="max-h-full max-w-full object-contain" />
            </div>
          )}

          {loading && <p className="p-8 text-center text-sm text-slate-500">Chargement de l'aperçu…</p>}
          {error && <p className="p-8 text-center text-sm text-red-600">{error}</p>}

          {kind === 'docx' && !loading && !error && docxHtml !== null && (
            <div className="h-full overflow-y-auto bg-white p-8">
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: docxHtml }} />
            </div>
          )}

          {kind === 'xlsx' && !loading && !error && xlsx && (
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

          {kind === 'pptx' && !loading && !error && pptx && (
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
              <a href={downloadUrl} className="flex items-center gap-1.5 rounded-md bg-ville-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90">
                <Download size={14} /> Télécharger {fileName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
