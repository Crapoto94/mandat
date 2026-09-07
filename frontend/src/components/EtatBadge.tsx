interface Props {
  libelle?: string
  couleur?: string
  className?: string
}

export default function EtatBadge({ libelle, couleur, className = '' }: Props) {
  const color = couleur || '#64748b'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {libelle || 'Inconnu'}
    </span>
  )
}
