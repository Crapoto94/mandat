import { useState, type ReactNode } from 'react'
import { GripVertical, Eye, EyeOff } from 'lucide-react'

/**
 * Enveloppe un module ("widget") de fiche projet/engagement : poignée de
 * glisser-déposer (réordonne parmi les autres modules de la fiche) et
 * bouton masquer/afficher. Un module masqué se réduit à une simple barre
 * (pas de disparition complète) — visible et réactivable en place, sans
 * devoir aller chercher un panneau de configuration séparé.
 */
export default function ModuleFrame({
  moduleKey,
  title,
  icon: Icon,
  enabled,
  onToggle,
  onReorder,
  children,
}: {
  moduleKey: string
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  enabled: boolean
  onToggle: () => void
  onReorder: (fromKey: string, toKey: string) => void
  children: ReactNode
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      className={`rounded-xl border transition-colors ${dragOver ? 'border-ville-blue' : 'border-transparent'}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const fromKey = e.dataTransfer.getData('text/module-key')
        if (fromKey) onReorder(fromKey, moduleKey)
      }}
    >
      {!enabled ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-2.5">
          <span
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/module-key', moduleKey)}
            className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            title="Glisser pour réordonner"
          >
            <GripVertical size={14} />
          </span>
          <Icon size={14} className="text-slate-400" />
          <span className="flex-1 text-sm text-slate-400">{title} — masqué</span>
          <button
            onClick={onToggle}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-ville-blue"
          >
            <Eye size={13} /> Afficher
          </button>
        </div>
      ) : (
        <div className="group relative">
          <div className="absolute -left-6 top-5 hidden items-center gap-1 sm:flex">
            <span
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/module-key', moduleKey)}
              className="cursor-grab text-slate-300 opacity-0 transition-opacity hover:text-slate-500 group-hover:opacity-100 active:cursor-grabbing"
              title="Glisser pour réordonner"
            >
              <GripVertical size={16} />
            </span>
          </div>
          <button
            onClick={onToggle}
            title="Masquer ce module"
            className="absolute right-3 top-3 z-10 rounded-md p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
          >
            <EyeOff size={14} />
          </button>
          {children}
        </div>
      )}
    </div>
  )
}
