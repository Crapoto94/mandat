import { useState, type FormEvent } from 'react'
import { api, apiErrorMessage } from '../lib/api'
import type { EngagementStep } from '../types'
import { GitCommitHorizontal, X } from 'lucide-react'

interface Props {
  engagementId: number
  steps: EngagementStep[]
  onChange: () => void
}

export default function StepsTimeline({ engagementId, steps, onChange }: Props) {
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/engagements/${engagementId}/steps`, { date_etape: date || null, description })
      setDate('')
      setDescription('')
      onChange()
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible d'ajouter l'étape"))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    await api.delete(`/engagements/${engagementId}/steps/${id}`)
    onChange()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <GitCommitHorizontal size={16} /> Étapes / prochaines échéances
      </h2>

      {!!steps.length && (
        <ol className="mb-5 space-y-4 border-l-2 border-slate-100 pl-4">
          {steps.map((s) => (
            <li key={s.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-ville-blue" />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {s.date_etape
                      ? new Date(s.date_etape).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Date non précisée'}
                  </p>
                  <p className="text-sm text-slate-800">{s.description}</p>
                </div>
                <button onClick={() => remove(s.id)} className="shrink-0 text-slate-400 hover:text-red-600" title="Supprimer">
                  <X size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!steps.length && <p className="mb-4 text-sm text-slate-400">Aucune étape renseignée pour l'instant.</p>}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Date (optionnelle)</label>
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            placeholder="ex : 2028, T3 2030, juin 2029..."
            title="Une date précise (JJ/MM/AAAA) ou vague (mois, trimestre, année seule) — positionnée au milieu de la période dans la timeline"
            className="w-44 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-slate-500">Description de l'étape</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex : passage en commission le..."
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !description.trim()}
          className="rounded-md bg-ville-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          Ajouter
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
