/**
 * Tabs, the search/filter row, and the form section label.
 *
 * TABS: underline style, --accent on the active tab (text + 2px underline),
 * --text-secondary on inactive. The accent's first sanctioned use.
 *
 * SEARCH / FILTER: a single hairline-underline input with no border box, and
 * filters as plain middot-separated text -- no chip, no pill container. That was
 * a deliberate de-chroming decision made alongside the type-label change, so the
 * absence of a chip here is the design, not an unfinished state. §5 notes no
 * search icon has been specified, so none is added.
 *
 * FORM SECTION LABEL: uppercase label-size secondary text, used to break a long
 * form into named groups without boxing the sections.
 */
export function Tabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: string[]
  active: string
  onSelect: (tab: string) => void
}) {
  return (
    <div className="ds-tabs" role="tablist" data-ds="tabs">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          className="ds-tab"
          data-ds="tab"
          aria-selected={t === active}
          onClick={() => onSelect(t)}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

export function SearchFilterRow({
  value,
  onValueChange,
  placeholder = 'Search species',
  filters,
  activeFilter,
  onFilterChange,
}: {
  value: string
  onValueChange: (next: string) => void
  placeholder?: string
  filters: string[]
  activeFilter: string
  onFilterChange: (filter: string) => void
}) {
  return (
    <div data-ds="search-filter">
      <input
        type="search"
        className="ds-search"
        data-ds="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <div className="ds-filters" data-ds="filters">
        {filters.map((f, i) => (
          <span key={f}>
            {i > 0 && (
              <span className="ds-filter-sep" aria-hidden>
                ·
              </span>
            )}
            <button
              type="button"
              className="ds-filter"
              data-ds="filter"
              aria-pressed={f === activeFilter}
              onClick={() => onFilterChange(f)}
            >
              {f}
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

export function FormSectionLabel({ children }: { children: string }) {
  return (
    <p className="ds-section-label" data-ds="section-label">
      {children}
    </p>
  )
}
