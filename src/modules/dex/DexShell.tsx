import { useMemo, useState, type ReactNode } from 'react'

export interface DexRow {
  id: number
  /** Shown in the list and matched by the search box. */
  label: string
  /** Optional short suffix on the row, e.g. an item category. */
  meta?: string
}

interface Props<T> {
  /** Stable slug, used for every test id in this shell. */
  dexId: string
  title: string
  /** Entries after generation gating, in display order. */
  entries: T[]
  row: (entry: T) => DexRow
  detail: (entry: T) => ReactNode
  /** Shown instead of the list when `entries` is empty for era reasons. */
  gatedMessage?: string
  searchable?: boolean
  /** Line under the title, e.g. what the current gating is doing. */
  note?: ReactNode
}

/**
 * The list-plus-detail shell every dex shares: a fixed 240px sidebar with an
 * optional name search, and a detail area of cards.
 *
 * It reuses the Pokedex's `.pokedex-body` / `.species-list` / `.card` classes on
 * purpose rather than defining a parallel set, so all five dexes stay visually
 * identical and a layout fix lands once. The Pokedex keeps its own copy of this
 * structure because it also carries type filters and a version-group header;
 * folding it in here would mean parameterising this shell for one caller.
 *
 * Generation gating is the caller's job -- this only renders what it is handed --
 * but an empty list is treated as a real state with an explanation, never as a
 * blank panel.
 */
export function DexShell<T>({
  dexId,
  title,
  entries,
  row,
  detail,
  gatedMessage,
  searchable = true,
  note,
}: Props<T>) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return entries
      .map((entry) => ({ entry, row: row(entry) }))
      .filter(({ row: r }) => !term || r.label.toLowerCase().includes(term))
    // `row` is a render-time formatter recreated every render; including it here
    // would rebuild the list on every keystroke for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, search])

  const selected = useMemo(
    () => rows.find(({ row: r }) => r.id === selectedId)?.entry,
    [rows, selectedId],
  )

  return (
    <div className="pokedex" data-testid={`dex-${dexId}`}>
      <header className="pokedex-head">
        <div>
          <h1>{title}</h1>
          {note && (
            <p className="subtitle" data-testid={`${dexId}-note`}>
              {note}
            </p>
          )}
        </div>
      </header>

      <div className="pokedex-body">
        <div className="species-list">
          <div className="list-controls">
            {searchable && (
              <input
                type="search"
                data-testid={`${dexId}-search`}
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={`Search ${title} by name`}
              />
            )}
            <p className="subtitle" data-testid={`${dexId}-count`}>
              {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>

          <ul className="species-rows" data-testid={`${dexId}-rows`}>
            {rows.map(({ row: r }) => (
              <li key={r.id}>
                <button
                  type="button"
                  data-testid={`${dexId}-row-${r.id}`}
                  data-entry-id={r.id}
                  aria-current={selectedId === r.id}
                  className={selectedId === r.id ? 'species-row species-row-active' : 'species-row'}
                  onClick={() => setSelectedId(r.id)}
                >
                  <span className="dex-no">#{String(r.id).padStart(3, '0')}</span>
                  <span className="species-name">{r.label}</span>
                  {r.meta && <span className="row-meta">{r.meta}</span>}
                </button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="empty" data-testid={`${dexId}-empty`}>
                {entries.length === 0 && gatedMessage
                  ? gatedMessage
                  : 'No entries match that search.'}
              </li>
            )}
          </ul>
        </div>

        <div className="pokedex-detail">
          {selected == null ? (
            <p className="subtitle" data-testid={`${dexId}-no-selection`}>
              {entries.length === 0 && gatedMessage
                ? gatedMessage
                : 'Select an entry to see its details.'}
            </p>
          ) : (
            <div className="detail" data-testid={`${dexId}-detail`} data-entry-id={selectedId}>
              {detail(selected)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** A titled card, so every dex detail view is built from the same block. */
export function DexCard({
  testId,
  title,
  children,
}: {
  testId: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="card" data-testid={testId}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

/** Label/value rows, matching the Pokedex profile block. */
export function DexFacts({ facts }: { facts: [string, ReactNode][] }) {
  return (
    <ul className="stats">
      {facts.map(([label, value]) => (
        <li key={label}>
          <span>{label}</span>
          <strong data-testid={`fact-${label.replace(/\s+/g, '-')}`}>{value}</strong>
        </li>
      ))}
    </ul>
  )
}
