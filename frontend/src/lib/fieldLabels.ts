// Libellés lisibles des champs d'engagement modifiables, pour l'affichage de
// l'historique (fiche engagement + journal d'activité admin).
export const FIELD_LABELS: Record<string, string> = {
  etat_code: "l'état d'avancement",
  meteo_code: 'la météo',
  description_avancement: 'la description du point atteint',
  prochaines_etapes: 'les prochaines étapes',
  roles_precises: 'les rôles précisés',
  axe: "l'axe du projet",
  contenu: 'le nom de l’engagement',
  pilotage: 'le pilotage',
  contribution_elaboration: "la contribution à l'élaboration",
  contribution_impactees: 'les directions impactées',
  echeance: "l'échéance",
  groupe_id: 'le groupe de travail',
  prioritaire_plenaire: 'le marquage prioritaire plénière',
}

export function fieldLabel(code: string) {
  return FIELD_LABELS[code] || code
}
