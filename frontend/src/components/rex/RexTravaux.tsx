import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Fan, Plus, Snowflake, Sun } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { formatDay } from '../../lib/rex'
import type { RexTravail } from '../../types.rex'
import { Field, Modal, Pill, btnGhost, btnPrimary, inputCls } from './shared'

function etat(t: RexTravail): { label: string; className: string } {
  const today = new Date().toLocaleDateString('sv-SE')
  if (t.date_realisation) {
    return t.date_realisation <= today
      ? { label: 'Réalisé', className: 'bg-green-100 text-green-800' }
      : { label: 'Prévu', className: 'bg-blue-100 text-blue-800' }
  }
  if ((t.date_texte || '').toLowerCase().includes('attente')) return { label: 'En attente', className: 'bg-amber-100 text-amber-800' }
  return { label: 'Date à confirmer', className: 'bg-slate-100 text-slate-600' }
}

export default function RexTravaux({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [rows, setRows] = useState<RexTravail[]>([])
  const [saison, setSaison] = useState<'ete' | 'hiver'>('ete')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    api.get('/rex/travaux').then((r) => setRows(r.data))
  }, [version])

  const list = rows.filter((r) => r.saison === saison)
  const groups = useMemo(() => {
    const m = new Map<string, RexTravail[]>()
    for (const r of list) m.set(r.categorie || 'Autres', [...(m.get(r.categorie || 'Autres') || []), r])
    return [...m.entries()]
  }, [list])
  const brasseurs = list.reduce((n, r) => n + r.nb_brasseurs, 0)
  const ventilateurs = list.reduce((n, r) => n + r.nb_ventilateurs, 0)
  const realises = list.filter((r) => etat(r).label === 'Réalisé').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-600">
          Les travaux de confort réalisés en 2026 et prévus au premier semestre 2027 : le socle matériel sur lequel s'appuient les réflexes. Tenez-le à jour
          pour les équipements de votre direction.
        </p>
        <button onClick={() => setAdding(true)} className={btnPrimary}>
          <Plus size={16} /> Ajouter des travaux
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(['ete', 'hiver'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSaison(s)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${saison === s ? 'bg-ville-blue text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {s === 'ete' ? <Sun size={15} /> : <Snowflake size={15} />}
              Confort d'{s === 'ete' ? 'été' : 'hiver'}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">
          {list.length} interventions · {realises} réalisées
        </span>
        {saison === 'ete' && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2.5 py-1 text-sm font-medium text-sky-900">
            <Fan size={15} /> {brasseurs} brasseurs d'air · {ventilateurs} ventilateurs installés
          </span>
        )}
      </div>

      <div className="space-y-5">
        {groups.map(([cat, items]) => (
          <section key={cat}>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-800">{cat}</h3>
            <div className="scroll-x rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Équipement</th>
                    <th className="px-3 py-2 font-medium">Nature des travaux</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">État</th>
                    <th className="px-3 py-2 font-medium">Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => {
                    const e = etat(t)
                    return (
                      <tr key={t.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 font-medium text-slate-900">{t.equipement}</td>
                        <td className="px-3 py-2 text-slate-700">{t.nature}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{t.date_realisation ? formatDay(t.date_realisation) : t.date_texte || '—'}</td>
                        <td className="px-3 py-2">
                          <Pill className={e.className}>{e.label}</Pill>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{t.observations}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {!groups.length && <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Aucun travaux saisi pour cette saison.</p>}
      </div>

      {adding && (
        <AddTravail
          saison={saison}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function AddTravail({ saison, onClose, onSaved }: { saison: 'ete' | 'hiver'; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const [v, setV] = useState({ saison, categorie: '', equipement: '', nature: '', date_realisation: '', date_texte: '', nb_brasseurs: 0, nb_ventilateurs: 0, observations: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api.post('/rex/travaux', { ...v, date_realisation: v.date_realisation || null })
      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }
  return (
    <Modal title="Ajouter des travaux" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Saison">
            <select value={v.saison} onChange={set('saison')} className={inputCls}>
              <option value="ete">Confort d'été</option>
              <option value="hiver">Confort d'hiver</option>
            </select>
          </Field>
          <Field label="Catégorie" hint="Ex. Groupes scolaires, Autres équipements publics">
            <input value={v.categorie} onChange={set('categorie')} className={inputCls} />
          </Field>
          <Field label="Équipement">
            <input autoFocus required value={v.equipement} onChange={set('equipement')} className={inputCls} />
          </Field>
          <Field label="Nature des travaux">
            <input required value={v.nature} onChange={set('nature')} className={inputCls} />
          </Field>
          <Field label="Date de réalisation / fin">
            <input type="date" value={v.date_realisation} onChange={set('date_realisation')} className={inputCls} />
          </Field>
          <Field label="… ou précision en texte" hint="Ex. « été 2026 », « En attente »">
            <input value={v.date_texte} onChange={set('date_texte')} className={inputCls} />
          </Field>
          <Field label="Brasseurs d'air posés">
            <input type="number" min={0} value={v.nb_brasseurs} onChange={set('nb_brasseurs')} className={inputCls} />
          </Field>
          <Field label="Ventilateurs">
            <input type="number" min={0} value={v.nb_ventilateurs} onChange={set('nb_ventilateurs')} className={inputCls} />
          </Field>
        </div>
        <Field label="Observations">
          <textarea value={v.observations} onChange={set('observations')} rows={2} className={inputCls} />
        </Field>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary}>
            Enregistrer
          </button>
          <button type="button" onClick={onClose} className={btnGhost}>
            Annuler
          </button>
        </div>
        <p className="text-xs text-slate-400">Saisi par {user?.displayName}.</p>
      </form>
    </Modal>
  )
}
