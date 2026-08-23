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
            // Selected buttons take the type's own colour; unselected ones keep
            // the neutral chrome so the selection stays readable.
            style={on ? { backgroundColor: color, borderColor: color, color: '#fff' } : undefined}
            onClick={() => toggle(type.id)}
          >
            {type.name}
          </button>
        )
      })}
    </div>
  )
}
