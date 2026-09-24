import { IconChevronRight } from '@tabler/icons-react'
import { useMemo, type ReactNode } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { scrollKey } from '../../components/scrollMemory'
import { useDexSelection } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import type { DexModuleId } from '../nav/registry'
import { useDexRows } from './query/dexQueryContext'

/**
 * List page, or detail page -- never both at once.
 *
 * The same split the Pokedex uses since its retrofit: nothing selected shows the
 * full-width list, something selected shows that entry's page with a way back.
 *
 * THE CONTROLS ARE NOT HERE ANY MORE. This component used to render a dex's
 * search, filters and sort in a row above the list. There is now ONE Search/
 * Filter menu and ONE Sort menu for the whole of Pokepedia, both in the app bar,
 * so a dex's query is built and owned by DexQueryProvider and arrives here
 * already applied. What is left above the list is the COUNT -- a readout, not a
 * control, and the one thing a reader should not have to open a menu to see.
 *
 * NO DESCRIPTIVE HEADER. There was a `note` prop for a line like "All 25 natures
 * (Generation 4)" and callers passed explanatory paragraphs through it. Both are
 * gone: the count says how many, the game selector says which game, and a
 * sentence repeating them is the header block this pass removes app-wide. The
 * gated-empty case keeps its message, which is not description -- it is the only
 * thing on screen explaining why the list is empty.
 *
 * Selection still lives in the nav context rather than here, so the global search
 * can open an entry in a dex that is not mounted yet, and so switching tabs and
 * back returns to what was open.
 */
export function DexPageShell<T>({
  dexId,
  entries,
  entryId,
  list,
  detail,
  gatedMessage,
}: {
  dexId: DexModuleId
  /**
   * Every entry in this era, BEFORE filtering. Used for the gated-empty case and
   * to resolve the open entry; the filtered, sorted list comes from the shared
   * query. Both come from the same entrySources function, so they cannot
   * disagree about scope.
   */
  entries: T[]
  entryId: (entry: T) => number
  /** Rendered when nothing is selected, over the filtered, sorted entries. */
  list: (args: { entries: T[]; onSelect: (id: number) => void }) => ReactNode
  /**
   * Rendered when something is. OMIT for a dex with no detail page. The list
   * then simply always renders.
   */
  detail?: (args: { entry: T; onBack: () => void }) => ReactNode
  /** Shown instead of the list when `entries` is empty for era reasons. */
  gatedMessage?: string
}) {
  const [selectedId, setSelectedId] = useDexSelection(dexId)
  /*
    Read for the scroll keys below and nothing else. `entries` arrives already
    generation-scoped from the caller, so this component never filters by
    generation -- but its scroll offsets still have to be keyed by it, and
    `entries.length` is a proxy rather than an answer: two generations can
    scope to the same count.
  */
  const { generation, isAll } = useVersionGroup()
  const { rows: visible, query } = useDexRows<T>(dexId)

  // Resolved against the full gated list, NOT the filtered one: typing narrows
  // the list without closing an open entry, and the global search can open
  // something the local box happens to be hiding. A selection that is no longer
  // in scope -- the generation changed under an open entry -- falls back to the
  // list rather than rendering a detail page the era does not have.
  // Hoisted rather than inlined into the dep list: react-hooks/use-memo requires
  // dependencies to be simple expressions, and `detail == null` is not one.
  const hasDetail = detail != null

  const selected = useMemo(
    () => (hasDetail ? entries.find((entry) => entryId(entry) === selectedId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, selectedId, hasDetail],
  )

  if (entries.length === 0 && gatedMessage) {
    return (
      <div className="pokedex" data-testid={`dex-${dexId}`}>
        <p className="subtitle" data-testid={`${dexId}-empty`}>
          {gatedMessage}
        </p>
        {/* The count still exists and still reports zero: an era with no entries
            is a real answer, not a missing readout. */}
        <p className="subtitle" data-testid={`${dexId}-count`}>
          0 entries
        </p>
      </div>
    )
  }

  return (
    <div className="pokedex" data-testid={`dex-${dexId}`}>
      {selected == null ? (
        <>
          <div className="dex-controls">
            <p className="subtitle dex-controls-count" data-testid={`${dexId}-count`}>
              {visible.length} {visible.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          {/* The query signature is part of the key for the reason the Pokedex
              grid's filters already were: a narrowed or re-ordered list is a
              different list, and an offset taken against another one means
              nothing in it. */}
          <ScrollArea
            testId={`${dexId}-list-scroll`}
            memoryKey={scrollKey(dexId, 'list', generation, isAll, query.signature)}
          >
            {list({ entries: visible, onSelect: setSelectedId })}
          </ScrollArea>
        </>
      ) : (
        <ScrollArea
          testId={`${dexId}-detail-scroll`}
          memoryKey={scrollKey(dexId, 'detail', generation, isAll, entryId(selected))}
        >
          {detail?.({ entry: selected, onBack: () => setSelectedId(null) })}
        </ScrollArea>
      )}
    </div>
  )
}

/**
 * The ledger list row, as its own component.
 *
 * It was inline in DexShell, where three dexes shared it by sharing the whole
 * shell. The Breeding dex and the Abilitydex now use the row without the rail,
 * so the row is separable from the shell that used to own it.
 *
 * THE TRAILING CHEVRON is on the row itself, not on each caller, for the same
 * reason: every ledger row in the app navigates somewhere, so "this row opens
 * something" is a property of the component rather than a decoration a caller
 * opts into. The data table carries the identical glyph in its own last cell.
 *
 * TWO OPTIONAL EXTRAS, both for the Itemdex and both deliberately part of this
 * component rather than a second one: `icon`, which renders AFTER the name rather
 * than before it, and `sub`, a second line under the name. Nothing else needs
 * either yet -- but "the item list row" and "the ability list row" differing by
 * two props is a far smaller thing to keep in step than two row components that
 * happen to look alike.
 */
export function LedgerList({
  testId,
  rows,
  onSelect,
  selectedId = null,
  emptyNote,
}: {
  testId: string
  rows: {
    id: number
    label: string
    meta?: ReactNode
    /** Rendered AFTER the name, not before it. Itemdex's sprite. */
    icon?: ReactNode
    /** A second line under the name, e.g. an item's category and pocket. */
    sub?: ReactNode
  }[]
  onSelect: (id: number) => void
  selectedId?: number | null
  emptyNote?: string
}) {
  return (
    <ul className="species-rows ledger-list" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            data-testid={`${testId.replace(/-rows$/, '')}-row-${r.id}`}
            data-entry-id={r.id}
            aria-current={selectedId === r.id}
            className={selectedId === r.id ? 'species-row species-row-active' : 'species-row'}
            onClick={() => onSelect(r.id)}
          >
            <span className="row-main">
              <span className="row-title">
                <span className="species-name">{r.label}</span>
                {r.icon != null && <span className="row-icon">{r.icon}</span>}
              </span>
              {r.sub != null && <span className="row-sub">{r.sub}</span>}
            </span>
            {r.meta != null && <span className="row-meta">{r.meta}</span>}
            <IconChevronRight
              className="row-chevron"
              size={16}
              stroke={1.5}
              aria-hidden
              focusable="false"
            />
          </button>
        </li>
      ))}
      {rows.length === 0 && emptyNote && (
        <li className="empty" data-testid={`${testId}-empty`}>
          {emptyNote}
        </li>
      )}
    </ul>
  )
}
