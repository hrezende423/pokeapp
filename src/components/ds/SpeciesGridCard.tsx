import { GhostWatermark } from './GhostWatermark'
import { TypeRow } from './TypeLabel'

/**
 * Species grid card for the browse view (DESIGN-SYSTEM.md §5).
 *
 * A ghost card: no border and no background fill, tying to the "artwork provides
 * the color" principle even at grid scale. This was picked over four other
 * treatments in a genuine five-way comparison (bordered card, ledger-tile grid
 * with hairline dividers, pure-whitespace ghost with no watermark, bento-style
 * featured-first grid) -- worth knowing before redesigning it.
 *
 * Order below the artwork is fixed by the spec: dex number + name on one line,
 * then the type row, then the ability in smaller secondary text.
 *
 * The mini watermark uses --font-size-ghost-watermark-grid (64px) rather than the
 * 48px in the demo HTML, which renders the card compact.
 *
 * OPEN ITEM (§5): whether the dex number dims for not-yet-caught entries has not
 * been re-confirmed at grid scale -- §8 settled the rule for the ledger row only.
 * So this card does not dim anything, and takes no `caught` prop: applying the
 * ledger rule here would be a guess, and the watermark has its own fixed opacity
 * that a dim rule would contradict.
 */
export function SpeciesGridCard({
  dexNumber,
  name,
  types,
  ability,
  artworkUrl,
  onClick,
}: {
  dexNumber: number
  name: string
  types: string[]
  ability?: string | null
  artworkUrl?: string | null
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className="ds-grid-card"
      data-ds="grid-card"
      data-dex={dexNumber}
      onClick={onClick}
    >
      <GhostWatermark dexNumber={dexNumber} scale="grid" />
      {artworkUrl ? (
        <img className="ds-grid-art" src={artworkUrl} alt={name} loading="lazy" />
      ) : (
        <span className="ds-grid-art" />
      )}
      <span className="ds-grid-line">
        <span className="ds-grid-num">{String(dexNumber).padStart(3, '0')}</span>
        <span className="ds-grid-name">{name}</span>
      </span>
      <span style={{ display: 'block', marginTop: 2 }}>
        <TypeRow types={types} small />
      </span>
      {ability && <span className="ds-grid-ability">{ability}</span>}
    </button>
  )
}
