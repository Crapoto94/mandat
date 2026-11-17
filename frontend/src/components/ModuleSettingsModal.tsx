import { X, Eye, EyeOff, ChevronUp, ChevronDown, Settings } from 'lucide-react'
import type { ModuleLayoutEntry } from '../types'

interface ModuleMeta {
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

/**
 * Paramétrage explicite des modules ("widgets") d'une fiche — activer/
 * désactiver, réordonner (flèches, en plus du glisser-déposer disponible
 * directement sur chaque module via ModuleFrame). Complète le geste rapide
 * (survoler un module) par un endroit unique et découvrable pour tout revoir
 * d'un coup.
 */
export default function ModuleSettingsModal({
  layout,
  moduleMeta,
  toggle,
  reorder,
  onClose,
}: {
  layout: ModuleLayoutEntry[]
  moduleMeta: Record<string, ModuleMeta>
  toggle: (key: string) => void
  reorder: (fromKey: string, toKey: string) => void
  onClose: () => void
}) {
  function moveUp(key: string) {
    const idx = layout.findIndex((e) => e.module_key === key)
    if (idx > 0) reorder(key, layout[idx - 1].module_key)
  }
  function moveDown(key: string) {
    const idx = layout.findIndex((e) => e.module_key === key)
    if (idx >= 0 && idx < layout.length - 1) reorder(key, layout[idx + 1].module_key)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Settings size={16} /> Modules de la fiche
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Choisissez les modules à afficher sur cette fiche, et leur ordre — propre à cette fiche uniquement.
        </p>
        <ul className="space-y-1">
          {layout.map((entry, i) => {
            const meta = moduleMeta[entry.module_key]
            if (!meta) return null
            const Icon = meta.icon
            return (
              <li
                key={entry.module_key}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm ${entry.enabled ? 'bg-slate-50' : 'bg-slate-50/50 text-slate-400'}`}
              >
                <Icon size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{meta.title}</span>
                <button
                  onClick={() => moveUp(entry.module_key)}
                  disabled={i === 0}
                  title="Monter"
                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-ville-blue disabled:opacity-30"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => moveDown(entry.module_key)}
                  disabled={i === layout.length - 1}
                  title="Descendre"
                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-ville-blue disabled:opacity-30"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={() => toggle(entry.module_key)}
                  title={entry.enabled ? 'Masquer' : 'Afficher'}
                  className={`rounded p-1 hover:bg-white ${entry.enabled ? 'text-ville-blue' : 'text-slate-400'}`}
                >
                  {entry.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
