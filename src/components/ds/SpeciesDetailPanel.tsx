import type { ReactNode } from 'react'
import type { SpeciesBackground } from '../../data/speciesBackgrounds'
import { TypeRow } from './TypeLabel'

/**
 * Species detail page: two panels, not a card (DESIGN-SYSTEM.md §5).
 *
 * LAYERING RULE, quoted because it is the part that is easy to get subtly wrong:
 * the whole screen shares one background colour layer first, and the drawer is a
 * separate surface floating on top of it. The drawer's own background never
 * changes; only the shared background behind and around it does. So the container
 * carries the colour, the artwork panel is transparent, and the drawer is
 * --surface-raised in every state.
 *
 * The drawer is persistent and rounded only on its exposed left side -- it is not
 * an overlay, and there is no scrim. Its content scrolls internally, independent
 * of the artwork panel, which does not scroll at all.
 *
 * BACKGROUND, two supported modes, both kept:
 *   standard  one constant --surface for every species. Not deprecated -- the
 *             spec says to keep it available as the simple mode.
 *   tinted    the art-directed per-species pair from species-background-colors
 *             .json, which is art direction per illustration, NOT derived from
 *             the type colours. Nothing here adjusts the colour it is given.
 *
 * `theme` is explicit rather than read from the document, because the reference
 * page renders a light and a dark instance side by side inside one document, and
 * a component that sniffed a global would render both the same.
 *
 * Elevation is the --surface / --surface-raised tone-step. No shadow separates
 * the drawer from the page, in either mode, by design.
 */
export function SpeciesDetailPanel({
  dexNumber,
  name,
  genus,
  types,
  artworkUrl,
  mode,
  tint,
  theme,
  children,
}: {
  dexNumber: number
  name: string
  genus?: string | null
  types: string[]
  artworkUrl?: string | null
  mode: 'standard' | 'tinted'
  /** Required for tinted mode; ignored in standard mode. */
  tint?: SpeciesBackground | null
  theme: 'light' | 'dark'
  /** Drawer content: tabs, stat rows, whatever the screen needs. */
  children?: ReactNode
}) {
  const tinted = mode === 'tinted' && tint != null
  const background = tinted ? (theme === 'dark' ? tint.bg_dark : tint.bg_light) : undefined

  return (
    <section
      className="ds-detail"
      data-ds="detail-page"
      data-dex={dexNumber}
      data-mode={tinted ? 'tinted' : 'standard'}
      /* The shared background layer. Undefined in standard mode so the
         stylesheet's --surface applies rather than a duplicated literal. */
      style={background ? { background } : undefined}
    >
      <div className="ds-detail-art-panel" data-ds="detail-art-panel">
        {artworkUrl && <img className="ds-detail-art" src={artworkUrl} alt={name} />}
      </div>

      <aside className="ds-detail-drawer" data-ds="detail-drawer">
        <span className="ds-detail-num">{String(dexNumber).padStart(3, '0')}</span>
        <h2 className="ds-detail-drawer-name">{name}</h2>
        <div style={{ marginTop: 4 }}>
          <TypeRow types={types} />
        </div>
        {genus && <p className="ds-detail-flavor">{genus}</p>}
        {children}
      </aside>
    </section>
  )
}
