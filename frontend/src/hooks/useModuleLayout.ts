import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { ownerBase } from '../lib/owner'
import type { ModuleLayoutEntry, ModuleOwner } from '../types'

/**
 * Disposition des modules ("widgets") d'une fiche — activé/désactivé,
 * ordre — persistée par fiche (cf. migrations/024_module_layout.sql). Une
 * fiche sans disposition enregistrée utilise `defaultOrder` tel quel (tout
 * activé, dans l'ordre donné) : pas besoin de pré-remplir chaque fiche
 * existante côté serveur.
 */
export function useModuleLayout(owner: ModuleOwner, defaultOrder: string[]) {
  const [saved, setSaved] = useState<ModuleLayoutEntry[] | null>(null)

  useEffect(() => {
    setSaved(null)
    api
      .get<ModuleLayoutEntry[]>(`${ownerBase(owner)}/module-layout`)
      .then((res) => setSaved(res.data))
      .catch(() => setSaved([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.kind, owner.id])

  // Fusionne la disposition enregistrée avec la liste par défaut : un
  // module par défaut absent de la disposition enregistrée (nouveau module
  // ajouté après coup, ou fiche jamais personnalisée) s'ajoute à la fin,
  // activé.
  const layout = useMemo<ModuleLayoutEntry[]>(() => {
    if (saved === null) return defaultOrder.map((module_key, position) => ({ module_key, enabled: true, position }))
    const byKey = new Map(saved.map((e) => [e.module_key, e]))
    const merged: ModuleLayoutEntry[] = []
    for (const key of defaultOrder) {
      if (!byKey.has(key)) merged.push({ module_key: key, enabled: true, position: 0 })
    }
    merged.push(...saved.filter((e) => defaultOrder.includes(e.module_key)))
    return merged.sort((a, b) => a.position - b.position || defaultOrder.indexOf(a.module_key) - defaultOrder.indexOf(b.module_key));
  }, [saved, defaultOrder])

  const persist = useCallback(
    (next: ModuleLayoutEntry[]) => {
      setSaved(next)
      api.put(`${ownerBase(owner)}/module-layout`, { items: next.map(({ module_key, enabled }) => ({ module_key, enabled })) }).catch(() => {})
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owner.kind, owner.id]
  )

  function toggle(moduleKey: string) {
    const next = layout.map((e) => (e.module_key === moduleKey ? { ...e, enabled: !e.enabled } : e))
    persist(next)
  }

  function reorder(fromKey: string, toKey: string) {
    if (fromKey === toKey) return
    const keys = layout.map((e) => e.module_key)
    const fromIdx = keys.indexOf(fromKey)
    const toIdx = keys.indexOf(toKey)
    if (fromIdx < 0 || toIdx < 0) return
    const reordered = [...layout]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    persist(reordered.map((e, i) => ({ ...e, position: i })))
  }

  return { layout, loading: saved === null, toggle, reorder }
}
