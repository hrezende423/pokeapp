import { IconArrowLeft, IconArrowNarrowDown, IconArrowNarrowUp } from '@tabler/icons-react'
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
 *
 * DIRECTION IS AN ARROW, NOT A WORD. The axis headers and the detail page used to
 * spell out "raises" / "lowers" / "increases" / "decreases"; they now carry an
 * arrow after the stat name instead, red up for the raised stat and blue down for
 * the lowered one. Two new tokens back this -- --stat-increase and
 * --stat-decrease -- rather than --accent, whose three sanctioned uses do not
 * include stat direction. The arrows are aria-hidden and every one is paired with
 * a text alternative, because a colour-plus-glyph pair carrying the only copy of
 * "which way" would be unreadable to a screen reader and to anyone who cannot
 * separate the two hues.
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

/**
 * A stat name with its direction arrow after it.
 *
 * The visually-hidden word is the accessible half of the pair: the arrow itself
 * is aria-hidden, so without it the direction would live only in a glyph and a
 * colour.
 */
function StatDirection({ label, direction }: { label: string; direction: 'up' | 'down' }) {
  const Arrow = direction === 'up' ? IconArrowNarrowUp : IconArrowNarrowDown
  return (
    <span className="stat-direction" data-direction={direction}>
      {label}
      <span className="visually-hidden">{direction === 'up' ? ' raised' : ' lowered'}</span>
      <Arrow
        className={direction === 'up' ? 'stat-arrow stat-arrow-up' : 'stat-arrow stat-arrow-down'}
        size={16}
        stroke={2}
        aria-hidden
        focusable="false"
      />
    </span>
  )
}

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
        {/* The caption is gone with the rest of this pass's descriptive text --
            "rows raise the stat, columns lower it" is now said by the arrows in
            the headers themselves. A visually-hidden caption stays, because a
            table read linearly cannot see them. */}
        <caption className="visually-hidden">
          Natures by stat. Row headers are the raised stat, column headers the lowered stat; the
          diagonal holds the five natures with no net effect.
        </caption>
        <thead>
          <tr>
            <td />
            {STATS.map((down) => (
              <th key={down} scope="col" data-testid={`naturedex-col-${down}`}>
                <StatDirection label={STAT_LABELS[down]} direction="down" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STATS.map((up, rowIndex) => (
            <tr key={up}>
              <th scope="row" data-testid={`naturedex-axis-${up}`}>
                <StatDirection label={STAT_LABELS[up]} direction="up" />
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
        {neutral ? (
          'Neutral — no stat change'
        ) : (
          <>
            <span className="num">+10%</span> {STAT_LABELS[up as StatKey]},{' '}
            <span className="num">−10%</span> {STAT_LABELS[down as StatKey]}
          </>
        )}
      </p>

      {/* No "increases" / "decreases" labels: the arrow after each stat name is
          the label now, so the row is the stat and its direction and nothing
          else. */}
      <ul className="nature-stat-pair" data-testid="naturedex-stat-pair">
        <li data-testid="naturedex-increased">
          {neutral ? (
            '—'
          ) : (
            <>
              <StatDirection label={STAT_LABELS[up as StatKey]} direction="up" />
              <span className="num nature-stat-delta">+10%</span>
            </>
          )}
        </li>
        <li data-testid="naturedex-decreased">
          {neutral ? (
            '—'
          ) : (
            <>
              <StatDirection label={STAT_LABELS[down as StatKey]} direction="down" />
              <span className="num nature-stat-delta">−10%</span>
            </>
          )}
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
      searchLabel="Search/filter natures"
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
