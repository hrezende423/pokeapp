import { IconArrowLeft } from '@tabler/icons-react'
import { useMemo } from 'react'
import { NATURES_INTRODUCED_IN_GENERATION, naturesExistInGeneration } from '../../data'
import type { Nature } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexPageShell } from './DexPageShell'
import { natureEntries } from './entrySources'

/**
 * The 25 natures as a 5x5 matrix: rows are the raised stat, columns the lowered
 * one, and each cell is the single nature at that intersection.
 *
 * The five neutral natures are NOT placed from data. PokeAPI represents them as
 * increased_stat: null AND decreased_stat: null -- not as "raises and lowers the
 * same stat" -- so there is no intersection to compute and the diagonal is filled
 * by the conventional order instead (Hardy, Docile, Bashful, Quirky, Serious,
 * matching every published table). That is the one thing on this page that comes
 * from convention rather than the bundle, so it is stated rather than buried.
 *
 * No per-column or per-flavour colour: eight new semantic colours would be eight
 * more than this system sanctions. The diagonal is marked by a tone-step and
 * italics, which is the same "different/inert" signal used elsewhere.
 */

const STATS = ['attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const
type StatKey = (typeof STATS)[number]

const STAT_LABELS: Record<StatKey, string> = {
  attack: 'Attack',
  defense: 'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
}

/** Diagonal order, by convention -- see the note above. */
const NEUTRAL_ORDER = ['hardy', 'docile', 'bashful', 'quirky', 'serious'] as const

const titleCase = (value: string | null) =>
  value ? value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null

const isNeutral = (n: Nature) => n.increased_stat == null || n.decreased_stat == null

function NatureMatrix({
  natures,
  onSelect,
}: {
  natures: Nature[]
  onSelect: (id: number) => void
}) {
  const cells = useMemo(() => {
    const byPair = new Map<string, Nature>()
    for (const n of natures) {
      if (isNeutral(n)) continue
      byPair.set(`${n.increased_stat}|${n.decreased_stat}`, n)
    }
    const neutrals = NEUTRAL_ORDER.map((name) => natures.find((n) => n.name === name))
    return STATS.map((up, rowIndex) =>
      STATS.map((down) =>
        up === down
          ? { nature: neutrals[rowIndex], neutral: true }
          : { nature: byPair.get(`${up}|${down}`), neutral: false },
      ),
    )
  }, [natures])

  return (
    <div className="nature-matrix-wrap">
      <table className="nature-matrix" data-testid="naturedex-rows" data-matrix="true">
        <caption className="nature-matrix-caption">
          Rows raise the stat, columns lower it. The diagonal is the five natures with no net
          effect.
        </caption>
        <thead>
          <tr>
            <td />
            {STATS.map((down) => (
              <th key={down} scope="col" data-testid={`naturedex-col-${down}`}>
                <span className="nature-matrix-axis">lowers</span>
                {STAT_LABELS[down]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STATS.map((up, rowIndex) => (
            <tr key={up}>
              <th scope="row" data-testid={`naturedex-axis-${up}`}>
                <span className="nature-matrix-axis">raises</span>
                {STAT_LABELS[up]}
              </th>
              {cells[rowIndex].map((cell, colIndex) => {
                const nature = cell.nature
                if (!nature) {
                  return (
                    <td key={STATS[colIndex]} className="nature-cell nature-cell-missing">
                      —
                    </td>
                  )
                }
                return (
                  <td
                    key={STATS[colIndex]}
                    className={cell.neutral ? 'nature-cell nature-cell-neutral' : 'nature-cell'}
                    data-neutral={cell.neutral}
                  >
                    <button
                      type="button"
                      className="nature-cell-btn"
                      data-testid={`naturedex-row-${nature.id}`}
                      data-entry-id={nature.id}
                      onClick={() => onSelect(nature.id)}
                    >
                      {nature.display_name}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NatureDetail({ nature, onBack }: { nature: Nature; onBack: () => void }) {
  const neutral = isNeutral(nature)
  const up = nature.increased_stat as StatKey | null
  const down = nature.decreased_stat as StatKey | null

  return (
    <div className="entity-detail" data-testid="naturedex-detail" data-entry-id={nature.id}>
      <div className="pokedex-back-row">
        <button type="button" className="pokedex-back" data-testid="entity-back" onClick={onBack}>
          <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
          All natures
        </button>
      </div>

      <h2 className="entity-detail-name" data-testid="naturedex-name">
        {nature.display_name}
      </h2>
      <p className="entity-detail-meta" data-testid="naturedex-summary">
        {neutral
          ? 'Neutral — no stat change'
          : `+10% ${STAT_LABELS[up as StatKey]}, −10% ${STAT_LABELS[down as StatKey]}`}
      </p>

      <ul className="stats entity-detail-facts" data-testid="naturedex-stat-pair">
        <li>
          <span>increases</span>
          <strong className="stat-up" data-testid="naturedex-increased">
            {neutral ? '—' : `${STAT_LABELS[up as StatKey]} +10%`}
          </strong>
        </li>
        <li>
          <span>decreases</span>
          <strong className="stat-down" data-testid="naturedex-decreased">
            {neutral ? '—' : `${STAT_LABELS[down as StatKey]} −10%`}
          </strong>
        </li>
      </ul>

      {/*
        The five neutral natures have likes_flavor and hates_flavor null in the
        bundle, not a flavour pair -- so there is no preference text to show and
        none is invented.
      */}
      <p
        className="entity-detail-desc"
        data-testid={neutral ? 'naturedex-neutral' : 'naturedex-flavor'}
      >
        {neutral
          ? 'This nature has no flavour preference: it neither likes nor dislikes any flavour.'
          : `Likes ${titleCase(nature.likes_flavor)}-flavored food, dislikes ${titleCase(
              nature.hates_flavor,
            )}-flavored food.`}
      </p>
    </div>
  )
}

export function Naturedex() {
  const { generation, isAll } = useVersionGroup()

  // Gated as one rule, not per entry: all 25 natures arrived together in Gen 3
  // and none has been added or removed since, so there is no per-entry signal to
  // consult and inventing one would be fiction.
  const available = isAll || naturesExistInGeneration(generation)
  const entries = useMemo(() => natureEntries({ generation, isAll }), [generation, isAll])

  return (
    <DexPageShell
      dexId="naturedex"
      entries={entries}
      entryId={(nature) => nature.id}
      searchText={(nature) => nature.display_name}
      note={
        available
          ? `All ${entries.length} natures${isAll ? '' : ` (Generation ${generation})`}`
          : `Natures did not exist in Generation ${generation}`
      }
      gatedMessage={
        available
          ? undefined
          : `Natures did not exist in Generation ${generation}. They were introduced in Generation ${NATURES_INTRODUCED_IN_GENERATION} — pick a Generation ${NATURES_INTRODUCED_IN_GENERATION}+ game to browse them.`
      }
      list={({ entries: visible, onSelect }) => (
        <NatureMatrix natures={visible} onSelect={onSelect} />
      )}
      detail={({ entry, onBack }) => <NatureDetail nature={entry} onBack={onBack} />}
    />
  )
}
