import { getAxeColor } from '../lib/axeColors'

export default function AxeTag({ axe, className = '' }: { axe: string; className?: string }) {
  const color = getAxeColor(axe)
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 text-xs font-medium ${className}`}
      style={{ color }}
      title={axe}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{axe}</span>
    </span>
  )
}
