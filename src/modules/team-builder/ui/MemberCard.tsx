/**
 * The member card, in four densities, from one component.
 *
 * FOUR VARIANTS BECAUSE FOUR SCREENS SHOW THE SAME PIECE OF DATA AT DIFFERENT
 * SIZES -- not because there are four cards:
 *
 *   compact  My Teams. Six per row, so a row stays a scannable list line:
 *            artwork, name + gender, types, "Ability · Nature". No level, no
 *            spread, no moves. This density comes from the reference images and
 *            was confirmed over the fuller spec text, since six full cards would
 *            triple every row's height.
 *   full     Team Viewer. The whole build: level, (Species), spread, four moves.
 *   library  Build Library. `full` plus tags and a usage count.
 *   rail     Build Form's right rail. Three tight lines beside a small portrait.
 *
 * ALL FOUR DRAW OFFICIAL ARTWORK. The in-game sprite is not used in this module
 * at all -- the same build must not be a smooth render on one screen and a pixel
 * tile on the next.
 *
 * Duplicating this per screen would mean remembering the era-correct move-type
 * rule, the genderless rule and the nickname-parenthetical rule four times.
 *
 * NOT BOXED. A bottom hairline only -- the same treatment the Pokedex and Movedex
 * data tables use, and the reason a slot grid reads as a grid rather than as six
 * floating panels. No box-shadow anywhere, per the design system.
 *
 * MOVES ARRIVE AS `MoveRow`, NEVER AS `Move`. Their types were resolved against
 * the build's own generation by buildFacts before they got here; see that file.
 */

import type { ReactNode } from 'react'
import { TypeLabel } from '../../../components/ds/TypeLabel'
import { resolveArtworkUrl } from '../../../data'
import {
  abilityName,
  buildSpecies,
  categoryLabel,
  displayName,
  genderGlyph,
  itemName,
  moveRowsFor,
  natureName,
  spreadSummary,
  type MoveRow,
} from '../buildFacts'
import { spreadStatKeys, statKeysForGeneration, type Build } from '../model'

export type MemberCardVariant = 'compact' | 'full' | 'library' | 'rail'

/** Type-coloured move name, its event asterisk, and its category. */
export function MoveLine({ row, testId }: { row: MoveRow | null; testId?: string }) {
  if (!row) {
    return (
      <span className="tb-move tb-move-empty" data-testid={testId} data-empty="true">
        —
      </span>
    )
  }
  return (
    <span
      className="tb-move"
      data-testid={testId}
      data-move-id={row.moveId}
      data-move-type={row.type ?? ''}
      data-event={row.isEvent ? 'true' : undefined}
    >
      <span className="tb-move-name">
        ~{row.name}
        {/* The asterisk IS the event affordance; which event it came from is
            deliberately not tracked. */}
        {row.isEvent && <span className="tb-move-event">*</span>}
      </span>
      {row.type ? <TypeLabel type={row.type} small /> : <span className="tb-move-untyped">—</span>}
      <span className="tb-move-cat" data-cat={row.category ?? ''}>
        {categoryLabel(row.category)}
      </span>
    </span>
  )
}

