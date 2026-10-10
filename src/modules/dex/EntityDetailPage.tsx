import { IconArrowLeft } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { SpeciesCardGrid, type SpeciesCardEntry } from '../../components/SpeciesCardGrid'
import type { SpeciesCardFooter } from '../../components/speciesCardFooters'
import { LedgerRow } from '../../components/ds/LedgerRow'
import type { KeyValueItem } from '../../components/ds/KeyValueList'
import {
  DEFAULT_ARTWORK_VIEW,
  getType,
  resolveArtworkUrl,
  resolveTypesForGeneration,
} from '../../data'
import {
  EditorialBack,
  EditorialGroup,
  EditorialHead,
  EditorialLead,
  EditorialPage,
} from './EditorialDetail'

/**
 * The detail page shared by the Movedex, the Abilitydex and the Breeding dex.
 *
 * All three answer the same shape of question -- here is one entity, here is what
 * it does, here are the species it applies to -- so all three render this. The
 * only thing that varies is whether the species are one grid or several labelled
 * sections, which is a prop.
 *
 * TWO LAYOUTS, BY FLAG (owner, 2026-10-10). `variant="editorial"` is the
 * structure the reference dexes moved to -- see EditorialDetail.tsx: identity,
 * an optional ghost, a key-value strip of headline numbers, the description as
 * the lead text, and the species as plain grouped lists rather than the card
 * grid. The Breeding dex keeps the original `grid` layout on this same
 * component, unchanged, by not passing the flag; it was deliberately not forked.
 *
 * Sections with no entries are dropped before rendering, not rendered empty: a
 * move with no tutor in the selected generation shows no "Move tutor" heading at
 * all. That is why `sections` is filtered here rather than at each call site --
 * three call sites would be three chances to forget.
 */

export interface SpeciesSection {
  /** Small uppercase label, e.g. "Level up". Omit for a single unlabelled grid. */
  label?: string
  entries: SpeciesCardEntry[]
}

export function EntityDetailPage({
  entryId,
  onBack,
  backLabel,
  title,
  titleTestId,
  meta,
  description,
  sections,
  generation,
  onSelectSpecies,
  testId,
  footer,
  children,
  variant = 'grid',
  ghost,
  strip,
  stripTestId,
  sectionsLabel = 'Pokémon',
}: {
  /**
   * The open entry's id, mirrored onto the root as data-entry-id. The lifted
   * selection is what makes "the search opened this, and it is still open"
   * observable, and reading it off the page is how that is checked.
   */
  entryId: number
  onBack: () => void
  backLabel: string
  title: string
  /**
   * Extra test id on the name, for a dex whose own suite addresses it by a
   * dex-specific id. "entity-name" is always present too, so a check that wants
   * "the shared template's name" and one that wants "the move's name" both work.
   */
  titleTestId?: string
  /** One line under the name: type, category, counts. */
  meta?: ReactNode
  description?: ReactNode
  sections: SpeciesSection[]
  generation: number
  onSelectSpecies: (id: number) => void
  testId: string
  /**
   * Overrides the card's bottom line for every grid on this page. The Breeding
   * dex shows egg groups there instead of abilities. Grid variant only.
   */
  footer?: SpeciesCardFooter
  /** Extra blocks between the description and the species grids. */
  children?: ReactNode
  /** `editorial` opts a dex into the new structure; `grid` is the original. */
  variant?: 'grid' | 'editorial'
  /** Editorial only: the ghost text beside the head. */
  ghost?: string | null
  /** Editorial only: the headline numbers. */
  strip?: KeyValueItem[]
  stripTestId?: string
  /** Editorial only: the heading of a single unlabelled section. */
  sectionsLabel?: string
}) {
  const populated = sections.filter((s) => s.entries.length > 0)

  if (variant === 'editorial') {
    return (
      <EditorialPage testId={testId} entryId={entryId}>
        <EditorialBack label={backLabel} onBack={onBack} />
        <EditorialHead
          title={title}
          titleTestId={titleTestId}
          identity={meta}
          ghost={ghost}
          strip={strip}
          stripTestId={stripTestId}
        />
        {description && <EditorialLead testId="entity-description">{description}</EditorialLead>}
        {children}
        {populated.map((section, i) => (
          <EditorialGroup
            key={section.label ?? `section-${i}`}
            label={section.label ?? sectionsLabel}
            count={section.entries.length}
            testId={`entity-section-${slug(section.label ?? 'species')}`}
          >
            <SpeciesGroupList
              entries={section.entries}
              generation={generation}
              onSelect={onSelectSpecies}
              testId={`entity-list-${slug(section.label ?? 'species')}`}
            />
          </EditorialGroup>
        ))}
      </EditorialPage>
    )
  }

  return (
    <div className="entity-detail" data-testid={testId} data-entry-id={entryId}>
      <div className="pokedex-back-row">
        <button type="button" className="pokedex-back" data-testid="entity-back" onClick={onBack}>
          <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
          {backLabel}
        </button>
      </div>

      <h2 className="entity-detail-name" data-testid="entity-name">
        {titleTestId ? <span data-testid={titleTestId}>{title}</span> : title}
      </h2>
      {meta && (
        <p className="entity-detail-meta" data-testid="entity-meta">
          {meta}
        </p>
      )}
      {description && (
        <p className="entity-detail-desc" data-testid="entity-description">
          {description}
        </p>
      )}

      {children}

      {populated.map((section, i) => (
        <section
          key={section.label ?? `section-${i}`}
          className="entity-detail-section"
          data-testid={`entity-section-${slug(section.label ?? 'species')}`}
        >
          {section.label && (
            <h3 className="entity-detail-section-label">
              {section.label}
              <span className="entity-detail-section-count">{section.entries.length}</span>
            </h3>
          )}
          <SpeciesCardGrid
            entries={section.entries}
            generation={generation}
            onSelect={onSelectSpecies}
            testId={`entity-grid-${slug(section.label ?? 'species')}`}
            testIdPrefix="entity-species"
            footer={footer}
          />
        </section>
      ))}
    </div>
  )
}

/**
 * The species of one group as plain rows: sprite, name, generation-correct
 * types, and the card's badge (a learn level) as a trailing muted value. The
 * card grid's ghost number, katakana and ability line are not carried over --
 * on these pages the species is related data, not the subject.
 */
function SpeciesGroupList({
  entries,
  generation,
  onSelect,
  testId,
}: {
  entries: SpeciesCardEntry[]
  generation: number
  onSelect: (id: number) => void
  testId: string
}) {
  return (
    <ul className="ds-ledger-list dex-ed-list" data-testid={testId}>
      {entries.map(({ species, badge }) => {
        const variety = species.varieties.find((v) => v.is_default) ?? species.varieties[0]
        const types = resolveTypesForGeneration(variety, generation)
          .map((t) => getType(t.type_id)?.name ?? '')
          .filter(Boolean)
        return (
          <li key={species.id} data-species-id={species.id}>
            <LedgerRow
              variant="plain"
              dexNumber={species.id}
              name={species.display_name}
              types={types}
              spriteUrl={resolveArtworkUrl(species, variety, DEFAULT_ARTWORK_VIEW)}
              aside={badge}
              onClick={() => onSelect(species.id)}
            />
          </li>
        )
      })}
    </ul>
  )
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
