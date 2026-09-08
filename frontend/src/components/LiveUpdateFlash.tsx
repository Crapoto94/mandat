import { RefreshCw } from 'lucide-react'

/** Pastille temporaire "mis à jour" — apparaît/disparaît en fondu. */
export default function LiveUpdateFlash({ show }: { show: boolean }) {
  return (
    <div
      className={`pointer-events-none fixed right-4 top-16 z-30 flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition-all duration-500 ${
        show ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <RefreshCw size={12} className={show ? 'animate-spin' : ''} />
      Mis à jour
    </div>
  )
}
