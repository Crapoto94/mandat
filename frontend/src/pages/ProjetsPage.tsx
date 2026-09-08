import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import { stripHtml } from '../lib/text'
import type { Projet } from '../types'
import EtatBadge from '../components/EtatBadge'
import { MeteoBadge } from '../components/MeteoPicker'
import { FolderKanban, Plus, Users, Infinity as InfinityIcon, X } from 'lucide-react'

export default function ProjetsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [projets, setProjets] = useState<Projet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(params.get('nouveau') === '1')
  const prefilledEngagementId = params.get('engagement_id') ? Number(params.get('engagement_id')) : null

  function load() {
    api
      .get('/projets')
      .then((res) => setProjets(res.data))
      .catch((err) => setError(apiErrorMessage(err, 'Liste des projets indisponible')))
  }

  useEffect(load, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <FolderKanban size={20} className="text-ville-blue" /> Projets
          </h1>
          <p className="text-sm text-slate-500">
            Vos projets — rattachés à un engagement du mandat ou créés librement par un service. Réservés à leurs
            membres.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-md bg-ville-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={15} /> Nouveau projet
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {creating && (
        <NewProjetForm
          engagementId={prefilledEngagementId}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/projets/${id}`)}
        />
      )}

      {!projets ? (
        <p className="p-8 text-center text-slate-500">Chargement…</p>
      ) : !projets.length ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Aucun projet pour l'instant — vous n'êtes membre d'aucun projet, ou aucun n'a encore été créé.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projets.map((p) => (
            <Link
              key={p.id}
              to={`/projets/${p.id}`}
              title={stripHtml(p.description) || undefined}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-ville-blue/40"
            >
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <span className="font-medium text-slate-800">
                  {p.nom}
                  {p.continu && (
                    <span title="Projet continu" className="ml-1 inline-block align-text-bottom text-slate-400">
                      <InfinityIcon size={13} className="inline" />
                    </span>
                  )}
                </span>
                {p.meteo_code && (
                  <MeteoBadge
                    meteo={{ code: p.meteo_code, libelle: p.meteo_libelle || '', emoji: p.meteo_emoji || '', couleur: p.meteo_couleur || '#64748b', ordre: 0 }}
                    iconOnly
                  />
                )}
              </div>
              {p.engagement_id && (
                <p className="mb-2 text-xs text-slate-400">
                  Lié à l'engagement n°{p.engagement_numero} — {p.engagement_contenu?.slice(0, 50)}
                  {(p.engagement_contenu?.length || 0) > 50 ? '…' : ''}
                </p>
              )}
              <div className="flex items-center justify-between">
                <EtatBadge libelle={p.etat_libelle} couleur={p.etat_couleur} />
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Users size={12} /> {p.membre_count ?? 0}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function NewProjetForm({
  engagementId,
  onClose,
  onCreated,
}: {
  engagementId: number | null
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.post('/projets', {
        nom: nom.trim(),
        description: description.trim() || null,
        engagement_id: engagementId || null,
      })
      onCreated(res.data.id)
    } catch (err) {
      setError(apiErrorMessage(err, 'Création impossible'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-ville-blue/40 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">
          Nouveau projet{engagementId ? ' (lié à un engagement)' : ''}
        </h2>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X size={16} />
        </button>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Nom du projet</label>
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          autoFocus
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Description (optionnel)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !nom.trim()}
        className="rounded-md bg-ville-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy ? 'Création…' : 'Créer'}
      </button>
    </form>
  )
}
