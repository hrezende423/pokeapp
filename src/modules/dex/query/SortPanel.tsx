import type { ReactNode } from 'react'
import { ToggleSwitch } from '../../../components/ToggleSwitch'
import type { SortField } from './dexQuery'
import type { DexQuery } from './useDexQuery'

/**
 * The Sort disclosure's contents: which field, and which way.
 *
 * THE FIELD LIST IS THE SAME MIDDOT ROW the multi-value filters use, not a select
 * and not a column header. A select would hide the options until opened, and the
 * point of a sort panel on a page with no table is that the available orderings
 * are readable at a glance; a header row is what the pages that HAVE a table use
 * instead, and on the one page that has both (the Pokedex list view) the two are
 * wired to the same state so they cannot disagree.
 *
 * DIRECTION IS THE EXISTING ToggleSwitch, reused rather than re-drawn: two
 * captions either side of a track, `role="switch"` because both positions are
 * real values rather than present-or-absent. It had been sitting unimported since
 * the artwork panel stopped using it -- this is its second caller, not a new
 * component. (Its knob carried the repo's last `box-shadow`, allow-listed as dead
 * code; putting it back on screen means the shadow had to go, and it did.)
 */
export function SortPanel<T>({
  dexId,
  sorts,
  query,
  header,
}: {
  dexId: string
  sorts: SortField<T>[]
  query: DexQuery<T>
  /** Rendered above the field list. The Pokedex puts its view switch here. */
  header?: ReactNode
}) {
  return (
    <div className="dex-sort-panel-body" data-testid={`${dexId}-sort-body`}>
      {header}
      <div className="dex-filter-field">
        <span className="ds-field-label">Sort by</span>
        <div
          className="ds-filters dex-sort-fields"
          role="group"
          aria-label="Sort by"
          data-testid={`${dexId}-sort-fields`}
        >
          {sorts.map((field, i) => {
            const on = field.key === query.sortKey
            return (
              <span key={field.key}>
                {i > 0 && (
                  <span className="ds-filter-sep" aria-hidden>
                    ·
                  </span>
                )}
                <button
                  type="button"
                  className="ds-filter"
                  /*
                    `sortfield`, not `sort`: DataTable names its own header
                    buttons `<base>-sort-<key>`, and on the one page that has
                    both a table and this panel (the Pokedex list view) the two
                    would have been the same test id for two different controls.
                  */
                  data-testid={`${dexId}-sortfield-${field.key}`}
                  aria-pressed={on}
                  // Clicking the field you are already sorting by flips the
                  // direction, which is what a column header does. The switch
                  // below is the same state said a second way.
                  onClick={() =>
                    query.setSort(field.key, on && query.direction === 'asc' ? 'desc' : 'asc')
                  }
                >
                  {field.label}
                </button>
              </span>
            )
          })}
        </div>
      </div>
      <ToggleSwitch
        id={`${dexId}-sort-dir`}
        label="Direction"
        offLabel="Ascending"
        onLabel="Descending"
        checked={query.direction === 'desc'}
        disabled={query.sortKey == null}
        disabledReason="Pick a field to sort by first."
        onChange={(next) =>
          query.sortKey != null && query.setSort(query.sortKey, next ? 'desc' : 'asc')
        }
      />
    </div>
  )
}
