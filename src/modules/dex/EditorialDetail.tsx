import { IconArrowLeft } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { GhostWatermark } from '../../components/ds/GhostWatermark'
import { KeyValueList, type KeyValueItem } from '../../components/ds/KeyValueList'

/**
 * The editorial detail page: the structure the five reference dexes share
 * (Movedex, Abilitydex, Itemdex, Naturedex, Berrydex -- owner, 2026-10-10).
 *
 * ONE RHYTHM, TOP TO BOTTOM, on every one of them:
 *
 *   name -> identity (type, category) -> ghost -> headline numbers ->
 *   the lead text -> secondary facts -> related data
 *
 * No borders, fills or shadows group anything: a block is told apart from the
 * next by type size and spacing, and a group of related rows by a small
 * uppercase heading over one hairline. Colour appears only where it means
 * something -- a type's name, a stat's direction.
 *
 * THE GHOST IS DECORATION, NOT CONTENT. It is aria-hidden at watermark contrast,
 * so whatever it shows (a move's power, a nature's stat delta) is also on the
 * page as readable text. A page with nothing worth a ghost has none -- an
 * ability, an item.
 *
 * THE HEAD IS LAID OUT BY AREA (root CLAUDE.md, "Laying out a screen"): art,
 * name, identity and strip in a column, the ghost in its own area to the right.
 * A page with art swaps the template rather than nudging the text across.
 */

export function EditorialBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="pokedex-back-row">
      <button type="button" className="pokedex-back" data-testid="entity-back" onClick={onBack}>
        <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
        {label}
      </button>
    </div>
  )
}

export function EditorialHead({
  title,
  titleTestId,
  identity,
  identityTestId,
  ghost,
  strip,
  stripTestId,
  art,
}: {
  title: string
  /** Dex-specific test id on the name; "entity-name" is always on the heading. */
  titleTestId?: string
  identity?: ReactNode
  identityTestId?: string
  /** Ghost text. Omit for a page with nothing worth one. */
  ghost?: string | null
  /** The headline numbers, as a key-value strip. */
  strip?: KeyValueItem[]
  stripTestId?: string
  /** A compact literal image beside the name (an item's sprite). Never a ghost. */
  art?: ReactNode
}) {
  return (
    <header className="dex-ed-head" data-layout="dex-detail-head" data-has-art={art != null}>
      {art != null && <div className="dex-ed-art">{art}</div>}
      <h2 className="entity-detail-name dex-ed-name" data-testid="entity-name">
        {titleTestId ? <span data-testid={titleTestId}>{title}</span> : title}
      </h2>
      {identity != null && (
        <p className="dex-ed-identity" data-testid={identityTestId ?? 'entity-meta'}>
          {identity}
        </p>
      )}
      {ghost && (
        <div className="dex-ed-ghost">
          <GhostWatermark text={ghost} scale="detail" />
        </div>
      )}
      {strip && strip.length > 0 && (
        <div className="dex-ed-strip">
          <KeyValueList items={strip} layout="strip" testId={stripTestId} />
        </div>
      )}
    </header>
  )
}

/** The entry's main text: the largest running text on the page, readable ink. */
export function EditorialLead({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="dex-ed-lead" data-testid={testId}>
      {children}
    </p>
  )
}

/**
 * A group of related rows: a small uppercase heading over one hairline, and an
 * optional count beside it. The group's own rows supply any further hairlines.
 */
export function EditorialGroup({
  label,
  count,
  testId,
  children,
}: {
  label: string
  count?: number
  testId?: string
  children: ReactNode
}) {
  return (
    <section className="dex-ed-group" data-testid={testId}>
      <h3 className="dex-ed-group-label">
        {label}
        {count != null && <span className="dex-ed-group-count">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** The page root. Compact density: this is a reference page (PRINCIPLES.md). */
export function EditorialPage({
  testId,
  entryId,
  children,
}: {
  testId: string
  entryId: number
  children: ReactNode
}) {
  return (
    <div
      className="entity-detail dex-ed"
      data-variant="editorial"
      data-density="compact"
      data-testid={testId}
      data-entry-id={entryId}
    >
      {children}
    </div>
  )
}
