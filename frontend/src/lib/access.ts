import type { NiveauAcces } from '../types'

const RANK: Record<NiveauAcces, number> = { consultation: 1, modification: 2, administration: 3 }

/** true si `level` couvre au moins `min` (ex. atLeast('modification', 'consultation') = true). */
export function atLeast(level: NiveauAcces | undefined | null, min: NiveauAcces): boolean {
  return !!level && RANK[level] >= RANK[min]
}
