import { useEffect, useRef, useState } from 'react'
import { api, apiErrorMessage } from '../lib/api'
import type { AgentSearchResult, EngagementRole, RoleDef } from '../types'
import { Users, X, Search } from 'lucide-react'

interface Props {
  engagementId: number
  roles: EngagementRole[]
  onChange: () => void
}

export default function RolesSection({ engagementId, roles, onChange }: Props) {
  const [roleDefs, setRoleDefs] = useState<RoleDef[]>([])
  const [roleId, setRoleId] = useState<number | ''>('')
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AgentSearchResult[]>([])
  const [selected, setSelected] = useState<AgentSearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.get('/roles').then((res) => {
      setRoleDefs(res.data)
      if (res.data[0]) setRoleId(res.data[0].id)
    })
  }, [])

  useEffect(() => {
    setSelected(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(() => {
      api
        .get('/agents/search', { params: { q: query.trim() } })
        .then((res) => setSuggestions(res.data.results || []))
        .catch(() => setSuggestions([]))
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!roleId || !query.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/engagements/${engagementId}/roles`, {
        role_id: roleId,
        agent_username: selected?.username || selected?.sAMAccountName || null,
        agent_display_name: selected?.displayName || selected?.name || query.trim(),
        agent_direction: selected?.direction || selected?.service || null,
      })
      setQuery('')
      setSuggestions([])
      setSelected(null)
      onChange()
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible d'assigner ce rôle"))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    await api.delete(`/engagements/${engagementId}/roles/${id}`)
    onChange()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Users size={16} /> Rôles assignés
      </h2>

      {!!roles.length && (
        <ul className="mb-4 space-y-2">
          {roles.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>
                <span className="rounded-full bg-ville-blue/10 px-2 py-0.5 text-xs font-medium text-ville-blue">
                  {r.role_libelle}
                </span>{' '}
                <span className="font-medium text-slate-800">{r.agent_display_name}</span>
                {r.agent_direction && <span className="text-slate-400"> · {r.agent_direction}</span>}
              </span>
              <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600" title="Retirer">
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-slate-500">Agent</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un agent (nom)…"
              className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-2 text-sm focus:border-ville-blue focus:outline-none"
            />
          </div>
          {!!suggestions.length && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(s)
                      setQuery(s.displayName || s.name || '')
                      setSuggestions([])
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium">{s.displayName || s.name}</span>
                    {(s.direction || s.service) && (
                      <span className="text-slate-400"> · {s.direction || s.service}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {suggestions.length === 0 && query.trim().length >= 2
              ? "Aucune correspondance dans l'annuaire — le nom saisi sera utilisé tel quel."
              : 'Annuaire Ville si disponible, sinon saisie libre.'}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Rôle</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            {roleDefs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.libelle}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded-md bg-ville-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          Assigner
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
