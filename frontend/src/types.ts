export type Role = 'agent' | 'admin'

export interface AuthUser {
  sub: string
  role: Role
  displayName: string
  direction?: string | null
  email?: string | null
}

export interface Etat {
  code: string
  libelle: string
  ordre: number
  couleur: string
}

export interface Groupe {
  id: number
  code: string
  nom: string
  directions: string[]
  ordre: number
  total_engagements?: number
  par_etat?: Record<string, number>
}

export interface Engagement {
  id: number
  numero: number
  axe: string
  contenu: string
  pilotage: string | null
  contribution_elaboration: string | null
  contribution_impactees: string | null
  echeance: string | null
  etat_code: string
  etat_libelle?: string
  etat_couleur?: string
  description_avancement: string | null
  prochaines_etapes: string | null
  roles_precises: string | null
  groupe_id: number | null
  groupe_code?: string | null
  groupe_nom?: string | null
  prioritaire_plenaire: boolean
  prioritaire_note: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  history?: EngagementHistoryEntry[]
  comments?: Comment[]
  coordinationTopics?: CoordinationTopic[]
}

export interface EngagementHistoryEntry {
  id: number
  engagement_id: number
  champ: string
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  changed_by: string | null
  changed_at: string
}

export interface Comment {
  id: number
  engagement_id: number
  author_name: string
  author_direction: string | null
  body: string
  created_at: string
}

export interface CoordinationTopic {
  id: number
  titre: string
  description: string | null
  statut: 'a_trancher' | 'en_discussion' | 'regle'
  directions_concernees: string[]
  engagement_ids?: number[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DashboardSummary {
  total: number
  prioritaires: number
  sansGroupe: number
  parEtat: Array<Etat & { count: number }>
  parAxe: Array<{ axe: string; count: number }>
  parGroupe: Array<{ code: string; nom: string; count: number }>
}
