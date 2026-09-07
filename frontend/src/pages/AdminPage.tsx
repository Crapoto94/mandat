import { useEffect, useState, type FormEvent } from 'react'
import { api, apiErrorMessage } from '../lib/api'
import type { Direction, RoleDef } from '../types'
import { ShieldCheck, Upload, CheckCircle2, XCircle, RefreshCw, Tags, Trash2, Plus } from 'lucide-react'

interface AdminAccount {
  id: number
  username: string
  display_name: string
  active: boolean
  created_at: string
  last_login_at: string | null
}

interface Status {
  status: string
  db: string
  apm: { configured: boolean; reachable: boolean }
}

export default function AdminPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function load() {
    api
      .get('/admin/admins')
      .then((res) => setAccounts(res.data))
      .catch((err) => setError(apiErrorMessage(err)))
    api.get('/status').then((res) => setStatus(res.data))
  }

  useEffect(load, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <ShieldCheck size={20} className="text-ville-blue" /> Administration
        </h1>
        <p className="text-sm text-slate-500">Comptes de secours, état des services et réimport des données sources.</p>
      </div>

      {status && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatusRow label="Base de données" ok={status.db === 'up'} />
          <StatusRow
            label="API centrale APM (mail / SMS / AD)"
            ok={status.apm.configured && status.apm.reachable}
            hint={!status.apm.configured ? 'Clé APM_API_KEY non configurée' : undefined}
          />
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 p-4 text-sm text-green-700">{notice}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Comptes de secours admin</h2>
        <p className="mb-4 text-xs text-slate-500">
          Ces comptes locaux permettent de se connecter si l'Active Directory / l'API APM est indisponible.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="py-2 font-medium">Identifiant</th>
              <th className="py-2 font-medium">Nom affiché</th>
              <th className="py-2 font-medium">Statut</th>
              <th className="py-2 font-medium">Dernière connexion</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2">{a.username}</td>
                <td className="py-2">{a.display_name}</td>
                <td className="py-2">{a.active ? 'Actif' : 'Désactivé'}</td>
                <td className="py-2 text-slate-500">
                  {a.last_login_at ? new Date(a.last_login_at).toLocaleString('fr-FR') : 'Jamais'}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={async () => {
                      await api.patch(`/admin/admins/${a.id}`, { active: !a.active })
                      load()
                    }}
                    className="text-xs font-medium text-ville-blue hover:underline"
                  >
                    {a.active ? 'Désactiver' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <NewAdminForm onCreated={load} />
      </section>

      <DirectionsSection onNotice={setNotice} onError={setError} />

      <RolesCatalogSection onError={setError} />

      <ImportSection onDone={(msg) => setNotice(msg)} onError={(msg) => setError(msg)} />
    </div>
  )
}

function DirectionsSection({
  onNotice,
  onError,
}: {
  onNotice: (m: string) => void
  onError: (m: string) => void
}) {
  const [directions, setDirections] = useState<Direction[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [syncing, setSyncing] = useState(false)

  function load() {
    api.get('/directions').then((res) => {
      setDirections(res.data)
      setDrafts(Object.fromEntries(res.data.map((d: Direction) => [d.code, d.libelle || ''])))
    })
  }

  useEffect(load, [])

  async function saveLibelle(code: string) {
    try {
      await api.patch(`/directions/${encodeURIComponent(code)}`, { libelle: drafts[code] })
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Sauvegarde impossible'))
    }
  }

  async function sync() {
    setSyncing(true)
    try {
      const res = await api.post('/directions/sync')
      onNotice(
        `Synchronisation Hub DSI : ${res.data.synchronises} mis à jour, ${res.data.ignoresManuels} déjà saisis manuellement conservés (sur ${res.data.recuDuHub} reçus).`
      )
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Synchronisation Hub DSI impossible'))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Tags size={16} /> Table de concordance des directions
        </h2>
        <button
          onClick={sync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          Synchroniser depuis le Hub DSI
        </button>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Sigles rencontrés dans les engagements (pilotage / contributions) — associez leur nom complet. La
        synchronisation Hub DSI ne touche jamais un libellé déjà saisi manuellement ici.
      </p>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="py-2 pr-3 font-medium">Sigle</th>
              <th className="py-2 pr-3 font-medium">Nom complet</th>
              <th className="py-2 font-medium">Origine</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {directions.map((d) => (
              <tr key={d.code} className="border-b border-slate-50 last:border-0">
                <td className="py-1.5 pr-3 font-medium text-slate-700">{d.code}</td>
                <td className="py-1.5 pr-3">
                  <input
                    value={drafts[d.code] ?? ''}
                    onChange={(e) => setDrafts({ ...drafts, [d.code]: e.target.value })}
                    placeholder="Nom complet de la direction"
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-ville-blue focus:outline-none"
                  />
                </td>
                <td className="py-1.5 text-xs text-slate-400">{d.libelle_manuel ? 'Manuel' : 'Hub DSI / auto'}</td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => saveLibelle(d.code)}
                    disabled={(drafts[d.code] ?? '') === (d.libelle ?? '')}
                    className="text-xs font-medium text-ville-blue hover:underline disabled:opacity-40"
                  >
                    Enregistrer
                  </button>
                </td>
              </tr>
            ))}
            {!directions.length && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                  Aucun sigle référencé pour l'instant (généré automatiquement à l'import des engagements).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RolesCatalogSection({ onError }: { onError: (m: string) => void }) {
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [newLabel, setNewLabel] = useState('')

  function load() {
    api.get('/roles').then((res) => setRoles(res.data))
  }

  useEffect(load, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    try {
      await api.post('/roles', { libelle: newLabel.trim(), ordre: roles.length + 1 })
      setNewLabel('')
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Création impossible'))
    }
  }

  async function remove(id: number) {
    try {
      await api.delete(`/roles/${id}`)
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Suppression impossible'))
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-800">Catalogue des rôles</h2>
      <p className="mb-4 text-xs text-slate-500">
        Rôles proposés lors de l'assignation d'un agent sur un engagement (fiche engagement → « Rôles assignés »).
      </p>
      <ul className="mb-4 space-y-1.5">
        {roles.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
            {r.libelle}
            <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600" title="Supprimer">
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nouveau rôle (ex : Décisionnaire)"
          className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-md bg-ville-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={14} /> Ajouter
        </button>
      </form>
    </section>
  )
}

function StatusRow({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
      {ok ? <CheckCircle2 size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-500" />}
      <span className="font-medium text-slate-700">{label}</span>
      {hint && <span className="text-xs text-slate-400">— {hint}</span>}
    </div>
  )
}

function NewAdminForm({ onCreated }: { onCreated: () => void }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/admins', { username, password, display_name: displayName })
      setUsername('')
      setDisplayName('')
      setPassword('')
      onCreated()
    } catch (err) {
      setError(apiErrorMessage(err, 'Création impossible'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Identifiant</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Nom affiché</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Mot de passe (8 caractères min.)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-ville-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        Ajouter
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}

function ImportSection({ onDone, onError }: { onDone: (m: string) => void; onError: (m: string) => void }) {
  const [suivi, setSuivi] = useState<File | null>(null)
  const [repartition, setRepartition] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!suivi) return
    setBusy(true)
    try {
      const data = new FormData()
      data.append('suivi', suivi)
      if (repartition) data.append('repartition', repartition)
      const res = await api.post('/admin/import', data, { headers: { 'Content-Type': 'multipart/form-data' } })
      onDone(
        `Import terminé : ${res.data.inserted} créé(s), ${res.data.updated} mis à jour, ${res.data.groupeAssignes} rattaché(s) à un groupe.`
      )
    } catch (err) {
      onError(apiErrorMessage(err, 'Import impossible'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Upload size={16} /> Réimporter les fichiers sources
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Les données déjà saisies (état, description, prochaines étapes) sont préservées : seuls le contenu et
        l'affectation aux groupes sont mis à jour.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Fichier de suivi (liste complète des engagements)
          </label>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setSuivi(e.target.files?.[0] || null)}
            required
            className="text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Fichier de répartition par groupe (optionnel)
          </label>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setRepartition(e.target.files?.[0] || null)}
            className="text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !suivi}
          className="rounded-md bg-ville-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Import en cours…' : 'Lancer l\'import'}
        </button>
      </form>
    </section>
  )
}
