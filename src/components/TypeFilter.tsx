import { typeColor } from './typeColors'
import type { PokemonType } from '../data'

interface Props {
  /** Types offered, already filtered to the selected generation by the caller. */
  available: PokemonType[]
  /** Currently selected type ids. Empty means unfiltered. */
  selected: number[]
  onChange: (next: number[]) => void
  /** Prefix for the test ids, so two filters can coexist in one DOM. */
  testIdPrefix?: string
  label?: string
}

/**
 * The type filter: one button per type, filled with that type's own colour when
 * selected, plus an "Any" button that clears the selection.
 *
 * Extracted from the Pokedex species list so the Movedex uses the *same*
 * component rather than a second implementation that could drift in colours,
 * OR/AND semantics or clear behaviour. The palette comes from typeColors.ts,
 * which is itself the single cited table shared with the type badges.
 *
 * Selection is OR across types and is the caller's to interpret: the Pokedex asks
 * "has any of these types", the Movedex "is one of these types".
 */
export function TypeFilter({
  available,
  selected,
  onChange,
  testIdPrefix = 'type-filter',
  label = 'Filter by type',
}: Props) {
  const unfiltered = selected.length === 0

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id])

  return (
    <div className="type-filter" role="group" aria-label={label}>
      {/* "Any" is the cleared state, shown pressed while nothing is selected so
          the filter always has a visibly active option. */}
      <button
        type="button"
        data-testid={`${testIdPrefix}-any`}
        aria-pressed={unfiltered}
        className={unfiltered ? 'tf tf-any tf-on' : 'tf tf-any'}
        onClick={() => onChange([])}
      >
        Any
      </button>
      {available.map((type) => {
        const on = selected.includes(type.id)
        const color = typeColor(type.name)
        return (
          <button
            key={type.id}
            type="button"
            data-testid={`${testIdPrefix}-${type.name}`}
            data-type={type.name}
            data-color={color}
            aria-pressed={on}
            className={on ? 'tf tf-on' : 'tf'}
            // A selected button becomes its type's own colour -- the TEXT, not a
            // fill. "Type is data, not decoration" is the whole rule now, and
            // this control was the last thing in the app still drawing a chip.
            // The palette is unchanged: typeColors.ts, the single cited table
            // shared with every type label.
            style={on ? { color } : undefined}
            onClick={() => toggle(type.id)}
          >
            {type.name}
          </button>
        )
      })}
    </div>
  )
}
