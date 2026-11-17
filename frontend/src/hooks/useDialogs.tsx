import { useCallback, useState } from 'react'

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

interface PromptOptions {
  title?: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
}

type Pending =
  | ({ kind: 'confirm' } & ConfirmOptions & { resolve: (v: boolean) => void })
  | ({ kind: 'prompt' } & PromptOptions & { resolve: (v: string | null) => void })

/**
 * Remplace `window.confirm`/`window.prompt` (boîtes natives du navigateur,
 * hors charte) par des modales cohérentes avec le reste de l'app — même API
 * d'usage (await confirmAsync(...) / await promptAsync(...)) pour un
 * changement minimal aux points d'appel. Rendre `{dialog}` une fois dans le
 * JSX du composant appelant.
 */
export function useDialogs() {
  const [pending, setPending] = useState<Pending | null>(null)
  const [value, setValue] = useState('')

  const confirmAsync = useCallback((opts: ConfirmOptions | string) => {
    const o = typeof opts === 'string' ? { message: opts } : opts
    return new Promise<boolean>((resolve) => setPending({ kind: 'confirm', ...o, resolve }))
  }, [])

  const promptAsync = useCallback((opts: PromptOptions | string) => {
    const o = typeof opts === 'string' ? { message: opts } : opts
    setValue(o.defaultValue || '')
    return new Promise<string | null>((resolve) => setPending({ kind: 'prompt', ...o, resolve }))
  }, [])

  function settle(result: boolean | string | null) {
    if (!pending) return
    if (pending.kind === 'confirm') pending.resolve(result === true)
    else pending.resolve(typeof result === 'string' ? result : null)
    setPending(null)
  }

  const dialog = pending ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onClick={() => settle(pending.kind === 'confirm' ? false : null)}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {pending.title && <h3 className="mb-2 text-sm font-semibold text-slate-800">{pending.title}</h3>}
        {pending.message && <p className="mb-4 whitespace-pre-wrap text-sm text-slate-600">{pending.message}</p>}
        {pending.kind === 'prompt' && (
          <input
            autoFocus
            value={value}
            placeholder={pending.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') settle(value)
              if (e.key === 'Escape') settle(null)
            }}
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => settle(pending.kind === 'confirm' ? false : null)}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Annuler
          </button>
          <button
            autoFocus={pending.kind === 'confirm'}
            onClick={() => settle(pending.kind === 'confirm' ? true : value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 ${
              pending.kind === 'confirm' && pending.danger ? 'bg-red-600' : 'bg-ville-blue'
            }`}
          >
            {pending.confirmLabel || (pending.kind === 'prompt' ? 'Valider' : 'Confirmer')}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirmAsync, promptAsync, dialog }
}
