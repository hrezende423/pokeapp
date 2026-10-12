/**
 * A move's damage category as an icon (owner, 2026-10-12, Trainer Dex cards):
 *
 *   physical  an eight-point star, outlined, in the physical category ink
 *   special   concentric target circles, in the special category ink
 *   status    a yin-yang, outlined and WITHOUT the two dots the usual glyph has
 *
 * Drawn on Tabler's grid (24 units, 1.5 stroke, round joins) so they sit with the
 * rest of the icon set; only the target is Tabler's own -- it has no eight-point
 * star, and its yin-yang carries the dots. Colours are the Movedex's category
 * TEXT tokens, so an icon and the word it replaces share one ink per theme.
 *
 * The word stays as the accessible name and the tooltip: the icon is the only
 * mark on screen, so it must still say "Physical" to a reader that cannot see it.
 */

const LABEL: Record<string, string> = {
  physical: 'Physical',
  special: 'Special',
  status: 'Status',
}

const STAR =
  'M12 2.5L13.76 7.75L18.72 5.28L16.25 10.24L21.5 12L16.25 13.76L18.72 18.72L13.76 16.25' +
  'L12 21.5L10.24 16.25L5.28 18.72L7.75 13.76L2.5 12L7.75 10.24L5.28 5.28L10.24 7.75Z'

export function MoveCategoryIcon({ category }: { category: string | null | undefined }) {
  const label = LABEL[category ?? '']
  if (!label) return <span className="ds-move-cat-icon" aria-hidden />
  return (
    <svg
      className="ds-move-cat-icon"
      data-cat={category}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {category === 'physical' && <path d={STAR} />}
      {category === 'special' && (
        <>
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="9" />
        </>
      )}
      {category === 'status' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a4.5 4.5 0 0 0 0 9a4.5 4.5 0 0 1 0 9" />
        </>
      )}
    </svg>
  )
}
