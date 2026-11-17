import type { ModuleOwner } from '../types'

/** Base d'URL (sous /api) pour les modules partagés projet/engagement. */
export function ownerBase(owner: ModuleOwner): string {
  return owner.kind === 'engagement' ? `/engagements/${owner.id}` : `/projets/${owner.id}`
}
