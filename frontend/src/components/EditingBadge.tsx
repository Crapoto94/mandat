function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Pastille "X est en cours de modification", avec infobulle native (title). */
export default function EditingBadge({ displayName }: { displayName: string }) {
  return (
    <span
      title={`${displayName} est en cours de modification`}
      className="inline-flex h-5 w-5 shrink-0 animate-pulse items-center justify-center rounded-full bg-amber-400 text-[10px] font-semibold text-white"
    >
      {initials(displayName)}
    </span>
  )
}
