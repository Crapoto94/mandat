import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, apiErrorMessage } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Comment, Engagement, Etat, FieldProposal, Groupe, Meteo } from '../types'
import { axeList } from '../lib/axeColors'
import { fieldLabel } from '../lib/fieldLabels'
import { useFieldLock } from '../hooks/useFieldLock'
import { useFieldLocks } from '../hooks/useFieldLocks'
import EtatBadge from '../components/EtatBadge'
import AxeTag from '../components/AxeTag'
import RichTextEditor from '../components/RichTextEditor'
import RolesSection from '../components/RolesSection'
import StepsTimeline from '../components/StepsTimeline'
import AttachmentsSection from '../components/AttachmentsSection'
import MeteoPicker from '../components/MeteoPicker'
import ToggleSwitch from '../components/ToggleSwitch'
import EditingBadge from '../components/EditingBadge'
import LiveUpdateFlash from '../components/LiveUpdateFlash'
import { ArrowLeft, Star, Send, Clock, MessageSquare, Pencil, X, Infinity as InfinityIcon } from 'lucide-react'

const POLL_MS = 7000
const DEBOUNCE_MS = 1500

export default function EngagementDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [engagement, setEngagement] = useState<Engagement | null>(null)
  const [etats, setEtats] = useState<Etat[]>([])
  const [meteos, setMeteos] = useState<Meteo[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(false)

  const [description, setDescription] = useState('')
  const [descriptionFocused, setDescriptionFocused] = useState(false)
  const [prioNote, setPrioNote] = useState('')
  const [commentBody, setCommentBody] = useState('')

  const { lockFor } = useFieldLocks(engagement ? engagement.id : null)
  // Détient/heartbeat notre propre verrou pendant l'édition — la valeur de
  // retour (conflit immédiat) n'est pas utilisée pour l'affichage : c'est
  // `descriptionLock`, sondé en continu via useFieldLocks, qui pilote le
  // lecture-seule et le message, pour ne jamais rester bloqué sur un état
  // périmé une fois le champ passé en lecture seule (donc plus "actif").
  useFieldLock(engagement ? engagement.id : null, 'description_avancement', descriptionFocused)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLoadedDescriptionRef = useRef('')

  function applyEngagement(data: Engagement, opts: { resetDrafts: boolean }) {
    setEngagement(data)
    if (opts.resetDrafts) {
      setDescription(data.description_avancement || '')
      lastLoadedDescriptionRef.current = data.description_avancement || ''
      setPrioNote(data.prioritaire_note || '')
    }
  }

  function load() {
    api.get(`/engagements/${id}`).then((res) => applyEngagement(res.data, { resetDrafts: true }))
  }

  useEffect(() => {
    load()
    api.get('/etats').then((res) => setEtats(res.data))
    api.get('/meteos').then((res) => setMeteos(res.data))
    api.get('/groupes').then((res) => setGroupes(res.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Rafraîchissement live : tous les viewers voient les changements des
  // autres, sans recharger la page. On ne touche jamais un champ en cours
  // de saisie locale (description avec le focus) pour ne pas l'écraser.
  useEffect(() => {
    if (!id) return
    const interval = setInterval(() => {
      api
        .get(`/engagements/${id}`)
        .then((res) => {
          const fresh: Engagement = res.data
          setEngagement((prev) => {
            if (prev && JSON.stringify(prev) === JSON.stringify(fresh)) return prev
            setFlash(true)
            setTimeout(() => setFlash(false), 1200)
            return fresh
          })
          if (!descriptionFocused) {
            setDescription(fresh.description_avancement || '')
            lastLoadedDescriptionRef.current = fresh.description_avancement || ''
          }
        })
        .catch(() => {})
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [id, descriptionFocused])

  async function patchNow(patch: Record<string, unknown>) {
    try {
      const res = await api.patch(`/engagements/${id}`, patch)
      applyEngagement(res.data, { resetDrafts: false })
      return true
    } catch (err) {
      setError(apiErrorMessage(err, 'Sauvegarde impossible'))
      return false
    }
  }

  // État et météo : instantané, sans bouton "Enregistrer" (comme le reste
  // de la fiche devrait l'être — pas de brouillon à valider séparément).
  async function setEtat(code: string) {
    await patchNow({ etat_code: code })
  }
  async function setMeteo(code: string | null) {
    await patchNow({ meteo_code: code })
  }

  function onDescriptionChange(html: string) {
    setDescription(html)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (html === lastLoadedDescriptionRef.current) return
      setSaving(true)
      const ok = await patchNow({ description_avancement: html })
      setSaving(false)
      if (ok) lastLoadedDescriptionRef.current = html
    }, DEBOUNCE_MS)
  }

  async function saveDescriptionNow() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (description === lastLoadedDescriptionRef.current) return
    setSaving(true)
    const ok = await patchNow({ description_avancement: description })
    setSaving(false)
    if (ok) lastLoadedDescriptionRef.current = description
  }

  async function togglePrioritaire() {
    if (!engagement) return
    try {
      const res = await api.patch(`/engagements/${id}/prioritaire`, {
        prioritaire: !engagement.prioritaire_plenaire,
        note: prioNote,
      })
      applyEngagement(res.data, { resetDrafts: false })
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de mettre à jour le marquage prioritaire'))
    }
  }

  async function savePrioNote() {
    if (!engagement?.prioritaire_plenaire) return
    await patchNow({ prioritaire: true, note: prioNote }).catch(() => {})
    try {
      const res = await api.patch(`/engagements/${id}/prioritaire`, { prioritaire: true, note: prioNote })
      applyEngagement(res.data, { resetDrafts: false })
    } catch (err) {
      setError(apiErrorMessage(err, 'Sauvegarde impossible'))
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault()
    if (!commentBody.trim()) return
    try {
      await api.post(`/engagements/${id}/comments`, { body: commentBody })
      setCommentBody('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible d'ajouter le commentaire"))
    }
  }

  if (!engagement) return <p className="p-8 text-center text-slate-500">Chargement…</p>

  const descriptionLock = lockFor('description_avancement')
  const infosBaseLock = lockFor('infos_de_base')

  return (
    <div className="space-y-6">
      <LiveUpdateFlash show={flash} />

      <Link to="/engagements" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-ville-blue">
        <ArrowLeft size={15} /> Retour à la liste
      </Link>

      <BaseInfoCard engagement={engagement} groupes={groupes} onSaved={load} lockHolder={infosBaseLock} />

      {/* Marquage prioritaire plénière */}
      <div className={`rounded-xl border p-5 ${engagement.prioritaire_plenaire ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Star size={16} className={engagement.prioritaire_plenaire ? 'text-amber-500' : 'text-slate-400'} fill={engagement.prioritaire_plenaire ? 'currentColor' : 'none'} />
            <span className="text-sm font-medium text-slate-800">À porter en plénière (max. 3 par groupe)</span>
          </div>
          <button
            onClick={togglePrioritaire}
            disabled={!engagement.groupe_id}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              engagement.prioritaire_plenaire
                ? 'bg-white text-amber-700 ring-1 ring-amber-300 hover:bg-amber-100'
                : 'bg-ville-blue text-white hover:opacity-90'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {engagement.prioritaire_plenaire ? 'Retirer' : 'Marquer prioritaire'}
          </button>
        </div>
        {!engagement.groupe_id && (
          <p className="mt-2 text-xs text-slate-500">Cet engagement est hors groupe : il ne peut pas être porté en plénière.</p>
        )}
        {engagement.prioritaire_plenaire && (
          <div className="mt-3">
            <textarea
              value={prioNote}
              onChange={(e) => setPrioNote(e.target.value)}
              onBlur={savePrioNote}
              placeholder="Pourquoi ce sujet mérite une discussion élargie en plénière ?"
              rows={2}
              className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Fiche d'avancement — tout est instantané, plus de brouillon à valider */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Point d'avancement</h2>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">État d'avancement</label>
              <select
                value={engagement.etat_code}
                onChange={(e) => setEtat(e.target.value)}
                className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
              >
                {etats.map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.libelle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Météo</label>
              <MeteoPicker meteos={meteos} value={engagement.meteo_code} onChange={setMeteo} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-500">Description — point atteint</label>
              {descriptionLock && <EditingBadge displayName={descriptionLock.display_name} />}
              {saving && <span className="text-xs text-slate-400">Enregistrement…</span>}
            </div>
            {descriptionLock && (
              <p className="mb-1.5 text-xs text-amber-700">
                {descriptionLock.display_name} modifie déjà ce champ — lecture seule le temps qu'iel termine.
              </p>
            )}
            <RichTextEditor
              value={description}
              onChange={onDescriptionChange}
              onFocus={() => setDescriptionFocused(true)}
              onBlur={() => {
                setDescriptionFocused(false)
                saveDescriptionNow()
              }}
              engagementId={engagement.id}
              readOnly={!!descriptionLock}
            />
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {engagement.updated_by && (
          <p className="mt-3 text-xs text-slate-400">
            Dernière modification par {engagement.updated_by} le{' '}
            {new Date(engagement.updated_at).toLocaleString('fr-FR')}
          </p>
        )}
      </div>

      <RolesSection engagementId={engagement.id} roles={engagement.roles || []} onChange={load} />

      <StepsTimeline engagementId={engagement.id} steps={engagement.steps || []} onChange={load} />

      <AttachmentsSection engagementId={engagement.id} attachments={engagement.attachments || []} onChange={load} />

      {/* Commentaires */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MessageSquare size={16} /> Échanges ({engagement.comments?.length || 0})
        </h2>
        <div className="mb-4 space-y-3">
          {engagement.comments?.map((c) => (
            <CommentItem key={c.id} comment={c} canEdit={!!c.author_sub && c.author_sub === user?.sub} onChanged={load} />
          ))}
          {!engagement.comments?.length && <p className="text-sm text-slate-400">Aucun échange pour l'instant.</p>}
        </div>
        <form onSubmit={submitComment} className="flex items-start gap-2">
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder={`Écrire un commentaire en tant que ${user?.displayName}...`}
            rows={2}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-ville-blue p-2.5 text-white hover:opacity-90">
            <Send size={16} />
          </button>
        </form>
      </div>

      {/* Historique */}
      {user?.role === 'admin' && !!engagement.history?.length && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Clock size={16} /> Historique des modifications
          </h2>
          <ul className="space-y-2 text-sm">
            {engagement.history.map((h) => (
              <li key={h.id} className="border-b border-slate-50 pb-2 last:border-0">
                <span className="text-slate-500">
                  {new Date(h.changed_at).toLocaleString('fr-FR')} · {h.changed_by || 'inconnu'}
                </span>{' '}
                a modifié <span className="font-medium">{fieldLabel(h.champ)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Carte d'en-tête : infos de base, en lecture par défaut, éditables via le bouton crayon. */
function BaseInfoCard({
  engagement,
  groupes,
  onSaved,
  lockHolder,
}: {
  engagement: Engagement
  groupes: Groupe[]
  onSaved: () => void
  lockHolder: { display_name: string } | null
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    contenu: engagement.contenu,
    axe: engagement.axe,
    groupe_id: engagement.groupe_id,
    pilotage: engagement.pilotage || '',
    contribution_elaboration: engagement.contribution_elaboration || '',
    contribution_impactees: engagement.contribution_impactees || '',
    echeance: engagement.echeance || '',
    continu: engagement.continu,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { user } = useAuth()

  const conflict = useFieldLock(engagement.id, 'infos_de_base', editing)
  const [togglingContinu, setTogglingContinu] = useState(false)
  const [echeanceDraft, setEcheanceDraft] = useState(engagement.echeance || '')
  const [savingEcheance, setSavingEcheance] = useState(false)

  useEffect(() => {
    setEcheanceDraft(engagement.echeance || '')
  }, [engagement.echeance])

  // Bascule instantanée, indépendante du formulaire d'édition verrouillé
  // (même logique que la météo/l'état : pas de brouillon à valider).
  async function toggleContinu() {
    setTogglingContinu(true)
    try {
      await api.patch(`/engagements/${engagement.id}`, { continu: !engagement.continu })
      onSaved()
    } catch {
      // silencieux : le prochain rafraîchissement live re-synchronisera l'affichage
    } finally {
      setTogglingContinu(false)
    }
  }

  // Échéance volontairement en texte libre (pas un sélecteur de date) : une
  // valeur vague ("2028", "T3 2030", "juin 2029"...) est aussi légitime
  // qu'une date précise. Sauvegarde au blur, sans bouton dédié — comme la
  // météo/l'état/le caractère continu.
  async function saveEcheance() {
    if (echeanceDraft === (engagement.echeance || '')) return
    setSavingEcheance(true)
    try {
      await api.patch(`/engagements/${engagement.id}`, { echeance: echeanceDraft })
      onSaved()
    } catch {
      setEcheanceDraft(engagement.echeance || '')
    } finally {
      setSavingEcheance(false)
    }
  }

  function startEditing() {
    setForm({
      contenu: engagement.contenu,
      axe: engagement.axe,
      groupe_id: engagement.groupe_id,
      pilotage: engagement.pilotage || '',
      contribution_elaboration: engagement.contribution_elaboration || '',
      contribution_impactees: engagement.contribution_impactees || '',
      echeance: engagement.echeance || '',
      continu: engagement.continu,
    })
    setError(null)
    setEditing(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await api.patch(`/engagements/${engagement.id}`, form)
      const proposalsCreated: FieldProposal[] = res.data.proposalsCreated || []
      setEditing(false)
      onSaved()
      if (proposalsCreated.length) {
        setNotice(
          `${proposalsCreated.length > 1 ? 'Propositions envoyées' : 'Proposition envoyée'} (pilotage/contributions) — ` +
            `en attente de validation par un administrateur.`
        )
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Sauvegarde impossible'))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {notice && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>
        )}
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Engagement n°{engagement.numero}</p>
            <h1 className="mt-1 text-lg font-semibold text-slate-900">{engagement.contenu}</h1>
            <AxeTag axe={engagement.axe} className="mt-2" />
          </div>
          <div className="flex items-center gap-2">
            {lockHolder && <EditingBadge displayName={lockHolder.display_name} />}
            <EtatBadge libelle={engagement.etat_libelle} couleur={engagement.etat_couleur} />
            <button
              onClick={startEditing}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ville-blue"
              title="Modifier les infos de base"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          <Info
            label="Pilotage"
            value={engagement.pilotage}
            proposal={engagement.fieldProposals?.find((p) => p.champ === 'pilotage')}
          />
          <Info
            label="Contribution — élaboration du projet"
            value={engagement.contribution_elaboration}
            proposal={engagement.fieldProposals?.find((p) => p.champ === 'contribution_elaboration')}
          />
          <Info
            label="Contribution — directions/fonctions impactées"
            value={engagement.contribution_impactees}
            proposal={engagement.fieldProposals?.find((p) => p.champ === 'contribution_impactees')}
          />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Échéance</p>
            {engagement.continu ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-slate-700">
                <InfinityIcon size={14} className="text-ville-blue" /> Tout au long du mandat
              </p>
            ) : (
              <input
                value={echeanceDraft}
                onChange={(e) => setEcheanceDraft(e.target.value)}
                onBlur={saveEcheance}
                disabled={savingEcheance}
                placeholder="ex : 2028, T3 2030, juin 2029..."
                title="Une échéance vague (année, trimestre, mois) est tout à fait valable — pas besoin d'une date précise"
                className="mt-0.5 w-full rounded-md border border-transparent px-0 py-0.5 text-sm text-slate-700 hover:border-slate-200 focus:border-ville-blue focus:px-2 focus:py-1 focus:outline-none"
              />
            )}
            <div className="mt-1.5">
              <ToggleSwitch
                checked={engagement.continu}
                disabled={togglingContinu}
                onChange={toggleContinu}
                label="Engagement continu, tout au long du mandat (pas de date d'aboutissement)"
              />
            </div>
          </div>
          <Info label="Groupe de travail" value={engagement.groupe_code ? `${engagement.groupe_code} — ${engagement.groupe_nom}` : 'Hors groupe'} />
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-ville-blue/40 bg-white p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Engagement n°{engagement.numero} — infos de base
        </p>
        <button type="button" onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-700">
          <X size={16} />
        </button>
      </div>

      {conflict && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">
          {conflict.display_name} modifie déjà les infos de base de cet engagement — attends qu'iel termine avant
          d'enregistrer, pour ne pas écraser son travail.
        </p>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Nom de l'engagement</label>
        <input
          value={form.contenu}
          onChange={(e) => setForm({ ...form, contenu: e.target.value })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Axe du projet</label>
          <select
            value={form.axe}
            onChange={(e) => setForm({ ...form, axe: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          >
            {axeList().map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Groupe de travail</label>
          <select
            value={form.groupe_id ?? ''}
            onChange={(e) => setForm({ ...form, groupe_id: e.target.value ? Number(e.target.value) : null })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          >
            <option value="">Hors groupe</option>
            {groupes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} — {g.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Pilotage {user?.role !== 'admin' && <span className="font-normal text-amber-600">(soumis à validation)</span>}
          </label>
          <input
            value={form.pilotage}
            onChange={(e) => setForm({ ...form, pilotage: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Contribution — élaboration du projet{' '}
            {user?.role !== 'admin' && <span className="font-normal text-amber-600">(soumis à validation)</span>}
          </label>
          <input
            value={form.contribution_elaboration}
            onChange={(e) => setForm({ ...form, contribution_elaboration: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Contribution — directions/fonctions impactées{' '}
            {user?.role !== 'admin' && <span className="font-normal text-amber-600">(soumis à validation)</span>}
          </label>
          <input
            value={form.contribution_impactees}
            onChange={(e) => setForm({ ...form, contribution_impactees: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-ville-blue focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !!conflict}
          className="rounded-md bg-ville-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}

/** Un commentaire, éditable en place par son auteur (identifié par
 * author_sub — les commentaires antérieurs à cette fonctionnalité n'ont pas
 * cet identifiant et restent donc non modifiables). */
function CommentItem({
  comment,
  canEdit,
  onChanged,
}: {
  comment: Comment
  canEdit: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setDraft(comment.body)
    setError(null)
    setEditing(true)
  }

  async function save() {
    if (!draft.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/comments/${comment.id}`, { body: draft.trim() })
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(apiErrorMessage(err, 'Modification impossible'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-800">
          {comment.author_name} {comment.author_direction && <span className="text-slate-400">· {comment.author_direction}</span>}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-slate-400">
            {new Date(comment.created_at).toLocaleString('fr-FR')}
            {comment.edited_at && ' (modifié)'}
          </span>
          {canEdit && !editing && (
            <button onClick={startEditing} title="Modifier ce commentaire" className="text-slate-400 hover:text-ville-blue">
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-ville-blue focus:outline-none"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !draft.trim()}
              className="rounded-md bg-ville-blue px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-white"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-slate-700">{comment.body}</p>
      )}
    </div>
  )
}

function Info({ label, value, proposal }: { label: string; value?: string | null; proposal?: FieldProposal }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-slate-700">{value || '—'}</p>
      {proposal && (
        <p
          className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700"
          title="En attente de validation par un administrateur"
        >
          Proposition de {proposal.proposed_by_name || 'un agent'} : « {proposal.valeur_proposee} »
        </p>
      )}
    </div>
  )
}
