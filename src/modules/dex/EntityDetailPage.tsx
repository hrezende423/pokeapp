import { IconArrowDown, IconArrowLeft, IconArrowUp } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { SpeciesCardGrid, type SpeciesCardEntry } from '../../components/SpeciesCardGrid'
import type { SpeciesCardFooter } from '../../components/speciesCardFooters'

/**
 * The detail page shared by the Movedex, the Abilitydex and the Breeding dex.
 *
 * All three answer the same shape of question -- here is one entity, here is what
 * it does, here are the species it applies to -- so all three render this. The
 * only thing that varies is whether the species are one grid or several labelled
 * sections, which is a prop.
 *
 * Sections with no entries are dropped before rendering, not rendered empty: a
 * move with no tutor in the selected generation shows no "Move tutor" heading at
 * all. That is why `sections` is filtered here rather than at each call site --
 * three call sites would be three chances to forget.
 *
 * TWO LAYOUTS. `stack` is the original single column, which the Breeding dex
 * keeps. `split` is the Abilitydex's and the Movedex's (owner, 2026-10-11): the
 * entity's info in a left column and the species grid in a right one, each
 * scrolling on its own, so the description stays on screen while the grid runs.
 * The grid column is exactly the grid's own width -- three 212px cards and two
 * 9px gaps -- so the cards are the size they were on the stacked page; the info
 * column takes a fixed width beside it and the pair is centred.
 */

export interface SpeciesSection {
  /** Small uppercase label, e.g. "Level up". Omit for a single unlabelled grid. */
  label?: string
  entries: SpeciesCardEntry[]
  /**
   * Makes the section re-orderable by a number of its own -- the Movedex's
   * level-up learners by level. The default order stays the national dex; see
   * SectionSort below. `what` names the number for the control's label.
   */
  sort?: { what: string; value: (entry: SpeciesCardEntry) => number | null }
}

type SortState = 'none' | 'asc' | 'desc'
const NEXT_SORT: Record<SortState, SortState> = { none: 'asc', asc: 'desc', desc: 'none' }

/**
 * A section's sort, as one arrow after its label (owner, 2026-10-11).
 *
 * Three states on one control, cycled by click: the national dex order (the
 * default, a faint down arrow that appears only while the pointer is over the
 * GRID column -- never the info column), ascending (a solid down arrow), then
 * descending (an up arrow), then back. A sorted section keeps its arrow on
 * screen, since an order the reader cannot see the cause of reads as a bug.
 */
function SectionSort({
  state,
  what,
  testId,
  onClick,
}: {
  state: SortState
  what: string
  testId: string
  onClick: () => void
}) {
  const Arrow = state === 'desc' ? IconArrowUp : IconArrowDown
  const label =
    state === 'none'
      ? `Sort by ${what}, lowest first`
      : state === 'asc'
        ? `Sorted by ${what}, lowest first. Sort highest first`
        : `Sorted by ${what}, highest first. Restore dex order`
  return (
    <button
      type="button"
      className="entity-section-sort"
      data-state={state}
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Arrow size={14} stroke={1.5} aria-hidden focusable="false" />
    </button>
  )
}

/**
 * The split page's skeleton on its own: an info column and a grid column, each
 * its own ScrollArea. EntityDetailPage renders it for the Abilitydex and the
 * Movedex; the Trainer Dex renders it directly, because its right column is a
 * party of trainer cards rather than a species grid (owner, 2026-10-11).
 */
