/**
 * The oversized ghost behind a card or beside a detail header: the system's one
 * deliberately loud move.
 *
 * Two scales are a dex number at a constant 5% opacity, positioned top-right and
 * allowed to bleed off the card edge (220px hero/detail, 64px grid), which is
 * why every host of those has overflow: hidden.
 *
 * THE THIRD SCALE, `detail`, carries TEXT rather than a number: the one ghost on
 * a dex detail page (a move's power, a nature's stat delta). It sits in flow, in
 * a grid area of its host, at the design system's watermark style
 * (--font-style-watermark-*) in --color-text-watermark -- an opaque low-contrast
 * ink rather than an opacity, which is how the newer token set expresses it.
 * Whatever it says must also be on the page as readable text: it is aria-hidden,
 * decoration for orientation, never the only copy of a fact.
 */
export function GhostWatermark({
  dexNumber,
  text,
  scale,
}: {
  dexNumber?: number
  /** Shown instead of the padded dex number. Used by the `detail` scale. */
  text?: string
  scale: 'hero' | 'grid' | 'detail'
}) {
  return (
    <span
      className={`ds-ghost ds-ghost-${scale}`}
      data-ds="ghost-watermark"
      data-scale={scale}
      aria-hidden
    >
      {text ?? String(dexNumber ?? '').padStart(3, '0')}
    </span>
  )
}
