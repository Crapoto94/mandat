// Couleurs par axe du projet, pour la lisibilité dans les listes et le
// tableau de bord. Les 5 axes sont fixes (cf. fichier de suivi source) ;
// un axe imprévu retombe sur une couleur neutre plutôt que de planter.
const AXE_COLORS: Record<string, string> = {
  "Une ville qui favorise l'implication citoyenne et fait vivre la démocratie locale": '#4f46e5', // indigo
  'Une ville qui lutte contre les discriminations et les violences sexistes et sexuelles': '#e11d48', // rose
  'Une ville qui protège': '#0284c7', // sky
  'Une ville qui poursuit la transition écologique': '#16a34a', // green
  'Une ville qui émancipe': '#d97706', // amber
}

const FALLBACK_COLOR = '#64748b' // slate

export function getAxeColor(axe: string | null | undefined): string {
  if (!axe) return FALLBACK_COLOR
  return AXE_COLORS[axe.trim()] || FALLBACK_COLOR
}

export function axeList(): string[] {
  return Object.keys(AXE_COLORS)
}
