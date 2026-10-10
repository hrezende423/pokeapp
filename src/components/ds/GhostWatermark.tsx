/**
 * The oversized dex number behind a card: the system's one deliberately loud
 * move, at a constant 5% opacity across both scales (220px on hero/detail, 64px
 * on grid cards) per opacity.ghost-watermark.
 *
 * Positioned top-right and allowed to bleed off the card edge, which is why every
 * host has overflow: hidden.
 */
export function GhostWatermark({
  dexNumber,
  scale,
}: {
  dexNumber: number
  scale: 'hero' | 'grid'
}) {
  return (
    <span
      className={`ds-ghost ds-ghost-${scale}`}
      data-ds="ghost-watermark"
      data-scale={scale}
      aria-hidden
    >
      {String(dexNumber).padStart(3, '0')}
    </span>
  )
}
