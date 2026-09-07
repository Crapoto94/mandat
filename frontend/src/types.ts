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
  meteo_code: string | null
  meteo_libelle?: string | null
  meteo_emoji?: string | null
  meteo_couleur?: string | null
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
  roles?: EngagementRole[]
  steps?: EngagementStep[]
  attachments?: Attachment[]
}

export interface Meteo {
  code: string
  libelle: string
  emoji: string
  couleur: string
  ordre: number
}

export interface Attachment {
  id: number
  engagement_id: number
  original_name: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  created_at: string
}

export interface RoleDef {
  id: number
  libelle: string
  ordre: number
}

export interface EngagementRole {
  id: number
  engagement_id: number
  role_id: number
  role_libelle: string
  agent_username: string | null
  agent_display_name: string
  agent_direction: string | null
  created_by: string | null
  created_at: string
}

export interface EngagementStep {
  id: number
  engagement_id: number
  date_etape: string | null
  description: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TimelineEntry extends EngagementStep {
  engagement_numero: number
  engagement_contenu: string
  engagement_axe: string
  groupe_code: string | null
}

export interface AgentSearchResult {
  displayName?: string
  name?: string
  username?: string
  sAMAccountName?: string
  direction?: string
  service?: string
  mail?: string
  email?: string
}

export interface Direction {
  code: string
  libelle: string | null
  libelle_manuel: boolean
  updated_at: string
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
  parMeteo: Array<Meteo & { count: number }>
  meteoNonRenseignee: number
}
