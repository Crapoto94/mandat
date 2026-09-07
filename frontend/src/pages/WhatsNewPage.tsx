import { APP_VERSION, APP_RELEASE_DATE } from '../lib/version'
import {
  Sparkles,
  ListChecks,
  Users2,
  GitCommitHorizontal,
  Paperclip,
  Presentation,
  MessageSquareWarning,
  UserCircle2,
  LayoutDashboard,
  ShieldCheck,
  Link2,
} from 'lucide-react'

interface FeatureGroup {
  icon: typeof Sparkles
  title: string
  items: string[]
}

const FEATURES: FeatureGroup[] = [
  {
    icon: ListChecks,
    title: 'Suivi des 55 engagements du mandat',
    items: [
      "Fiche par engagement : axe du projet, pilotage, contributions, échéance, groupe de travail — infos de base modifiables directement",
      "État d'avancement et météo (santé/risque du sujet) éditables, avec historique des modifications (réservé aux administrateurs)",
      'Description du point atteint en éditeur enrichi (mise en forme, copier-coller direct d’images)',
      'Fil de commentaires horodaté par engagement',
    ],
  },
  {
    icon: Users2,
    title: 'Groupes de travail et rôles',
    items: [
      'Répartition en 3 groupes de travail (issue de la répartition CODIR), avec vues filtrées',
      "Rôles assignés à un engagement : recherche d'agent dans l'annuaire Ville + rôle choisi dans un catalogue paramétrable",
      '« Mes engagements » : vue personnalisée listant les engagements où la direction de l’agent connecté est pilote, contributrice ou ressource, avec pastille de comptage',
    ],
  },
  {
    icon: GitCommitHorizontal,
    title: 'Étapes et timeline',
    items: [
      'Étapes datées par engagement, formant une timeline projet',
      'Timeline globale, tous engagements confondus, triée chronologiquement',
    ],
  },
  {
    icon: Paperclip,
    title: 'Pièces jointes',
    items: [
      'Ajout de documents par engagement, avec prévisualisation intégrée (PDF, images, e-mails Outlook .msg)',
      'Suppression douce : un document retiré reste récupérable en corbeille (administration)',
    ],
  },
  {
    icon: Presentation,
    title: 'Restitution en plénière',
    items: [
      'Marquage « prioritaire plénière » (jusqu’à 3 engagements par groupe) avec note explicative',
      'Synthèse dédiée, imprimable, pour la restitution collective',
    ],
  },
  {
    icon: MessageSquareWarning,
    title: 'Coordination transversale',
    items: [
      "Sujets de coordination pouvant lier plusieurs engagements et plusieurs directions, avec statut de suivi (à trancher / en discussion / réglé)",
      'Sélection des directions et engagements concernés en liste, sans saisie libre',
    ],
  },
  {
    icon: LayoutDashboard,
    title: 'Tableau de bord',
    items: [
      "Avancement par état, par axe du projet (codes couleur dédiés) et par groupe de travail",
      'Météo globale des engagements, indicateurs cliquables pour filtrer la liste correspondante',
    ],
  },
  {
    icon: UserCircle2,
    title: 'Authentification',
    items: [
      "Connexion avec l'identifiant Ville habituel (annuaire Active Directory)",
      "Accès de secours admin (compte local), disponible si l'annuaire est indisponible",
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Administration',
    items: [
      'Comptes de secours, catalogues éditables (états d’avancement, météo, rôles)',
      'Table de concordance des sigles de direction ↔ nom complet, synchronisable depuis le référentiel Hub DSI',
      "Outil de vérification d'un agent dans l'annuaire (identité, direction, engagements concernés), sans avoir besoin de son mot de passe",
      'Réimport des fichiers Excel sources (engagements, répartition par groupe), corbeille des pièces jointes',
    ],
  },
  {
    icon: Link2,
    title: 'Intégrations Ville',
    items: [
      "API centrale APM : authentification agent, envoi de mail et de SMS",
      'Hub DSI : référentiel des directions et services',
    ],
  },
]

export default function WhatsNewPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={20} className="text-ville-blue" />
          <h1 className="text-xl font-semibold text-slate-900">Nouveautés</h1>
          <span className="rounded-full bg-ville-blue/10 px-2.5 py-0.5 text-xs font-semibold text-ville-blue">
            v{APP_VERSION}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          {new Date(APP_RELEASE_DATE).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Conception : DSI (Marc Chevalier) et Claude.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Synthèse des fonctionnalités — v{APP_VERSION}</h2>
        <div className="space-y-6">
          {FEATURES.map(({ icon: Icon, title, items }) => (
            <div key={title}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Icon size={16} className="text-ville-blue" /> {title}
              </h3>
              <ul className="ml-6 list-disc space-y-1 text-sm text-slate-600">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
