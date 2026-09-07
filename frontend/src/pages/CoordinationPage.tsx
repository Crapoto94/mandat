import { useEffect, useState, type FormEvent } from 'react'
import { api, apiErrorMessage } from '../lib/api'
import type { CoordinationTopic, Engagement } from '../types'
import { Link } from 'react-router-dom'
import { Plus, X } from 'lucide-react'

const STATUTS: Record<CoordinationTopic['statut'], { label: string; className: string }> = {
  a_trancher: { label: 'À trancher', className: 'bg-red-50 text-red-700' },
  en_discussion: { label: 'En discussion', className: 'bg-amber-50 text-amber-700' },
  regle: { label: 'Réglé', className: 'bg-green-50 text-green-700' },
}

export default function CoordinationPage() {
  const [topics, setTopics] = useState<CoordinationTopic[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
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

function NewTopicForm({ engagements, onCreated }: { engagements: Engagement[]; onCreated: () => void }) {
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [directions, setDirections] = useState('')
  const [numeros, setNumeros] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const wantedNumeros = numeros
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => !Number.isNaN(n))
      const engagement_ids = engagements.filter((e) => wantedNumeros.includes(e.numero)).map((e) => e.id)

      await api.post('/coordination', {
        titre,
        description,
        directions_concernees: directions
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        engagement_ids,
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
          <label className="mb-1 block text-xs font-medium text-slate-500">Directions concernées (séparées par une virgule)</label>
          <input
            value={directions}
            onChange={(e) => setDirections(e.target.value)}
            placeholder="DDAC, DCOM, DSI"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Engagements liés (numéros, séparés par une virgule)</label>
          <input
            value={numeros}
            onChange={(e) => setNumeros(e.target.value)}
            placeholder="3, 12, 27"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
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
