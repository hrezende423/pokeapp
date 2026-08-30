import { TypeRow } from './ds/TypeLabel'
import { abilitiesFooter, type SpeciesCardFooter } from './speciesCardFooters'
import {
  DEFAULT_ARTWORK_VIEW,
  getType,
  resolveArtworkUrl,
  resolveTypesForGeneration,
} from '../data'
import type { Species } from '../data'

/**
 * The Pokedex grid card, as one component with several call sites.
 *
 * It was inline in SpeciesList; the Movedex, Abilitydex and Breeding dex detail
 * pages all needed the same card for a SUBSET of species, so the markup moved
 * here rather than being reproduced three more times. SpeciesList now renders
 * this too, which is what keeps the uses identical -- a change to the card lands
 * in one place and the Figma-measured geometry cannot drift between them.
 *
 * Era correctness stays inside the component: types and abilities resolve through
 * the same generation-aware helpers the species page uses, so a card in a move's
 * learner list shows the same typing the Pokedex would for the same generation.
 *
 * THE FOOTER LINE IS A VARIANT, NOT A FORK. The bottom line is the species'
 * abilities by default; the Breeding dex needs its egg groups there instead, with
 * each group navigable. That is the `footer` prop -- a render function handed the
 * species -- rather than a second card component that would look the same on the
 * day it was written and drift afterwards.
 *
 * WHY THE CARD IS A DIV WITH AN OVERLAY BUTTON, and not a <button> as it was: the
 * egg-group variant puts real controls in the footer, and an interactive element
 * inside a <button> is invalid and unreachable by keyboard. So the card is a
 * plain element carrying the geometry and the test id, and the primary action is
 * a transparent button stretched across it, sitting UNDER the footer in z-order.
 * A pointer or a Playwright click at the card's centre still lands on that
 * button, and the footer's own controls stay focusable in their own right.
 */

/** The default form is what a card shows; alternate forms live in the detail view. */
function defaultVariety(species: Species) {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

export interface SpeciesCardEntry {
  species: Species
  /**
   * Optional corner badge, e.g. "Lv.36" on a move's level-up learners. Only the
   * level-up section sets one: for TM, egg and tutor the section label already
   * says everything about how the species learns it.
   */
  badge?: string
}

export function SpeciesCard({
  entry,
  generation,
  selected = false,
  onSelect,
  testIdPrefix = 'species',
  footer = abilitiesFooter,
}: {
  entry: SpeciesCardEntry
  generation: number
  selected?: boolean
  onSelect: (id: number) => void
  /** Distinguishes the Pokedex grid's cards from a detail page's subset grid. */
  testIdPrefix?: string
  footer?: SpeciesCardFooter
}) {
  const { species, badge } = entry
  const variety = defaultVariety(species)
  const typeIds = resolveTypesForGeneration(variety, generation).map((t) => t.type_id)
  const art = resolveArtworkUrl(species, variety, DEFAULT_ARTWORK_VIEW)

  return (
    <div
      data-testid={`${testIdPrefix}-row-${species.id}`}
      data-species-id={species.id}
      aria-current={selected}
      className="species-card"
    >
      {/* The primary action, stretched over the whole card. Labelled rather than
          empty, since it has no text of its own. */}
      <button
        type="button"
        className="species-card-hit"
        data-testid={`${testIdPrefix}-open-${species.id}`}
        aria-label={species.display_name}
        onClick={() => onSelect(species.id)}
      />
      {/* Centred on the card and flush with its top, per Figma's shadow-number
          node -- not bleeding off a corner. Three digits, against the four in
          the line below it. */}
      <span className="species-card-ghost" aria-hidden>
        {String(species.id).padStart(3, '0')}
      </span>
      {badge && (
        <span className="species-card-badge" data-testid={`species-card-badge-${species.id}`}>
          {badge}
        </span>
      )}
      {art && (
        <img
          className="species-card-art"
          src={art}
          alt=""
          loading="lazy"
          data-testid={`species-card-art-${species.id}`}
        />
      )}
      <span className="species-card-text">
        <span className="species-card-line">
          <span className="dex-no">#{String(species.id).padStart(4, '0')}</span>
          <span className="species-name">{species.display_name}</span>
        </span>
        <span className="species-card-types">
          <TypeRow types={typeIds.map((id) => getType(id)?.name ?? '').filter(Boolean)} small />
        </span>
        {footer(species, generation)}
      </span>
    </div>
  )
}

export function SpeciesCardGrid({
  entries,
  generation,
  selectedId = null,
  onSelect,
  testId,
  testIdPrefix,
  emptyNote,
  footer,
}: {
  entries: SpeciesCardEntry[]
  generation: number
  selectedId?: number | null
  onSelect: (id: number) => void
  testId: string
  testIdPrefix?: string
  emptyNote?: string
  /** Overrides the abilities line on every card in this grid. */
  footer?: SpeciesCardFooter
}) {
  return (
    <ul className="pokedex-grid" data-testid={testId}>
      {entries.map((entry) => (
        <li key={entry.species.id}>
          <SpeciesCard
            entry={entry}
            generation={generation}
            selected={selectedId === entry.species.id}
            onSelect={onSelect}
            testIdPrefix={testIdPrefix}
            footer={footer}
          />
        </li>
      ))}
      {entries.length === 0 && emptyNote && (
        <li className="empty" data-testid={`${testId}-empty`}>
          {emptyNote}
        </li>
      )}
    </ul>
  )
}
