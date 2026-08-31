import type { ReactNode } from 'react'
import { Button } from './Button'
import { StatList, StatRow } from './DataRows'
import { GhostWatermark } from './GhostWatermark'
import { TypeRow } from './TypeLabel'

export interface HeroStat {
  label: string
  value: number | string
}

/**
 * Hero detail card (DESIGN-SYSTEM.md §5) -- the full species detail view as a
 * card: --radius-card, --space-card-padding, --surface background, no border and
 * no shadow.
 *
 * Parts, in the spec's order: the rotated era micro-label at top-left, the ghost
 * watermark bleeding off the top-right, the height/weight mini badges, the
 * background-removed artwork with no platform or shadow beneath it, the name, the
 * type label, the stat table, and the actions row.
 *
 * NAME SIZE: §5 names a `--font-size-hero-name` token that does not exist in
 * either token file. --font-size-display is that value (38px, described in the
 * JSON as "Hero species name on the detail page. The one deliberately loud text
 * element"), so this uses it.
 *
 * The artwork is PokeAPI official artwork, which is already transparent -- the
 * chroma-key step §5 mentions is for sources that are not.
 *
 * THE LOWER SECTIONS ARE OPTIONAL, added for the species detail page's pinned
 * left column. That layout wants the same treatment this component already owns
 * and has verified -- rotated micro-label, ghost watermark bleeding off the
 * top-right, background-removed artwork, the loud name -- but puts the types and
 * the base stats in the scrolling right column instead, so rendering them here
 * would duplicate them on screen. Omitting `types` and `stats` drops those blocks
 * rather than rendering empty ones.
 *
 * A variant on the existing component, deliberately, not a second near-identical
 * card: the whole point of reusing it is that the geometry cannot drift between
 * the design-system reference and the real page.
 *
 * `era` is the rotated micro-label's text and is not restricted to an era -- the
 * species page passes "Region: Sinnoh". The prop name is kept because the class
 * and the data attribute it drives (.ds-hero-era / data-ds="hero-era") are
 * asserted by name in the design-system suite.
 */
export function HeroDetailCard({
  dexNumber,
  name,
  genus,
  types,
  era,
  heightM,
  weightKg,
  artworkUrl,
  stats,
  primaryAction,
  secondaryAction,
  children,
}: {
  dexNumber: number
  name: string
  genus?: string | null
  /** Omit to drop the type row -- see the note above. */
  types?: string[]
  /** The rotated micro-label: "Gen 2" in the reference, "Region: Sinnoh" on the species page. */
  era: string
  heightM?: number | null
  weightKg?: number | null
  artworkUrl?: string | null
  /** Omit to drop the stat table -- see the note above. */
  stats?: HeroStat[]
  primaryAction?: string
  secondaryAction?: string
  /** Rendered after the name block -- the species page's katakana / romaji pair. */
  children?: ReactNode
}) {
  return (
    <article className="ds-hero" data-ds="hero-card" data-dex={dexNumber}>
      <span className="ds-hero-era" data-ds="hero-era">
        {era}
      </span>
      <GhostWatermark dexNumber={dexNumber} scale="hero" />

      <div className="ds-mini-badges" data-ds="mini-badges">
        {heightM != null && <span className="ds-mini-badge">{heightM.toFixed(1)} m</span>}
        {weightKg != null && <span className="ds-mini-badge">{weightKg.toFixed(1)} kg</span>}
      </div>

      {artworkUrl && <img className="ds-hero-art" src={artworkUrl} alt={name} />}

      <h2 className="ds-hero-name" data-ds="hero-name">
        {name}
      </h2>
      {types && types.length > 0 && (
        <div className="ds-hero-type">
          <TypeRow types={types} />
        </div>
      )}
      {genus && <p className="ds-hero-genus">{genus}</p>}
      {children}

      {stats && stats.length > 0 && (
        <div className="ds-hero-stats">
          <StatList>
            {stats.map((s) => (
              <StatRow key={s.label} label={s.label} value={s.value} />
            ))}
          </StatList>
        </div>
      )}

      {(primaryAction || secondaryAction) && (
        <div className="ds-hero-actions">
          {primaryAction && <Button>{primaryAction}</Button>}
          {secondaryAction && <Button variant="secondary">{secondaryAction}</Button>}
        </div>
      )}
    </article>
  )
}
