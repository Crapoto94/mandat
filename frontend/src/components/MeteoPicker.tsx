import type { Meteo } from '../types'

interface Props {
  meteos: Meteo[]
  value: string | null
  onChange: (code: string | null) => void
}

export default function MeteoPicker({ meteos, value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {meteos.map((m) => (
        <button
          key={m.code}
          type="button"
          title={m.libelle}
          onClick={() => onChange(value === m.code ? null : m.code)}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition-all ${
            value === m.code ? 'ring-2 ring-offset-1' : 'opacity-40 hover:opacity-80'
          }`}
          style={value === m.code ? { backgroundColor: `${m.couleur}22`, outlineColor: m.couleur } : undefined}
        >
          {m.emoji}
        </button>
      ))}
    </div>
  )
}

export function MeteoBadge({ meteo }: { meteo: Meteo | null | undefined }) {
  if (!meteo) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${meteo.couleur}1a`, color: meteo.couleur }}
      title={meteo.libelle}
    >
      {meteo.emoji} {meteo.libelle}
    </span>
  )
}
