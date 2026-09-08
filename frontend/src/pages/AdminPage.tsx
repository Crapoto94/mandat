import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import type { ActivityLogEntry, AlertSubscription, Direction, Etat, HubdsiEntry, MailLogEntry, Meteo, RoleDef, TrashedAttachment } from '../types'
import { fieldLabel } from '../lib/fieldLabels'
import {
  ShieldCheck,
  Upload,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Tags,
  Trash2,
  Plus,
  List,
  Search,
  UserCircle2,
  RotateCcw,
  ScrollText,
  MessageSquare,
  Paperclip,
  Pencil,
  Wand2,
  Bell,
  Mail,
  Send,
} from 'lucide-react'

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

      <AgentLookupSection />

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

      <EtatsCatalogSection onError={setError} />

      <MeteoCatalogSection onError={setError} />

      <TrashSection onError={setError} />

      <AlertSubscriptionsSection onError={setError} />

      <MailLogSection onError={setError} onNotice={setNotice} />

      <ActivityLogSection onError={setError} />

      <ImportSection onDone={(msg) => setNotice(msg)} onError={(msg) => setError(msg)} />
    </div>
  )
}

const CUSTOM = '__custom__'

function DirectionsSection({
  onNotice,
  onError,
}: {
  onNotice: (m: string) => void
  onError: (m: string) => void
}) {
  const [directions, setDirections] = useState<Direction[]>([])
  const [hubdsiList, setHubdsiList] = useState<HubdsiEntry[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [modes, setModes] = useState<Record<string, 'select' | typeof CUSTOM>>({})
  const [syncing, setSyncing] = useState(false)
  const [normalizing, setNormalizing] = useState(false)

  function load() {
    Promise.all([api.get('/directions'), api.get('/directions/hubdsi-referentiel')]).then(([dirsRes, hubRes]) => {
      const dirs: Direction[] = dirsRes.data
      const hub: HubdsiEntry[] = hubRes.data
      setDirections(dirs)
      setHubdsiList(hub)
      setDrafts(Object.fromEntries(dirs.map((d) => [d.code, d.libelle || ''])))
      setModes(
        Object.fromEntries(
          dirs.map((d) => [d.code, hub.some((h) => h.libelle === d.libelle) ? 'select' : CUSTOM])
        )
      )
    })
  }

  useEffect(load, [])

  // Regroupe le référentiel par racine (direction, ou DGA si l'organigramme
  // complet remonte plus haut) → tous ses descendants (services, secteurs...),
  // aplatis avec profondeur pour un rendu indenté dans l'<optgroup> — un
  // <select> HTML ne supporte qu'un seul niveau de groupe imbriqué.
  const hubdsiGroups = useMemo(() => {
    const byCode = new Map(hubdsiList.map((h) => [h.code, h]))
    const childrenOf = new Map<string, HubdsiEntry[]>()
    const roots: HubdsiEntry[] = []
    const orphans: HubdsiEntry[] = []

    for (const h of hubdsiList) {
      if (!h.parent_code) {
        roots.push(h)
      } else if (byCode.has(h.parent_code)) {
        if (!childrenOf.has(h.parent_code)) childrenOf.set(h.parent_code, [])
        childrenOf.get(h.parent_code)!.push(h)
      } else {
        orphans.push(h) // parent référencé mais absent du référentiel (repli tel quel)
      }
    }

    function flatten(node: HubdsiEntry, depth: number, out: { entry: HubdsiEntry; depth: number }[]) {
      for (const child of childrenOf.get(node.code) || []) {
        out.push({ entry: child, depth })
        flatten(child, depth + 1, out)
      }
    }

    const groups = roots.map((root) => {
      const items: { entry: HubdsiEntry; depth: number }[] = []
      flatten(root, 1, items)
      return { root, items }
    })

    return { groups, orphans }
  }, [hubdsiList])

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
        `Synchronisation Hub DSI : ${res.data.recuDuHub} direction(s)/service(s) reçus, disponibles dans la liste déroulante ` +
          `(${res.data.synchronises} sigle(s) pré-associés automatiquement, ${res.data.ignoresManuels} saisie(s) manuelle(s) conservée(s)).`
      )
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Synchronisation Hub DSI impossible'))
    } finally {
      setSyncing(false)
    }
  }

  async function normalizeAliases() {
    if (
      !confirm(
        "Uniformiser les sigles connus (ex. DSPORT/SPORT/Dsports → DSPORTS) dans tous les engagements ? " +
          'Cette action réécrit le texte des engagements concernés et supprime les sigles alias devenus obsolètes.'
      )
    )
      return
    setNormalizing(true)
    try {
      const res = await api.post('/admin/directions/normalize-aliases')
      const lignes = res.data.summary
        .map((s: { canonical: string; aliases: string[]; occurrencesRenamed: number }) =>
          s.occurrencesRenamed || s.aliases.length
            ? `${s.canonical} (${s.occurrencesRenamed} occurrence(s) réécrite(s), sigles fusionnés : ${s.aliases.join(', ') || 'aucun'})`
            : null
        )
        .filter(Boolean)
      onNotice(lignes.length ? `Uniformisation terminée — ${lignes.join(' · ')}` : 'Uniformisation terminée — rien à changer.')
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Uniformisation impossible'))
    } finally {
      setNormalizing(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Tags size={16} /> Table de concordance des directions
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={normalizeAliases}
            disabled={normalizing}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            title="Fusionne les sigles connus pour désigner la même direction sous une seule écriture"
          >
            <Wand2 size={13} />
            Uniformiser les sigles
          </button>
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            Synchroniser depuis le Hub DSI
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Sigles rencontrés dans les engagements (pilotage / contributions) — affectez leur nom complet en le
        choisissant dans la liste du Hub DSI ({hubdsiList.length ? `${hubdsiList.length} entrée(s) disponible(s)` : 'synchroniser pour la remplir'}),
        ou en saisie libre si absent. La synchronisation ne touche jamais un libellé déjà associé manuellement.
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
                <td className="py-1.5 pr-3 align-top font-medium text-slate-700">{d.code}</td>
                <td className="py-1.5 pr-3">
                  {modes[d.code] === CUSTOM ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={drafts[d.code] ?? ''}
                        onChange={(e) => setDrafts({ ...drafts, [d.code]: e.target.value })}
                        placeholder="Nom complet (saisie libre)"
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-ville-blue focus:outline-none"
                      />
                      {!!hubdsiList.length && (
                        <button
                          type="button"
                          title="Choisir dans la liste Hub DSI"
                          onClick={() => setModes({ ...modes, [d.code]: 'select' })}
                          className="shrink-0 text-slate-400 hover:text-ville-blue"
                        >
                          <List size={14} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <select
                      value={drafts[d.code] ?? ''}
                      onChange={(e) => {
                        if (e.target.value === CUSTOM) {
                          setModes({ ...modes, [d.code]: CUSTOM })
                          setDrafts({ ...drafts, [d.code]: '' })
                        } else {
                          setDrafts({ ...drafts, [d.code]: e.target.value })
                        }
                      }}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-ville-blue focus:outline-none"
                    >
                      <option value="">— Choisir —</option>
                      {hubdsiGroups.groups.map(({ root, items }) => {
                        if (!items.length) {
                          return (
                            <option key={root.code} value={root.libelle}>
                              {root.libelle}
                            </option>
                          )
                        }
                        return (
                          <optgroup key={root.code} label={root.libelle}>
                            {/* Le titre de groupe (gras) n'est jamais cliquable en HTML natif :
                                cette option (nom brut, tel quel) permet quand même de choisir la
                                direction elle-même — jamais de texte décoratif, le libellé affiché
                                doit rester le nom exact du Hub DSI pour pouvoir être ré-apparié plus tard. */}
                            <option value={root.libelle}>{root.libelle}</option>
                            {items.map(({ entry, depth }) => (
                              <option key={entry.code} value={entry.libelle}>
                                {'  '.repeat(depth)}
                                {entry.libelle}
                              </option>
                            ))}
                          </optgroup>
                        )
                      })}
                      {!!hubdsiGroups.orphans.length && (
                        <optgroup label="Autres">
                          {hubdsiGroups.orphans.map((o) => (
                            <option key={o.code} value={o.libelle}>
                              {o.libelle}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <option value={CUSTOM}>Autre (saisie libre)…</option>
                    </select>
                  )}
                </td>
                <td className="py-1.5 align-top text-xs text-slate-400">{d.libelle_manuel ? 'Manuel' : 'Hub DSI / auto'}</td>
                <td className="py-1.5 align-top text-right">
                  <button
                    onClick={() => saveLibelle(d.code)}
                    disabled={!drafts[d.code] || (drafts[d.code] ?? '') === (d.libelle ?? '')}
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

function EtatsCatalogSection({ onError }: { onError: (m: string) => void }) {
  const [etats, setEtats] = useState<Etat[]>([])
  const [drafts, setDrafts] = useState<Record<string, { libelle: string; couleur: string }>>({})
  const [newEtat, setNewEtat] = useState({ code: '', libelle: '', couleur: '#64748b' })

  function load() {
    api.get('/etats').then((res) => {
      setEtats(res.data)
      setDrafts(Object.fromEntries(res.data.map((e: Etat) => [e.code, { libelle: e.libelle, couleur: e.couleur }])))
    })
  }

  useEffect(load, [])

  async function save(code: string) {
    try {
      await api.patch(`/etats/${encodeURIComponent(code)}`, drafts[code])
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Sauvegarde impossible'))
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!newEtat.code.trim() || !newEtat.libelle.trim()) return
    try {
      await api.post('/etats', { ...newEtat, ordre: etats.length + 1 })
      setNewEtat({ code: '', libelle: '', couleur: '#64748b' })
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Création impossible'))
    }
  }

  async function remove(code: string) {
    try {
      await api.delete(`/etats/${encodeURIComponent(code)}`)
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Suppression impossible'))
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-800">États d'avancement</h2>
      <p className="mb-4 text-xs text-slate-500">
        Liste et couleurs des états proposés sur chaque engagement et au tableau de bord.
      </p>
      <ul className="mb-4 space-y-1.5">
        {etats.map((e) => {
          const draft = drafts[e.code] || { libelle: e.libelle, couleur: e.couleur }
          return (
            <li key={e.code} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm">
              <input
                type="color"
                value={draft.couleur}
                onChange={(ev) => setDrafts({ ...drafts, [e.code]: { ...draft, couleur: ev.target.value } })}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent"
              />
              <input
                value={draft.libelle}
                onChange={(ev) => setDrafts({ ...drafts, [e.code]: { ...draft, libelle: ev.target.value } })}
                className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-ville-blue focus:outline-none"
              />
              <button
                onClick={() => save(e.code)}
                disabled={draft.libelle === e.libelle && draft.couleur === e.couleur}
                className="shrink-0 text-xs font-medium text-ville-blue hover:underline disabled:opacity-40"
              >
                Enregistrer
              </button>
              <button onClick={() => remove(e.code)} className="shrink-0 text-slate-400 hover:text-red-600" title="Supprimer">
                <Trash2 size={14} />
              </button>
            </li>
          )
        })}
      </ul>
      <form onSubmit={add} className="flex items-center gap-2">
        <input
          type="color"
          value={newEtat.couleur}
          onChange={(e) => setNewEtat({ ...newEtat, couleur: e.target.value })}
          className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent"
        />
        <input
          value={newEtat.code}
          onChange={(e) => setNewEtat({ ...newEtat, code: e.target.value })}
          placeholder="code (ex : suspendu)"
          className="w-36 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
        />
        <input
          value={newEtat.libelle}
          onChange={(e) => setNewEtat({ ...newEtat, libelle: e.target.value })}
          placeholder="Libellé affiché"
          className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-ville-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={14} /> Ajouter
        </button>
      </form>
    </section>
  )
}

function MeteoCatalogSection({ onError }: { onError: (m: string) => void }) {
  const [meteos, setMeteos] = useState<Meteo[]>([])
  const [drafts, setDrafts] = useState<Record<string, { libelle: string; emoji: string; couleur: string }>>({})
  const [newMeteo, setNewMeteo] = useState({ code: '', libelle: '', emoji: '', couleur: '#64748b' })

  function load() {
    api.get('/meteos').then((res) => {
      setMeteos(res.data)
      setDrafts(Object.fromEntries(res.data.map((m: Meteo) => [m.code, { libelle: m.libelle, emoji: m.emoji, couleur: m.couleur }])))
    })
  }

  useEffect(load, [])

  async function save(code: string) {
    try {
      await api.patch(`/meteos/${encodeURIComponent(code)}`, drafts[code])
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Sauvegarde impossible'))
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!newMeteo.code.trim() || !newMeteo.libelle.trim() || !newMeteo.emoji.trim()) return
    try {
      await api.post('/meteos', { ...newMeteo, ordre: meteos.length + 1 })
      setNewMeteo({ code: '', libelle: '', emoji: '', couleur: '#64748b' })
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Création impossible'))
    }
  }

  async function remove(code: string) {
    try {
      await api.delete(`/meteos/${encodeURIComponent(code)}`)
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Suppression impossible'))
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-800">Météo des engagements</h2>
      <p className="mb-4 text-xs text-slate-500">Niveaux de météo (santé/risque) proposés sur chaque engagement.</p>
      <ul className="mb-4 space-y-1.5">
        {meteos.map((m) => {
          const draft = drafts[m.code] || { libelle: m.libelle, emoji: m.emoji, couleur: m.couleur }
          return (
            <li key={m.code} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm">
              <input
                value={draft.emoji}
                onChange={(ev) => setDrafts({ ...drafts, [m.code]: { ...draft, emoji: ev.target.value } })}
                className="w-12 shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-sm focus:border-ville-blue focus:outline-none"
              />
              <input
                type="color"
                value={draft.couleur}
                onChange={(ev) => setDrafts({ ...drafts, [m.code]: { ...draft, couleur: ev.target.value } })}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent"
              />
              <input
                value={draft.libelle}
                onChange={(ev) => setDrafts({ ...drafts, [m.code]: { ...draft, libelle: ev.target.value } })}
                className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-ville-blue focus:outline-none"
              />
              <button
                onClick={() => save(m.code)}
                disabled={draft.libelle === m.libelle && draft.couleur === m.couleur && draft.emoji === m.emoji}
                className="shrink-0 text-xs font-medium text-ville-blue hover:underline disabled:opacity-40"
              >
                Enregistrer
              </button>
              <button onClick={() => remove(m.code)} className="shrink-0 text-slate-400 hover:text-red-600" title="Supprimer">
                <Trash2 size={14} />
              </button>
            </li>
          )
        })}
      </ul>
      <form onSubmit={add} className="flex items-center gap-2">
        <input
          value={newMeteo.emoji}
          onChange={(e) => setNewMeteo({ ...newMeteo, emoji: e.target.value })}
          placeholder="🌤️"
          className="w-12 shrink-0 rounded-md border border-slate-300 px-2 py-1.5 text-center text-sm focus:border-ville-blue focus:outline-none"
        />
        <input
          type="color"
          value={newMeteo.couleur}
          onChange={(e) => setNewMeteo({ ...newMeteo, couleur: e.target.value })}
          className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent"
        />
        <input
          value={newMeteo.code}
          onChange={(e) => setNewMeteo({ ...newMeteo, code: e.target.value })}
          placeholder="code (ex : venteux)"
          className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
        />
        <input
          value={newMeteo.libelle}
          onChange={(e) => setNewMeteo({ ...newMeteo, libelle: e.target.value })}
          placeholder="Libellé affiché"
          className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-ville-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={14} /> Ajouter
        </button>
      </form>
    </section>
  )
}

interface AgentLookupEngagement {
  id: number
  numero: number
  contenu: string
  est_pilote: boolean
  est_contributeur: boolean
  est_ressource: boolean
}

interface AgentLookupResult {
  sAMAccountName: string | null
  displayName: string | null
  direction: string | null
  mail: string | null
  title: string | null
  directionCode: string | null
  directionCodes: string[]
  raw: Record<string, unknown>
  engagements: AgentLookupEngagement[]
}

/**
 * Vérifie ce que l'annuaire Ville renvoie pour un identifiant donné (nom,
 * direction, mail) — en lecture seule via l'APM, sans jamais avoir besoin
 * du mot de passe de l'agent. Utile pour diagnostiquer si un agent "remonte"
 * bien et avec la bonne direction, sans se connecter à sa place.
 */
function AgentLookupSection() {
  const [identifier, setIdentifier] = useState('')
  const [result, setResult] = useState<AgentLookupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!identifier.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.get('/admin/agent-lookup', { params: { identifier: identifier.trim() } })
      setResult(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Recherche impossible'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <UserCircle2 size={16} /> Vérifier un agent dans l'annuaire
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Lecture seule (via l'APM, sans mot de passe) — pour vérifier qu'un identifiant remonte bien, avec la bonne
        direction, sans se connecter à sa place.
      </p>
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Identifiant Ville (ex : machevalier)"
            className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-2 text-sm focus:border-ville-blue focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-ville-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Recherche…' : 'Vérifier'}
        </button>
      </form>
      {error && <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-800">{result.displayName || '—'}</p>
          <p className="text-slate-500">
            Direction : <span className="font-medium text-slate-700">{result.direction || '— non renseignée —'}</span>
          </p>
          {result.title && <p className="text-slate-500">Poste : {result.title}</p>}
          {result.mail && <p className="text-slate-500">Mail : {result.mail}</p>}
          <p className="mt-1 text-xs text-slate-400">
            Identifiant AD : {result.sAMAccountName}
            {result.directionCode && ` · sigle résolu : ${result.directionCode}`}
          </p>

          {result.direction && !result.directionCode && (
            <p className="mt-2 text-xs text-amber-700">
              Aucun sigle ne correspond à "{result.direction}" dans la table de concordance des directions.
            </p>
          )}

          {!!result.engagements.length && (
            <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {result.engagements.length} engagement(s) concerné(s)
              </p>
              {result.engagements.map((e) => (
                <Link
                  key={e.id}
                  to={`/engagements/${e.id}`}
                  className="flex items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs hover:bg-ville-blue/5"
                >
                  <span className="truncate text-slate-700">
                    n°{e.numero} — {e.contenu}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {e.est_pilote && <span className="rounded-full bg-ville-blue/10 px-1.5 py-0.5 text-ville-blue">Pilote</span>}
                    {e.est_contributeur && (
                      <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-purple-700">Contrib.</span>
                    )}
                    {e.est_ressource && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-700">Ressource</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {result.raw && (
            <details className="mt-3 border-t border-slate-200 pt-3">
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-400">
                Champs bruts renvoyés par l'AD (diagnostic)
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-900 p-2.5 text-[11px] leading-relaxed text-slate-100">
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
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

/**
 * Corbeille des pièces jointes supprimées : la suppression normale (fiche
 * engagement) ne fait que les masquer, jamais toucher au fichier — ici on
 * peut les restaurer, ou les purger définitivement (fichier + ligne).
 */
function TrashSection({ onError }: { onError: (m: string) => void }) {
  const [items, setItems] = useState<TrashedAttachment[]>([])

  function load() {
    api
      .get('/admin/attachments/trash')
      .then((res) => setItems(res.data))
      .catch((err) => onError(apiErrorMessage(err)))
  }

  useEffect(load, [])

  async function restore(id: number) {
    try {
      await api.post(`/admin/attachments/${id}/restore`)
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Restauration impossible'))
    }
  }

  async function purge(id: number, name: string) {
    if (!confirm(`Purger définitivement "${name}" ? Cette action supprime aussi le fichier, irréversible.`)) return
    try {
      await api.delete(`/admin/attachments/${id}/purge`)
      load()
    } catch (err) {
      onError(apiErrorMessage(err, 'Purge impossible'))
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Trash2 size={16} /> Corbeille des pièces jointes
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Une pièce jointe supprimée depuis une fiche engagement reste ici, restaurable — le fichier n'est jamais
        touché tant qu'elle n'est pas purgée définitivement.
      </p>
      {!items.length ? (
        <p className="text-sm text-slate-400">La corbeille est vide.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-700">{a.original_name}</p>
                <p className="text-xs text-slate-400">
                  Engagement n°{a.engagement_numero} — {a.engagement_contenu.slice(0, 60)}
                  {a.engagement_contenu.length > 60 ? '…' : ''} · supprimé par {a.deleted_by} le{' '}
                  {a.deleted_at && new Date(a.deleted_at).toLocaleString('fr-FR')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => restore(a.id)}
                  className="flex items-center gap-1 text-xs font-medium text-ville-blue hover:underline"
                  title="Restaurer"
                >
                  <RotateCcw size={13} /> Restaurer
                </button>
                <button
                  onClick={() => purge(a.id, a.original_name)}
                  className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                  title="Purger définitivement"
                >
                  <Trash2 size={13} /> Purger
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Qui est abonné à quel engagement (cloche "alerte" sur la liste des
 * engagements) — groupé par engagement, pour répondre directement à "qui
 * suit quoi" sans avoir à demander à chacun.
 */
function AlertSubscriptionsSection({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<AlertSubscription[] | null>(null)

  function load() {
    api
      .get('/admin/alert-subscriptions')
      .then((res) => setRows(res.data))
      .catch((err) => onError(apiErrorMessage(err, 'Abonnements indisponibles')))
  }

  useEffect(load, [])

  const byEngagement = useMemo(() => {
    const groups = new Map<number, { numero: number; contenu: string; subs: AlertSubscription[] }>()
    for (const r of rows || []) {
      if (!groups.has(r.engagement_id)) {
        groups.set(r.engagement_id, { numero: r.engagement_numero, contenu: r.engagement_contenu, subs: [] })
      }
      groups.get(r.engagement_id)!.subs.push(r)
    }
    return [...groups.entries()].sort((a, b) => a[1].numero - b[1].numero)
  }, [rows])

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Bell size={16} /> Abonnements aux alertes
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Qui a activé la cloche "alerte" sur quel engagement — un mail récapitulatif est envoyé en fin de journée en
        cas de nouveauté.
      </p>
      {!rows?.length ? (
        <p className="text-sm text-slate-400">Aucun abonnement pour l'instant.</p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {byEngagement.map(([engagementId, group]) => (
            <li key={engagementId} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <Link
                to={`/engagements/${engagementId}`}
                className="font-medium text-slate-700 hover:text-ville-blue hover:underline"
              >
                n°{group.numero} — {group.contenu.slice(0, 70)}
                {group.contenu.length > 70 ? '…' : ''}
              </Link>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {group.subs.map((s) => (
                  <span
                    key={s.id}
                    title={`${s.user_email || s.user_sub}${s.last_notified_at ? ` · dernière alerte reçue le ${new Date(s.last_notified_at).toLocaleString('fr-FR')}` : ' · aucune alerte reçue pour l\'instant'}`}
                    className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200"
                  >
                    {s.user_display_name || s.user_sub}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Journal des mails envoyés (alertes quotidiennes, relances, envois
 * manuels) — pour vérifier ce qui a réellement été envoyé et si ça a
 * fonctionné. Inclut un bouton pour s'envoyer un exemple de récapitulatif
 * d'alertes (engagements fictifs), utile pour vérifier le rendu du
 * template mail sans attendre l'envoi automatique du soir. */
function MailLogSection({ onError, onNotice }: { onError: (m: string) => void; onNotice: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<MailLogEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)

  async function reveal() {
    setOpen(true)
    setBusy(true)
    try {
      const res = await api.get('/admin/mail-log', { params: { limit: 200 } })
      setItems(res.data)
    } catch (err) {
      onError(apiErrorMessage(err, 'Journal des mails indisponible'))
    } finally {
      setBusy(false)
    }
  }

  async function sendTestDigest() {
    setSendingTest(true)
    try {
      await api.post('/admin/mail-log/test-digest')
      onNotice("Exemple de récapitulatif d'alertes envoyé — vérifiez votre boîte mail.")
      if (open) reveal()
    } catch (err) {
      onError(apiErrorMessage(err, "Envoi de l'exemple impossible"))
    } finally {
      setSendingTest(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Mail size={16} /> Journal des mails
          </h2>
          <p className="text-xs text-slate-500">Alertes quotidiennes, relances et envois manuels — succès et échecs.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={sendTestDigest}
            disabled={sendingTest}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            title="M'envoyer un exemple de récapitulatif d'alertes (engagements fictifs)"
          >
            <Send size={13} />
            {sendingTest ? 'Envoi…' : "M'envoyer un exemple"}
          </button>
          <button
            onClick={reveal}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? 'Chargement…' : open ? 'Rafraîchir' : 'Afficher les logs'}
          </button>
        </div>
      </div>

      {open && items && (
        !items.length ? (
          <p className="mt-4 text-sm text-slate-400">Aucun mail envoyé pour l'instant.</p>
        ) : (
          <ul className="mt-4 max-h-[32rem] space-y-1.5 overflow-y-auto">
            {items.map((m) => (
              <li key={m.id} className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                {m.status === 'ok' ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-600" />
                ) : (
                  <XCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-slate-700">
                    <span className="font-medium">{m.subject}</span> → {m.to_email}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(m.created_at).toLocaleString('fr-FR')}
                    {m.context && ` · ${m.context}`}
                    {m.sent_by && ` · envoyé par ${m.sent_by}`}
                    {m.status === 'error' && m.error_message && (
                      <span className="text-red-600"> · {m.error_message}</span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  )
}

/** Icône + libellé courts par type d'événement du journal. */
const ACTIVITY_ICONS: Record<ActivityLogEntry['type'], typeof Pencil> = {
  champ: Pencil,
  commentaire: MessageSquare,
  piece_jointe_ajoutee: Paperclip,
  piece_jointe_supprimee: Trash2,
}

function activityDescription(entry: ActivityLogEntry) {
  switch (entry.type) {
    case 'champ':
      return (
        <>
          a modifié <span className="font-medium">{fieldLabel(entry.libelle)}</span>
        </>
      )
    case 'commentaire':
      return (
        <>
          a commenté : « {entry.nouvelle_valeur && entry.nouvelle_valeur.length > 120
            ? `${entry.nouvelle_valeur.slice(0, 120)}…`
            : entry.nouvelle_valeur}{' '}
          »
        </>
      )
    case 'piece_jointe_ajoutee':
      return (
        <>
          a ajouté la pièce jointe <span className="font-medium">{entry.libelle}</span>
        </>
      )
    case 'piece_jointe_supprimee':
      return (
        <>
          a supprimé la pièce jointe <span className="font-medium">{entry.libelle}</span>
        </>
      )
  }
}

/**
 * Journal global de tout ce qui s'est fait sur les engagements — modifications
 * de champ, commentaires, pièces jointes — tous engagements confondus. Chargé
 * à la demande (pas au montage de la page) : potentiellement volumineux et
 * peu consulté, inutile de l'interroger à chaque ouverture de l'admin.
 */
function ActivityLogSection({ onError }: { onError: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ActivityLogEntry[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function reveal() {
    setOpen(true)
    setBusy(true)
    try {
      const res = await api.get('/admin/activity-log', { params: { limit: 200 } })
      setItems(res.data)
    } catch (err) {
      onError(apiErrorMessage(err, 'Journal indisponible'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ScrollText size={16} /> Journal d'activité
          </h2>
          <p className="text-xs text-slate-500">
            Modifications, commentaires et pièces jointes sur tous les engagements, du plus récent au plus ancien.
          </p>
        </div>
        <button
          onClick={reveal}
          disabled={busy}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? 'Chargement…' : open ? 'Rafraîchir' : "Afficher les logs"}
        </button>
      </div>

      {open && items && (
        !items.length ? (
          <p className="mt-4 text-sm text-slate-400">Aucune activité enregistrée.</p>
        ) : (
          <ul className="mt-4 max-h-[32rem] space-y-1.5 overflow-y-auto">
            {items.map((entry, i) => {
              const Icon = ACTIVITY_ICONS[entry.type]
              return (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm"
                >
                  <Icon size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="text-slate-700">
                      <span className="font-medium">{entry.auteur || 'inconnu'}</span> {activityDescription(entry)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(entry.at).toLocaleString('fr-FR')} ·{' '}
                      <Link to={`/engagements/${entry.engagement_id}`} className="hover:text-ville-blue hover:underline">
                        n°{entry.engagement_numero} — {entry.engagement_contenu.slice(0, 60)}
                        {entry.engagement_contenu.length > 60 ? '…' : ''}
                      </Link>
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      )}
    </section>
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