export function MemberCard({
  build,
  variant = 'full',
  onOpen,
  corners,
  footer,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  testId,
}: {
  build: Build
  variant?: MemberCardVariant
  /** Click on the card body. Absent renders an inert card, not a disabled button. */
  onOpen?: () => void
  /** Hover-revealed controls, absolutely positioned into the card's corners. */
  corners?: ReactNode
  /** Extra content under the body (tags, usage count). */
  footer?: ReactNode
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  testId?: string
}) {
  const facts = buildSpecies(build)
  if (!facts) {
    return (
      <div className="tb-card tb-card-missing" data-testid={testId}>
        <p>This build&rsquo;s species is not in the data bundle.</p>
      </div>
    )
  }
  const { species, variety, types } = facts
  const { primary, secondary } = displayName(build, species)
  const glyph = genderGlyph(build.gender)
  const moves = moveRowsFor(build)
  const spread = spreadSummary(build, statKeysForGeneration(build.generation))
  const dvSpread = spreadSummary(build, spreadStatKeys(build.generation))

  /* OFFICIAL ARTWORK IN EVERY VARIANT. It used to be library-only, with the other
     three on the in-game sprite -- so one screen showed a Pokemon at 475px of
     smooth artwork and the next showed the same build as a 64px pixel tile. The
     module now shows one picture of a species everywhere. */
  const art = resolveArtworkUrl(species, variety, {
    source: 'artwork',
    motion: 'static',
    shiny: build.shiny,
    gender: build.gender === 'female' ? 'female' : 'male',
  })

  /* Natures and abilities do not exist before Gen 3, so the line is absent then
     rather than showing two em-dashes. */
  const showMeta = build.generation >= 3
  const showMoves = variant === 'full' || variant === 'library'
  const showLevel = variant !== 'compact'

  const art_ = art ? <img src={art} alt="" loading="lazy" /> : <span className="tb-card-art-none" />

  if (variant === 'rail') {
    return (
      <button
        type="button"
        className="tb-card tb-card-rail"
        data-tb="member-card"
        data-testid={testId}
        data-build-id={build.id}
        onClick={onOpen}
      >
        <span className="tb-card-art">{art_}</span>
        <span className="tb-rail-lines">
          <span className="tb-rail-line">
            {showMeta ? natureName(build.natureId) : primary}
            {build.itemId != null && ` @${itemName(build.itemId)}`}
          </span>
          <span className="tb-rail-line">
            {showMeta ? abilityName(build.abilityId) : species.display_name} · Lv.{build.level}
          </span>
          <span className="tb-rail-line num">{spread ?? 'No investment'}</span>
        </span>
      </button>
    )
  }

  const body = (
    <>
      <span className="tb-card-art">
        {/* The oversized dex number sits behind the artwork, bleeding off the
            card, which is why every card host sets overflow: hidden. */}
        <span className="tb-card-ghost" aria-hidden>
          {String(species.id).padStart(3, '0')}
        </span>
        {variant !== 'compact' && species.name_ja && (
          <span className="tb-card-ghost-ja" aria-hidden>
            {species.name_ja}
          </span>
        )}
        {art_}
      </span>
      <span className="tb-card-facts">
        <span className="tb-card-headline">
          <span className="tb-card-name">{primary}</span>
          {/* Genderless renders NOTHING -- not a symbol, not a dash. */}
          {glyph && (
            <span className="tb-card-gender" data-gender={build.gender}>
              {glyph}
            </span>
          )}
          {showLevel && <span className="tb-card-level num">Lv.{build.level}</span>}
        </span>
        {/* Only when the nickname actually differs from the species name. */}
        {secondary && variant !== 'compact' && (
          <span className="tb-card-species">({secondary})</span>
        )}
        <span className="tb-card-types">
          {types.map((type, i) => (
            <span key={type}>
              {i > 0 && <span className="tb-type-sep">·</span>}
              <TypeLabel type={type} small />
            </span>
          ))}
        </span>
        {showMeta &&
          (variant === 'compact' ? (
            <span className="tb-card-meta">
              {abilityName(build.abilityId)} · {natureName(build.natureId)}
            </span>
          ) : (
            <span className="tb-card-meta">
              {natureName(build.natureId)} Nature &nbsp; {abilityName(build.abilityId)}
            </span>
          ))}
        {showMoves && (
          <>
            <span
              className="tb-card-spread num"
              data-testid={testId ? `${testId}-spread` : undefined}
            >
              {build.generation >= 3 ? (spread ?? '—') : (dvSpread ?? '—')}
            </span>
            <span className="tb-card-moves">
              {moves.map((row, i) => (
                <MoveLine key={i} row={row} testId={testId ? `${testId}-move-${i}` : undefined} />
              ))}
            </span>
          </>
        )}
      </span>
    </>
  )

  return (
    <div
      className={`tb-card tb-card-${variant}`}
      data-tb="member-card"
      data-testid={testId}
      data-build-id={build.id}
      data-species-id={build.speciesId}
      data-generation={build.generation}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {corners}
      {/*
        A CARD WITH NO `onOpen` IS NOT A BUTTON AT ALL -- it renders as a <span>.
        Rendering a DISABLED button instead produces markup React rejects: the
        Add-to-team picker draws each team row as a <button> and puts cards
        inside it, so an inner button would be a <button> nested in a <button>.
        A non-interactive card should also not be in the accessibility tree as a
        control, which a disabled button still is.
      */}
      {onOpen ? (
        <button
          type="button"
          className="tb-card-open"
          onClick={onOpen}
          data-testid={testId ? `${testId}-open` : undefined}
        >
          {body}
        </button>
      ) : (
        <span className="tb-card-open" data-inert="true">
          {body}
        </span>
      )}
      {footer}
    </div>
  )
}

/** The "nothing here yet" slot. Only the FIRST open slot gets an affordance. */
export function EmptySlot({
  children,
  testId,
  onDragOver,
  onDrop,
}: {
  children?: ReactNode
  testId?: string
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  return (
    <div
      className="tb-card tb-card-empty"
      data-tb="empty-slot"
      data-testid={testId}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
    </div>
  )
}
