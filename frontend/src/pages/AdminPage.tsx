import { useEffect, useState, type FormEvent } from 'react'
import { api, apiErrorMessage } from '../lib/api'
import { ShieldCheck, Upload, CheckCircle2, XCircle } from 'lucide-react'

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

      <ImportSection onDone={(msg) => setNotice(msg)} onError={(msg) => setError(msg)} />
    </div>
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
