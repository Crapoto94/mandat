import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, apiErrorMessage } from '../lib/api'
import type { CoordinationTopic, Direction, Engagement } from '../types'
import { Link } from 'react-router-dom'
import { Plus, X, Search } from 'lucide-react'

const STATUTS: Record<CoordinationTopic['statut'], { label: string; className: string }> = {
  a_trancher: { label: 'À trancher', className: 'bg-red-50 text-red-700' },
  en_discussion: { label: 'En discussion', className: 'bg-amber-50 text-amber-700' },
  regle: { label: 'Réglé', className: 'bg-green-50 text-green-700' },
}

export default function CoordinationPage() {
  const [topics, setTopics] = useState<CoordinationTopic[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  function load() {
    api
      .get('/coordination')
      .then((res) => setTopics(res.data))
      .catch((err) => setError(apiErrorMessage(err)))
  }

  useEffect(() => {
    load()
    api.get('/engagements').then((res) => setEngagements(res.data))
    api.get('/directions').then((res) => setDirections(res.data))
  }, [])

  async function changeStatut(topic: CoordinationTopic, statut: CoordinationTopic['statut']) {
    await api.patch(`/coordination/${topic.id}`, { statut })
    load()
  }

  const engagementById = new Map(engagements.map((e) => [e.id, e]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sujets de coordination</h1>
          <p className="text-sm text-slate-500">
            Points transversaux qui dépassent un seul engagement et nécessitent un arbitrage entre directions.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-ville-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Fermer' : 'Nouveau sujet'}
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {showForm && (
        <NewTopicForm
          engagements={engagements}
          directions={directions}
          onCreated={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      <div className="space-y-3">
        {topics.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-medium text-slate-900">{t.titre}</h3>
              <select
                value={t.statut}
                onChange={(e) => changeStatut(t, e.target.value as CoordinationTopic['statut'])}
                className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${STATUTS[t.statut].className}`}
              >
                {Object.entries(STATUTS).map(([code, s]) => (
                  <option key={code} value={code}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {t.description && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-600">{t.description}</p>}
            {!!t.directions_concernees?.length && (
              <p className="mb-2 text-xs text-slate-500">
                Directions concernées : <span className="font-medium">{t.directions_concernees.join(', ')}</span>
              </p>
            )}
            {!!t.engagement_ids?.length && (
              <div className="flex flex-wrap gap-1.5">
                {t.engagement_ids.map((id) => {
                  const eng = engagementById.get(id)
                  return (
                    <Link
                      key={id}
                      to={`/engagements/${id}`}
                      className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
                    >
                      n°{eng?.numero ?? id}
                    </Link>
                  )
                })}
              </div>
            )}
            <p className="mt-3 text-xs text-slate-400">Créé par {t.created_by || 'inconnu'}</p>
          </div>
        ))}
        {!topics.length && !showForm && (
          <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            Aucun sujet de coordination pour l'instant.
          </p>
        )}
      </div>
    </div>
  )
}

function NewTopicForm({
  engagements,
  directions,
  onCreated,
}: {
  engagements: Engagement[]
  directions: Direction[]
  onCreated: () => void
}) {
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [directionCodes, setDirectionCodes] = useState<string[]>([])
  const [engagementIds, setEngagementIds] = useState<number[]>([])
  const [engagementQuery, setEngagementQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const filteredEngagements = useMemo(() => {
    const q = engagementQuery.trim().toLowerCase()
    if (!q) return engagements
    return engagements.filter((e) => `${e.numero} ${e.contenu}`.toLowerCase().includes(q))
  }, [engagements, engagementQuery])

  function toggleDirection(code: string) {
    setDirectionCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  function toggleEngagement(id: number) {
    setEngagementIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/coordination', {
        titre,
        description,
        directions_concernees: directionCodes,
        engagement_ids: engagementIds,
      })
      onCreated()
    } catch (err) {
      setError(apiErrorMessage(err, 'Création impossible'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Titre du sujet</label>
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Directions concernées {!!directionCodes.length && `(${directionCodes.length})`}
          </label>
          <div className="max-h-48 overflow-y-auto rounded-md border border-slate-300 p-2">
            {directions.map((d) => (
              <label key={d.code} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={directionCodes.includes(d.code)}
                  onChange={() => toggleDirection(d.code)}
                  className="accent-[#0055A4]"
                />
                <span className="font-medium">{d.code}</span>
                {d.libelle && d.libelle !== d.code && <span className="text-xs text-slate-400">— {d.libelle}</span>}
              </label>
            ))}
            {!directions.length && <p className="p-2 text-xs text-slate-400">Aucune direction référencée.</p>}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Engagements liés {!!engagementIds.length && `(${engagementIds.length})`}
          </label>
          <div className="rounded-md border border-slate-300">
            <div className="relative border-b border-slate-200 p-1.5">
              <Search size={13} className="pointer-events-none absolute left-3.5 top-4 text-slate-400" />
              <input
                value={engagementQuery}
                onChange={(e) => setEngagementQuery(e.target.value)}
                placeholder="Filtrer par n° ou mot-clé..."
                className="w-full rounded px-2 py-1 pl-6 text-sm focus:outline-none"
              />
            </div>
            <div className="max-h-40 overflow-y-auto p-2">
              {filteredEngagements.map((eng) => (
                <label key={eng.id} className="flex items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={engagementIds.includes(eng.id)}
                    onChange={() => toggleEngagement(eng.id)}
                    className="mt-0.5 accent-[#0055A4]"
                  />
                  <span>
                    <span className="font-medium">n°{eng.numero}</span>{' '}
                    <span className="text-slate-600">{eng.contenu}</span>
                  </span>
                </label>
              ))}
              {!filteredEngagements.length && <p className="p-2 text-xs text-slate-400">Aucun résultat.</p>}
            </div>
          </div>
        </div>
      </div>
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-ville-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy ? 'Création…' : 'Créer le sujet'}
      </button>
    </form>
  )
}
