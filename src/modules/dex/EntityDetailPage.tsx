import { IconArrowLeft } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { SpeciesCardGrid, type SpeciesCardEntry } from '../../components/SpeciesCardGrid'

/**
 * The detail page shared by the Movedex, the Abilitydex and the Breeding dex.
 *
 * All three answer the same shape of question -- here is one entity, here is what
 * it does, here are the species it applies to -- so all three render this. The
 * only thing that varies is whether the species are one grid or several labelled
 * sections, which is a prop.
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
  children,
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
  /** Extra blocks between the description and the species grids. */
  children?: ReactNode
}) {
  const populated = sections.filter((s) => s.entries.length > 0)

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
          />
        </section>
      ))}
    </div>
  )
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
