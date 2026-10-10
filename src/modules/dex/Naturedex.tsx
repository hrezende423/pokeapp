import { IconArrowNarrowDown, IconArrowNarrowUp } from '@tabler/icons-react'
import { useMemo } from 'react'
import { NATURES_INTRODUCED_IN_GENERATION, naturesExistInGeneration } from '../../data'
import type { Nature } from '../../data'
import { KeyValueList } from '../../components/ds/KeyValueList'
import { useVersionGroup } from '../version-group/context'
import { DexPageShell } from './DexPageShell'
import { EditorialBack, EditorialGroup, EditorialHead, EditorialPage } from './EditorialDetail'
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
 * more than this system sanctions. The diagonal is marked by italics and muted
 * ink alone -- the "different/inert" signal -- not by a fill.
 *
 * NO GRIDLINES (owner, 2026-10-10). The matrix is drawn by alignment and space:
 * every cell is the same width and left-aligned, so the columns read as columns
 * without a rule between them, and the row header is set apart by its muted ink
 * rather than by a vertical line.
 *
 * DIRECTION IS AN ARROW, NOT A WORD, in the axis headers: the arrow after the
 * stat name, in --color-status-up / --color-status-down (PRINCIPLES.md: stat
 * deltas, always with a glyph). The arrows are aria-hidden and each is paired
 * with a visually-hidden word, because a colour-plus-glyph pair carrying the
 * only copy of "which way" would be unreadable to a screen reader. The detail
 * page states its delta as text instead -- see StatDelta.
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
                      // Read by CSS to reserve the semibold width, so hover can
                      // change weight without shifting the column.
                      data-label={nature.display_name}
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

/** Short stat names for the ghost, where the full label would not fit at 108px. */
const STAT_SHORT: Record<StatKey, string> = {
  attack: 'Atk',
  defense: 'Def',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
}

/**
 * One stat change as real text: the direction glyph, the stat, the amount.
 *
 * The glyph is TEXT, not an icon, so a screen reader announces it ("up arrow
 * Attack plus 10 percent") and a reader who cannot tell the two hues apart still
 * has the arrow and the sign. Colour reinforces it -- --color-status-up/down,
 * which is what PRINCIPLES.md gives stat deltas -- and is never the only copy.
 */
function StatDelta({
  stat,
  direction,
  testId,
}: {
  stat: StatKey
  direction: 'up' | 'down'
  testId: string
}) {
  return (
    <span className="dex-ed-delta" data-direction={direction} data-testid={testId}>
      <span className="dex-ed-delta-glyph">{direction === 'up' ? '↑' : '↓'}</span>{' '}
      <span className="dex-ed-delta-stat">{STAT_LABELS[stat]}</span>{' '}
      <span className="num nature-stat-delta">{direction === 'up' ? '+10%' : '−10%'}</span>
    </span>
  )
}

/**
 * One nature's page, on the editorial structure (EditorialDetail.tsx).
 *
 * THE STAT DELTA IS THE GHOST, rendered huge -- "+Atk / −SpA" on two lines --
 * because the delta is the whole of what a nature is. The ghost is decoration,
 * so the same fact is stated beside it as text (StatDelta above). A neutral
 * nature's delta is nothing, and its ghost says so: ±0.
 */
function NatureDetail({ nature, onBack }: { nature: Nature; onBack: () => void }) {
  const neutral = isNeutral(nature)
  const up = nature.increased_stat as StatKey | null
  const down = nature.decreased_stat as StatKey | null

  return (
    <EditorialPage testId="naturedex-detail" entryId={nature.id}>
      <EditorialBack label="All natures" onBack={onBack} />
      <EditorialHead
        title={nature.display_name}
        titleTestId="naturedex-name"
        identityTestId="naturedex-summary"
        identity={
          neutral || !up || !down ? (
            <span className="dex-ed-caps">Neutral — no stat change</span>
          ) : (
            <>
              <StatDelta stat={up} direction="up" testId="naturedex-increased" />
              <span className="dex-ed-sep" aria-hidden>
                ·
              </span>
              <StatDelta stat={down} direction="down" testId="naturedex-decreased" />
            </>
          )
        }
        ghost={neutral || !up || !down ? '±0' : `+${STAT_SHORT[up]}\n−${STAT_SHORT[down]}`}
      />

      {/*
        The five neutral natures have likes_flavor and hates_flavor null in the
        bundle, not a flavour pair -- so there is no preference to list and none
        is invented.
      */}
      <EditorialGroup label="Flavour">
        {neutral ? (
          <p className="dex-ed-note" data-testid="naturedex-neutral">
            This nature has no flavour preference: it neither likes nor dislikes any flavour.
          </p>
        ) : (
          <KeyValueList
            testId="naturedex-flavor"
            items={[
              { label: 'Likes', value: titleCase(nature.likes_flavor) ?? '—' },
              { label: 'Dislikes', value: titleCase(nature.hates_flavor) ?? '—' },
            ]}
          />
        )}
      </EditorialGroup>
    </EditorialPage>
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
