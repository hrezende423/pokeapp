/**
 * Type indicator: colored text, nothing else.
 *
 * "Type is data, not decoration" (DESIGN-SYSTEM.md §2). No fill, no pill, no
 * badge shape -- colored chips were tried and rejected as the single most common
 * generic-AI tell found in the reference search (§4).
 *
 * §3 resolved the list-vs-detail question in favour of this same treatment
 * everywhere, so there is one component rather than a colored variant for detail
 * screens and a monochrome glyph variant for list rows.
 *
 * NOT IMPLEMENTED ON PURPOSE -- the solid-square badge: design-tokens.json
 * sanctions it as an equally valid, dev-time-per-context choice and gives it a
 * radius (radius.badge-square, 5px), but nothing anywhere specifies its fill
 * colour or its text colour, and a colored-square badge whose contrast has not
 * been decided is exactly the kind of thing this system says not to improvise.
 * The radius token is wired up in design-tokens.css and ready for it.
 *
 * Colour comes from --type-<name>, which resolves per theme: every one of the 17
 * has a contrast-verified dark-mode value. Types outside that set (fairy,
 * unknown, shadow all exist in the data bundle but not in the Gen 1-4 scope the
 * palette covers) fall back to --text-secondary rather than to an arbitrary
 * colour -- and cannot appear via resolveTypesForGeneration in this app anyway.
 */

const TYPES_WITH_TOKENS = new Set([
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
])

// Local on purpose: exporting a helper beside components trips
// react-refresh/only-export-components, and no other component needs it.
function typeColorVar(typeName: string): string {
  return TYPES_WITH_TOKENS.has(typeName) ? `var(--type-${typeName})` : 'var(--text-secondary)'
}

export function TypeLabel({
  type,
  small = false,
}: {
  /** Lowercase type slug, e.g. "fire". */
  type: string
  small?: boolean
}) {
  return (
    <span
      className={small ? 'ds-type ds-type-sm' : 'ds-type'}
      style={{ color: typeColorVar(type) }}
      data-ds="type-label"
      data-type={type}
    >
      {type}
    </span>
  )
}

/** Dual types, middot-separated, each in its own colour (§5, species grid card). */
export function TypeRow({ types, small = false }: { types: string[]; small?: boolean }) {
  return (
    <span className="ds-type-row" data-ds="type-row">
      {types.map((t, i) => (
        <span key={t}>
          {i > 0 && <span className="ds-type-sep">·</span>}
          <TypeLabel type={t} small={small} />
        </span>
      ))}
    </span>
  )
}
