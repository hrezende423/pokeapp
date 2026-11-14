import { IconSquare, IconSquareCheck } from '@tabler/icons-react'
import { Fragment, useMemo, useState } from 'react'
import type { FrontierData, FrontierSet, FrontierTrainer } from './data'
import { itemName, moveNames, natureName, speciesName } from './names'
import { Evs, MonCell, Muted } from './parts'
import { StreakLookup, type StreakLookupInput } from './StreakLookup'

/**
 * Sets & Trainers: the 882 sets, the 300 trainers, and the Streak lookup, as
 * three views of one screen. Switching view or opening a trainer is module-local
 * state, never a back-stack step. The wording is the approved mockup's
 * (frontier-sets.html).
 */
type View = 'sets' | 'trainers' | 'lookup'

export function SetsTrainers({ data, lookup }: { data: FrontierData; lookup?: StreakLookupInput }) {
  const [view, setView] = useState<View>(lookup ? 'lookup' : 'sets')
  const tabs: { id: View; label: string; count?: number }[] = [
    { id: 'sets', label: 'Sets', count: data.sets().length },
    { id: 'trainers', label: 'Trainers', count: data.trainers().length },
    { id: 'lookup', label: 'Streak lookup' },
  ]
  return (
    <div className="bf-stack bf-sets-body" data-layout={view === 'trainers' ? 'trainers-body' : 'sets-body'}>
      <div className="bf-vtabs" role="tablist" data-layout="sets-views" style={{ gridArea: 'views' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={view === t.id}
            data-testid={`frontier-view-${t.id}`}
            onClick={() => setView(t.id)}
          >
            {t.label}
            {t.count != null && (
              <>
                {' '}
                <span className="bf-mono bf-muted">{t.count}</span>
              </>
            )}
          </button>
        ))}
      </div>
      <div style={{ gridArea: 'body' }} className="bf-view">
        {view === 'sets' && <SetsView data={data} />}
        {view === 'trainers' && <TrainersView data={data} />}
        {view === 'lookup' && <StreakLookup data={data} initial={lookup} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ sets */

function SetTable({ sets }: { sets: FrontierSet[] }) {
  return (
    <div className="bf-tw">
      <table className="bf-t bf-set-table">
        <thead>
          <tr>
            <th className="bf-r">#</th>
            <th>Pokémon</th>
            <th>Item</th>
            <th>Nature</th>
            <th>EVs</th>
            <th>Moves</th>
            <th>Level</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s) => (
            <tr key={s.index} data-set-index={s.index}>
              <td className="bf-r bf-mono">{s.index}</td>
              <td className="bf-nw">
                <MonCell speciesId={s.species_id} pokemonId={s.pokemon_id} />
              </td>
              <td className="bf-nw">{itemName(s.item_id)}</td>
              <td>{natureName(s.nature_id)}</td>
              <td className="bf-nw">
                <Evs evs={s.evs} />
              </td>
              <td>{moveNames(s.moves)}</td>
              <td className="bf-muted bf-nw">{s.openOnly ? 'Open Level only' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SetsView({ data }: { data: FrontierData }) {
  const [query, setQuery] = useState('')
  const [openOnly, setOpenOnly] = useState(false)
  /** What a set is searchable by: its species, the classes that draw it, its held item. */
  const haystack = useMemo(() => {
    const classes = new Map<number, Set<string>>()
    for (const t of data.trainers())
      for (const i of t.setIndices) {
        const set = classes.get(i) ?? new Set<string>()
        if (t.className) set.add(t.className)
        classes.set(i, set)
      }
    return data
      .sets()
      .map((s) =>
        [s.species_id != null ? speciesName(s.species_id) : '', itemName(s.item_id), ...(classes.get(s.index) ?? [])]
          .join('\n')
          .toLowerCase(),
      )
  }, [data])
  const q = query.trim().toLowerCase()
  const shown = data.sets().filter((s) => (!openOnly || s.openOnly) && (!q || haystack[s.index].includes(q)))

  return (
    <div className="bf-stack bf-sets-view">
      <div className="bf-three" data-layout="sets-controls" style={{ gridArea: 'controls' }}>
        <label className="bf-field" style={{ gridArea: 'a' }}>
          <span className="bf-cap">Search species, class or held item</span>
          <input
            className="bf-uf"
            placeholder="Search"
            data-testid="sets-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span style={{ gridArea: 'b', alignSelf: 'end' }}>
          <button
            className="bf-textfilter"
            type="button"
            aria-pressed={openOnly}
            data-testid="sets-open-only"
            onClick={() => setOpenOnly((v) => !v)}
          >
            {openOnly ? (
              <IconSquareCheck size={20} stroke={1.5} aria-hidden />
            ) : (
              <IconSquare size={20} stroke={1.5} aria-hidden />
            )}
            Open Level only
          </button>
        </span>
      </div>
      <p className="bf-cap" data-layout="sets-count" data-testid="sets-count" style={{ gridArea: 'count' }}>
        {shown.length} sets
      </p>
      <div data-layout="sets-list" data-testid="sets-list" style={{ gridArea: 'list' }}>
        <SetTable sets={shown} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ trainers */

/**
 * A trainer id's IVs (GetFrontierTrainerFixedIvs), read off the loader's own
 * pools: every normal and Hard row's trainer-id slices together cover ids 0-299.
 */
function trainerIvs(data: FrontierData): Map<number, number> {
  const out = new Map<number, number>()
  for (let c = 0; c < 8; c++)
    for (const battle of [0, 6]) {
      const pool = data.trainerPoolForStreak({ facility: 'tower', levelMode: 'lv50', streak: c * 7 + battle })
      for (const s of pool.ivBand.byTrainerId ?? []) for (let id = s.from; id <= s.to; id++) out.set(id, s.iv)
    }
  return out
}

function TrainersView({ data }: { data: FrontierData }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const ivs = useMemo(() => trainerIvs(data), [data])
  const q = query.trim().toLowerCase()
  const shown = data
    .trainers()
    .filter((t) => !q || `${t.className ?? ''}\n${t.name ?? ''}`.toLowerCase().includes(q))

  return (
    <div className="bf-stack bf-trainers-view">
      <label className="bf-field" data-layout="trainers-search" style={{ gridArea: 'search' }}>
        <span className="bf-cap">Search class or name</span>
        <input
          className="bf-uf"
          placeholder="Search"
          data-testid="trainers-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div data-layout="trainers-list" data-testid="trainers-list" style={{ gridArea: 'list' }}>
        <div className="bf-tw">
          <table className="bf-t">
            <thead>
              <tr>
                <th className="bf-r">ID</th>
                <th>Class</th>
                <th>Name</th>
                <th className="bf-r">IVs</th>
                <th className="bf-r">Sets</th>
                <th>Species</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <TrainerRow
                  key={t.id}
                  t={t}
                  data={data}
                  iv={ivs.get(t.id)}
                  open={open === t.id}
                  onToggle={() => setOpen((cur) => (cur === t.id ? null : t.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function TrainerRow({
  t,
  data,
  iv,
  open,
  onToggle,
}: {
  t: FrontierTrainer
  data: FrontierData
  iv: number | undefined
  open: boolean
  onToggle: () => void
}) {
  const sets = t.setIndices.map((i) => data.sets()[i])
  const species = [...new Set(sets.map((s) => s.species_id).filter((id): id is number => id != null))]
  return (
    <Fragment>
      <tr className="bf-trainer-row" data-trainer-id={t.id} onClick={onToggle}>
        <td className="bf-r bf-mono">{t.id}</td>
        <td className="bf-nw">{t.className}</td>
        <td className="bf-nw">
          <button
            type="button"
            className="bf-link"
            aria-expanded={open}
            data-testid={`trainer-open-${t.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {t.name}
          </button>
        </td>
        <td className="bf-r bf-mono">{iv}</td>
        <td className="bf-r bf-mono">{sets.length}</td>
        <td>
          {species
            .slice(0, 8)
            .map((id) => speciesName(id))
            .join(', ')}
          {species.length > 8 && (
            <>
              {' '}
              <Muted>+{species.length - 8}</Muted>
            </>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bf-trainer-sets" data-testid={`trainer-sets-${t.id}`}>
          <td />
          <td colSpan={5}>
            <p className="bf-cap">
              {t.name}’s {sets.length} sets ({sets.filter((s) => s.openOnly).length} Open Level only)
            </p>
            <SetTable sets={sets} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}
