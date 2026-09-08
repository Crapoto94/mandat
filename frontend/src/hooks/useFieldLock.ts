import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

const HEARTBEAT_MS = 12000 // sous les 30s de péremption côté serveur, avec marge

/**
 * Détient le verrou d'un champ tant que `active` est vrai (heartbeat
 * périodique), le libère sinon (blur, fermeture...). Si un autre utilisateur
 * détient déjà le verrou, `conflict` porte son nom — le champ doit alors
 * rester lecture seule côté appelant.
 */
export function useFieldLock(engagementId: number | null, champ: string, active: boolean) {
  const [conflict, setConflict] = useState<{ display_name: string } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!engagementId || !active) {
      // Ne pas laisser un conflit affiché devenir orphelin : si on n'est
      // plus en train d'essayer d'éditer (ex : champ passé en lecture
      // seule suite au conflit, donc plus "actif"), on ne réinterroge plus
      // jamais le serveur ici — sans ce reset, le message "X modifie déjà
      // ce champ" resterait affiché indéfiniment même après que X ait
      // terminé. C'est useFieldLocks (liste, sondée en continu) qui prend
      // le relais pour détecter la libération réelle.
      setConflict(null)
      return
    }

    let cancelled = false

    async function acquire() {
      try {
        await api.post(`/engagements/${engagementId}/locks/${champ}`)
        if (!cancelled) setConflict(null)
      } catch (err: unknown) {
        if (!cancelled && typeof err === 'object' && err && 'response' in err) {
          const resp = (err as { response?: { status?: number; data?: { holder?: { display_name: string } } } }).response
          if (resp?.status === 409 && resp.data?.holder) setConflict(resp.data.holder)
        }
      }
    }

    acquire()
    intervalRef.current = setInterval(acquire, HEARTBEAT_MS)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      api.delete(`/engagements/${engagementId}/locks/${champ}`).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagementId, champ, active])

  return conflict
}
