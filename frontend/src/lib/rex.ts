import type { RexActionStatut, RexMoment, RexPosition, RexReflexeStatut, RexSujetStatut } from '../types.rex'

export const PARTIES: Record<number, { court: string; titre: string; couleur: string }> = {
  1: { court: 'Continuité', titre: "Plan de continuité de l'activité", couleur: '#0055A4' },
  2: { court: 'Bâtiments', titre: 'Adaptabilité des bâtiments publics aux extrêmes climatiques', couleur: '#b45309' },
  3: { court: 'Habitants', titre: 'Impact sur la vie des habitants', couleur: '#0f766e' },
}

export const SUJET_STATUTS: Record<RexSujetStatut, { label: string; className: string }> = {
  a_discuter: { label: 'À discuter', className: 'bg-slate-100 text-slate-600' },
  a_arbitrer: { label: 'À arbitrer en CODIR', className: 'bg-amber-100 text-amber-800' },
  valide: { label: 'Validé', className: 'bg-sky-100 text-sky-800' },
  en_oeuvre: { label: 'En œuvre', className: 'bg-blue-100 text-blue-800' },
  realise: { label: 'Réalisé', className: 'bg-green-100 text-green-800' },
}

export const ACTION_STATUTS: Record<RexActionStatut, { label: string; className: string }> = {
  a_faire: { label: 'À faire', className: 'bg-slate-100 text-slate-600' },
  en_cours: { label: 'En cours', className: 'bg-blue-100 text-blue-800' },
  fait: { label: 'Fait', className: 'bg-green-100 text-green-800' },
  abandonne: { label: 'Abandonnée', className: 'bg-red-50 text-red-600' },
}

export const REFLEXE_STATUTS: Record<RexReflexeStatut, { label: string; className: string }> = {
  propose: { label: 'Proposé', className: 'bg-slate-100 text-slate-600' },
  valide: { label: 'Validé CODIR', className: 'bg-green-100 text-green-800' },
  a_revoir: { label: 'À revoir', className: 'bg-amber-100 text-amber-800' },
}

export const MOMENTS: Record<RexMoment, { label: string; sous: string; dot: string }> = {
  preparation: { label: 'Avant la saison', sous: 'Prêts avant le 1er mai : on prépare, on teste, on stocke', dot: '#0055A4' },
  veille: { label: 'Veille (vigilance jaune)', sous: 'Les prévisions annoncent de la chaleur', dot: '#ca8a04' },
  orange: { label: 'Vigilance orange', sous: '« Aller-vers » : cellule de crise, alerte, appels quotidiens', dot: '#ea580c' },
  rouge: { label: 'Vigilance rouge', sous: '« Aller-vers renforcé » puis « sortir de » : fermetures, extraction des plus vulnérables', dot: '#dc2626' },
  apres: { label: "Après l'épisode", sous: 'Retour à chaud, suivi des agents, mise à jour du REX', dot: '#475569' },
}

export const POSITIONS: Record<RexPosition, { label: string; className: string; active: string }> = {
  accord: { label: "D'accord", className: 'text-green-700 border-green-200 hover:bg-green-50', active: 'bg-green-600 text-white border-green-600' },
  reserve: { label: 'Sous réserve', className: 'text-amber-700 border-amber-200 hover:bg-amber-50', active: 'bg-amber-500 text-white border-amber-500' },
  desaccord: { label: "Pas d'accord", className: 'text-red-700 border-red-200 hover:bg-red-50', active: 'bg-red-600 text-white border-red-600' },
}

export const ORIGINES: Record<string, string> = {
  tableau: 'Tableau REX',
  cr: 'Compte rendu du 14/10',
  analyse: 'Proposé par analyse — à confirmer par le pilote',
  saisie: 'Saisi par un agent',
}

const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/** « AAAA-MM-JJ » -> « 4 déc. 2026 ». */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : fmt.format(d)
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function relativeDay(iso: string | null): string {
  if (!iso) return 'aucune activité'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

/** Découpe un texte de pilotage libre (« DG, DCOM » ou « DBC/DSALE ») en sigles. */
export function splitDirections(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .split(/[,/+;·]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
