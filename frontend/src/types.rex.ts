// REX Canicule (cf. backend/modules/rex) — types partagés par les composants components/rex/*.

export type RexSujetStatut = 'a_discuter' | 'a_arbitrer' | 'valide' | 'en_oeuvre' | 'realise'
export type RexActionStatut = 'a_faire' | 'en_cours' | 'fait' | 'abandonne'
export type RexReflexeStatut = 'propose' | 'valide' | 'a_revoir'
export type RexMoment = 'preparation' | 'veille' | 'orange' | 'rouge' | 'apres'
export type RexPosition = 'accord' | 'reserve' | 'desaccord'
export type RexCibleType = 'thematique' | 'sujet' | 'action' | 'reflexe'

export interface RexEngagementRef {
  id: number
  numero: number
  contenu: string
  etat_code?: string
  pilotage?: string | null
  motif: string | null
}

export interface RexPositionSummary {
  accord: number
  reserve: number
  desaccord: number
  total: number
  directions: string[]
  mine: { position: RexPosition; commentaire: string | null } | null
}

export interface RexPositionDetail {
  direction: string | null
  display_name: string | null
  position: RexPosition
  commentaire: string | null
}

export interface RexSujet {
  id: number
  thematique_id: number
  ordre: number
  libelle: string
  constat: string | null
  a_fonctionne: string | null
  a_ameliorer: string | null
  mesures: string | null
  pilotage: string | null
  decision: string | null
  statut: RexSujetStatut
  origine: 'tableau' | 'cr' | 'saisie'
  updated_by: string | null
  updated_at: string
  engagements: RexEngagementRef[]
  actions_total: number
  actions_faites: number
  commentaires: number
  positions: RexPositionSummary
  a_completer: string[]
}

export interface RexThematique {
  id: number
  partie: 1 | 2 | 3
  ordre: number
  titre: string
  description: string | null
  observations_cr: number
  sujets: RexSujet[]
}

export interface RexAction {
  id: number
  sujet_id: number | null
  sujet_libelle: string | null
  thematique_titre: string | null
  partie: number | null
  titre: string
  description: string | null
  pilote_direction: string | null
  pilote_nom: string | null
  pilote_sub: string | null
  echeance: string | null
  echeance_texte: string | null
  statut: RexActionStatut
  priorite: 'normale' | 'haute'
  origine: 'cr' | 'analyse' | 'saisie'
  en_retard: boolean
  commentaires: number
  engagements: RexEngagementRef[]
  positions: RexPositionSummary
}

export interface RexReflexe {
  id: number
  moment: RexMoment
  ordre: number
  titre: string
  description: string | null
  responsable: string | null
  delai: string | null
  sujet_id: number | null
  sujet_libelle: string | null
  statut: RexReflexeStatut
  origine: 'cr' | 'analyse' | 'saisie'
  commentaires: number
  positions: RexPositionSummary
  positions_detail: RexPositionDetail[]
}

export interface RexComment {
  id: number
  cible_type: RexCibleType
  cible_id: number
  author_name: string
  author_direction: string | null
  author_sub: string | null
  body: string
  is_cr: boolean
  created_at: string
  edited_at: string | null
}

export interface RexHistoryEntry {
  id: number
  champ: string
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  changed_by: string | null
  changed_at: string
}

export interface RexSujetDetail extends Omit<RexSujet, 'actions_total' | 'actions_faites' | 'commentaires' | 'a_completer'> {
  thematique_titre: string
  partie: 1 | 2 | 3
  actions: RexAction[]
  comments: RexComment[]
  history: RexHistoryEntry[]
  positions_detail: RexPositionDetail[]
  observations_cr: RexComment[]
  reflexes: { id: number; titre: string; moment: RexMoment; statut: RexReflexeStatut }[]
}

export interface RexTravail {
  id: number
  saison: 'ete' | 'hiver'
  categorie: string | null
  equipement: string
  nature: string
  date_realisation: string | null
  date_texte: string | null
  nb_brasseurs: number
  nb_ventilateurs: number
  observations: string | null
}

export interface RexActivity {
  kind: 'history' | 'comment'
  at: string
  by: string | null
  direction?: string | null
  type: RexCibleType
  id: number
  champ?: string | null
  champ_label?: string | null
  valeur: string | null
  cible_label: string | null
}

export interface RexMine {
  direction: string | null
  codes: string[]
  actions: {
    id: number
    titre: string
    statut: RexActionStatut
    priorite: string
    echeance: string | null
    echeance_texte: string | null
    pilote_direction: string | null
    sujet_id: number | null
    sujet_libelle: string | null
    en_retard: boolean
  }[]
  reflexes_a_positionner: { id: number; titre: string; moment: RexMoment; responsable: string | null; statut: RexReflexeStatut }[]
  sujets_a_traiter: { id: number; libelle: string; pilotage: string | null; statut: RexSujetStatut }[]
  total: number
}

export interface RexOverview {
  saison_cible: string
  jours_restants: number
  sujets: { total: number; par_statut: Record<RexSujetStatut, number>; a_completer: number; lies_mandat: number }
  actions: {
    total: number
    par_statut: Record<RexActionStatut, number>
    en_retard: number
    sans_pilote: number
    a_confirmer: number
    avancement: number
  }
  reflexes: { total: number; valides: number; a_revoir: number; par_moment: Record<RexMoment, { total: number; valides: number }> }
  travaux: { total: number; realises: number; prevus: number; brasseurs: number; ventilateurs: number }
  engagements_lies: number
  sujets_a_completer: { id: number; libelle: string; partie: number; manque: string[] }[]
  sujets_a_arbitrer: { id: number; libelle: string; partie: number }[]
  participation: {
    code: string
    positions: number
    reflexes_positionnes: number
    commentaires: number
    actions_pilotees: number
    actions_faites: number
    derniere_activite: string | null
  }[]
  activite: RexActivity[]
  mine: RexMine
}
