import { useMemo, useState, type ReactNode } from 'react'
import { useDexSelection } from '../nav/navContext'
import type { DexModuleId } from '../nav/registry'

/**
 * List page, or detail page -- never both at once.
 *
 * The same split the Pokedex uses since its retrofit: nothing selected shows the
 * full-width list, something selected shows that entry's page with a way back.
 * DexShell's 240px rail stays where it is for the dexes whose content suits it
 * (Itemdex, Berrydex); this shell is for the four whose list or detail needs the
 * full width -- a 5x5 matrix, a six-column table, or a species grid at the
 * measured card width.
 *
 * The name search and the entry count come with it. They were DexShell's, in the
 * rail; losing the rail should not lose the search, and putting them here rather
 * than in each of the four callers keeps it one implementation.
 *
 * Selection still lives in the nav context rather than here, so the global search
 * can open an entry in a dex that is not mounted yet, and so switching tabs and
 * back returns to what was open.
 */
export function DexPageShell<T>({
  dexId,
  entries,
  entryId,
  searchText,
  note,
  list,
  detail,
  gatedMessage,
}: {
  dexId: DexModuleId
  /** Entries after generation gating, in display order. */
  entries: T[]
  entryId: (entry: T) => number
  /** What the search box matches against. Omit for a list with no search. */
  searchText?: (entry: T) => string
  /** Line above the list, e.g. what the current gating is doing. */
  note?: ReactNode
  /** Rendered when nothing is selected, over the search-filtered entries. */
  list: (args: { entries: T[]; onSelect: (id: number) => void }) => ReactNode
  /** Rendered when something is. */
  detail: (args: { entry: T; onBack: () => void }) => ReactNode
  /** Shown instead of the list when `entries` is empty for era reasons. */
  gatedMessage?: string
}) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useDexSelection(dexId)

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term || !searchText) return entries
    return entries.filter((entry) => searchText(entry).toLowerCase().includes(term))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, search])

  // Resolved against the full gated list, NOT the search-filtered one: typing
  // narrows the list without closing an open entry, and the global search can
  // open something the local box happens to be hiding. A selection that is no
  // longer in scope -- the generation changed under an open entry -- falls back
  // to the list rather than rendering a detail page the era does not have.
  const selected = useMemo(
    () => entries.find((entry) => entryId(entry) === selectedId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, selectedId],
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
          <div className="dex-list-head">
            {searchText && (
              <input
                type="search"
                data-testid={`${dexId}-search`}
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={`Search ${dexId} by name`}
              />
            )}
            <p className="subtitle" data-testid={`${dexId}-count`}>
              {visible.length} {visible.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          {note && (
            <p className="subtitle dex-list-note" data-testid={`${dexId}-note`}>
              {note}
            </p>
          )}
          {list({ entries: visible, onSelect: setSelectedId })}
        </>
      ) : (
        detail({ entry: selected, onBack: () => setSelectedId(null) })
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
 */
export function LedgerList({
  testId,
  rows,
  onSelect,
  selectedId = null,
  emptyNote,
}: {
  testId: string
  rows: { id: number; label: string; meta?: ReactNode }[]
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
            <span className="dex-no">#{String(r.id).padStart(3, '0')}</span>
            <span className="species-name">{r.label}</span>
            {r.meta != null && <span className="row-meta">{r.meta}</span>}
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
