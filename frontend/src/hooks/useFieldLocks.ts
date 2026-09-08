import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export interface FieldLock {
  champ: string
  user_sub: string
  display_name: string
  started_at: string
}

const POLL_MS = 6000

/**
 * Verrous actifs sur un engagement, rafraîchis périodiquement — pour que
 * tout viewer (pas seulement celui qui édite) voie qui modifie quoi.
 * Filtre son propre verrou (inutile de s'afficher à soi-même).
 */
export function useFieldLocks(engagementId: number | null) {
  const { user } = useAuth()
  const [locks, setLocks] = useState<FieldLock[]>([])

  useEffect(() => {
    if (!engagementId) return
    let cancelled = false

    function poll() {
      api
        .get(`/engagements/${engagementId}/locks`)
        .then((res) => {
          if (!cancelled) setLocks(res.data.filter((l: FieldLock) => l.user_sub !== user?.sub))
        })
        .catch(() => {})
    }

    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [engagementId, user?.sub])

  function lockFor(champ: string) {
    return locks.find((l) => l.champ === champ) || null
  }

  return { locks, lockFor }
}