export function SplitColumns({
  testId,
  entryId,
  info,
  grid,
  infoTestId,
  scrollKey,
  className,
}: {
  testId: string
  entryId: number
  info: ReactNode
  grid: ReactNode
  infoTestId?: string
  scrollKey?: (part: string) => string
  className?: string
}) {
  return (
    <div
      className={['entity-detail entity-split', className].filter(Boolean).join(' ')}
      data-testid={testId}
      data-entry-id={entryId}
    >
      <div className="entity-split-cols" data-layout="entity-split">
        <div className="entity-split-info">
          <ScrollArea testId={infoTestId} memoryKey={scrollKey?.('info')} hint={false}>
            <div className="entity-split-pad">{info}</div>
          </ScrollArea>
        </div>
        <div className="entity-split-grid">
          <ScrollArea testId={`${testId}-grid-scroll`} memoryKey={scrollKey?.('grid')}>
            <div className="entity-split-pad">{grid}</div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

export function EntityDetailPage({
  entryId,
  onBack,
  backLabel,
  title,
  titleTestId,
  meta,
  lead,
  description,
  sections,
  generation,
  onSelectSpecies,
  testId,
  footer,
  children,
  layout = 'stack',
  gridHeader,
  gridFooter,
  infoTestId,
  scrollKey,
}: {
  /**
   * The open entry's id, mirrored onto the root as data-entry-id. The lifted
   * selection is what makes "the search opened this, and it is still open"
   * observable, and reading it off the page is how that is checked.
   */
  entryId: number
  onBack: () => void
  backLabel: string
  title: string
  /**
   * Extra test id on the name, for a dex whose own suite addresses it by a
   * dex-specific id. "entity-name" is always present too, so a check that wants
   * "the shared template's name" and one that wants "the move's name" both work.
   */
  titleTestId?: string
  /** One line under the name: type, category, counts. */
  meta?: ReactNode
  /** A line between `meta` and the description -- the Movedex's "Introduced in". */
  lead?: ReactNode
  description?: ReactNode
  sections: SpeciesSection[]
  generation: number
  onSelectSpecies: (id: number) => void
  testId: string
  /**
   * Overrides the card's bottom line for every grid on this page. The Breeding
   * dex shows egg groups there instead of abilities.
   */
  footer?: SpeciesCardFooter
  /** Extra blocks between the description and the species grids. */
  children?: ReactNode
  layout?: 'stack' | 'split'
  /**
   * `split` only: blocks at the top of the GRID column -- a game row, a learner
   * count, a loading line. In `stack` they would simply follow `children`.
   */
  gridHeader?: ReactNode
  /** `split` only: blocks under the last grid -- a caption about what it omits. */
  gridFooter?: ReactNode
  /** `split` only: the info column scroller's test id. */
  infoTestId?: string
  /** `split` only: remembered-offset keys for the two scrollers (DexPageShell's). */
  scrollKey?: (part: string) => string
}) {
  const populated = sections.filter((s) => s.entries.length > 0)
  /* Per section label. The page is keyed by its entry, so a new move starts in
     dex order again. */
  const [sorts, setSorts] = useState<Record<string, SortState>>({})

  const ordered = (section: SpeciesSection, state: SortState) => {
    if (!section.sort || state === 'none') return section.entries
    const value = section.sort.value
    const sign = state === 'asc' ? 1 : -1
    // Ties -- several species learning it at one level -- stay in dex order.
    return section.entries.slice().sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1
      return (va - vb) * sign || a.species.id - b.species.id
    })
  }

  const grids = populated.map((section, i) => {
    const key = section.label ?? `section-${i}`
    const state = sorts[key] ?? 'none'
    return (
      <section
        key={section.label ?? `section-${i}`}
        className="entity-detail-section"
        data-testid={`entity-section-${slug(section.label ?? 'species')}`}
      >
        {/* Split: the count is its own line under the label, "23 species"
          (owner, 2026-10-11). Stacked pages keep it beside the label. */}
        {section.label &&
          (layout === 'split' ? (
            <>
              <h3 className="entity-detail-section-label">
                {section.label}
                {section.sort && (
                  <SectionSort
                    state={state}
                    what={section.sort.what}
                    testId={`entity-sort-${slug(section.label)}`}
                    onClick={() => setSorts((s) => ({ ...s, [key]: NEXT_SORT[state] }))}
                  />
                )}
              </h3>
              <p className="entity-detail-section-sub">
                <span className="num">{section.entries.length}</span> species
              </p>
            </>
          ) : (
            <h3 className="entity-detail-section-label">
              {section.label}
              <span className="entity-detail-section-count">{section.entries.length}</span>
            </h3>
          ))}
        <SpeciesCardGrid
          entries={ordered(section, state)}
          generation={generation}
          onSelect={onSelectSpecies}
          testId={`entity-grid-${slug(section.label ?? 'species')}`}
          testIdPrefix="entity-species"
          footer={footer}
        />
      </section>
    )
  })

  const back = (
    <div className="pokedex-back-row">
      <button type="button" className="pokedex-back" data-testid="entity-back" onClick={onBack}>
        <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
        {backLabel}
      </button>
    </div>
  )

  const head = (
    <>
      <h2 className="entity-detail-name" data-testid="entity-name">
        {titleTestId ? <span data-testid={titleTestId}>{title}</span> : title}
      </h2>
      {meta && (
        <p className="entity-detail-meta" data-testid="entity-meta">
          {meta}
        </p>
      )}
      {lead}
      {description && (
        <p className="entity-detail-desc" data-testid="entity-description">
          {description}
        </p>
      )}
    </>
  )

  if (layout === 'split') {
    return (
      <SplitColumns
        testId={testId}
        entryId={entryId}
        infoTestId={infoTestId}
        scrollKey={scrollKey}
        info={
          <>
            {back}
            {head}
            {children}
          </>
        }
        grid={
          <>
            {gridHeader}
            {grids}
            {gridFooter}
          </>
        }
      />
    )
  }

  return (
    <div className="entity-detail entity-stack" data-testid={testId} data-entry-id={entryId}>
      {back}
      {head}
      {children}
      {gridHeader}

      {grids}
    </div>
  )
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
