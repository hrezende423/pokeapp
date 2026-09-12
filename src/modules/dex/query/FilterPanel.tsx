import { IconRestore } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { TextField } from '../../../components/ds/TextField'
import { Toggle } from '../../../components/ds/Toggle'
import { FormSectionLabel } from '../../../components/ds/Navigation'
import { TypeFilter } from '../../../components/TypeFilter'
import {
  asBool,
  asNumbers,
  asRange,
  asStrings,
  asText,
  optionsOf,
  type DexFilter,
  type FilterSection,
} from './dexQuery'
import type { DexQuery } from './useDexQuery'

/**
 * Every dex's filter panel, rendered from its config.
 *
 * ONE IMPLEMENTATION OF EACH CONTROL, which is the whole reason the filters are
 * data. A dex that drew its own inputs would eventually draw a bordered one; here
 * a text filter is always the hairline-underline `TextField`, a multi-select is
 * always the middot ghost-button row from the design system's search/filter
 * pattern -- no chip, no pill, no border -- and the type filter is always the
 * shared `TypeFilter` with its per-type colour, which is the one sanctioned
 * bordered control and is reused exactly as the Pokedex and Movedex ship it.
 *
 * LAYOUT, locked at the mockup review:
 *
 *   name search              always first, always visible
 *   the page's primary filter(s)
 *   More filters             a nested disclosure, collapsed by default
 *   Clear all filters        one action at the bottom
 *
 * and one reset icon per section, clearing only that section. The icon is
 * DISABLED rather than hidden while its section is untouched: a control that
 * appears when you happen to have used the thing above it is a control nobody
 * finds, and greying it out says "this is where you undo that" the whole time.
 *
 * THE SECTION HEADER IS THE FIELD'S NAME when a section holds exactly one filter
 * -- the field's own label is suppressed rather than printed a second line below
 * an identical one. It stays in the DOM for assistive tech; see TextField.
 */
export function FilterPanel<T>({
  dexId,
  sections,
  query,
  footer,
}: {
  dexId: string
  sections: FilterSection<T>[]
  query: DexQuery<T>
  /** Rendered under "Clear all filters", e.g. a count readout. */
  footer?: ReactNode
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const visibleSections = sections.filter((s) => s.filters.some((f) => !f.hidden))
  const primary = visibleSections.filter((s) => !s.more)
  const more = visibleSections.filter((s) => s.more)

  const renderSection = (section: FilterSection<T>) => (
    <Section key={section.id} dexId={dexId} section={section} query={query} />
  )

  return (
    <div className="dex-filter-panel-body" data-testid={`${dexId}-filter-body`}>
      {primary.map(renderSection)}

      {more.length > 0 && (
        <div className="dex-filter-more" data-open={moreOpen} data-testid={`${dexId}-filter-more`}>
          <button
            type="button"
            className="ghost-button dex-filter-more-toggle"
            data-testid={`${dexId}-filter-more-toggle`}
            aria-expanded={moreOpen}
            aria-controls={`${dexId}-filter-more-panel`}
            // The accent marks a binary state, the same use the two outer
            // triggers make of it: something is hidden in here and it is on.
            data-filters-active={more.some((s) => query.sectionIsActive(s.id))}
            onClick={() => setMoreOpen((v) => !v)}
          >
            More filters
          </button>
          <div
            className="dex-filter-more-panel"
            id={`${dexId}-filter-more-panel`}
            data-testid={`${dexId}-filter-more-panel`}
          >
            {more.map(renderSection)}
          </div>
        </div>
      )}

      <button
        type="button"
        className="ghost-button dex-filter-clear"
        data-testid={`${dexId}-filter-clear`}
        disabled={query.activeCount === 0}
        onClick={query.clearAll}
      >
        Clear all filters
      </button>

      {footer}
    </div>
  )
}

function Section<T>({
  dexId,
  section,
  query,
}: {
  dexId: string
  section: FilterSection<T>
  query: DexQuery<T>
}) {
  const filters = section.filters.filter((f) => !f.hidden)
  const active = query.sectionIsActive(section.id)
  const single = filters.length === 1

  return (
    <div
      className="dex-filter-section"
      data-testid={`${dexId}-filter-section-${section.id}`}
      data-active={active}
    >
      <div className="dex-filter-section-head">
        <FormSectionLabel>{section.label}</FormSectionLabel>
        <button
          type="button"
          className="dex-filter-reset"
          data-testid={`${dexId}-filter-reset-${section.id}`}
          aria-label={`Clear ${section.label} filter${single ? '' : 's'}`}
          title={`Clear ${section.label}`}
          disabled={!active}
          onClick={() => query.resetSection(section.id)}
        >
          <IconRestore size={14} stroke={1.5} aria-hidden focusable="false" />
        </button>
      </div>
      {filters.map((filter) => (
        <div key={filter.key} className="dex-filter-slot">
          <Control dexId={dexId} filter={filter} query={query} hideLabel={single} />
          {filter.note && (
            <p
              className="dex-filter-note"
              data-testid={`${dexId}-filter-note-${filter.key}`}
              data-stub={filter.stub === true}
            >
              {filter.note}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function Control<T>({
  dexId,
  filter,
  query,
  hideLabel,
}: {
  dexId: string
  filter: DexFilter<T>
  query: DexQuery<T>
  hideLabel: boolean
}) {
  const id = filter.testId ?? `${dexId}-filter-${filter.key}`
  const value = query.values[filter.key]

  switch (filter.kind) {
    case 'text':
      return (
        <TextField
          label={filter.label}
          hideLabel={hideLabel}
          placeholder={filter.placeholder ?? 'Search by name…'}
          data-testid={id}
          value={asText(value)}
          onChange={(e) => query.setValue(filter.key, e.target.value)}
        />
      )

    case 'select':
      return (
        <SelectField
          label={filter.label}
          hideLabel={hideLabel}
          data-testid={id}
          value={asText(value)}
          options={[
            { value: '', label: filter.anyLabel ?? 'Any' },
            ...optionsOf(filter.options, query.values),
          ]}
          onChange={(e) => query.setValue(filter.key, e.target.value)}
        />
      )

    case 'multi': {
      const selected = asStrings(value)
      const options = optionsOf(filter.options, query.values)
      return (
        <div className="dex-filter-field">
          {!hideLabel && <span className="ds-field-label">{filter.label}</span>}
          {/* The design system's filter row: plain text separated by a middot,
              no chip and no pill container. Deliberately not a button group. */}
          <div
            className="ds-filters dex-filter-multi"
            role="group"
            aria-label={filter.label}
            data-testid={id}
          >
            {options.map((option, i) => {
              const on = selected.includes(option.value)
              return (
                <span key={option.value}>
                  {i > 0 && (
                    <span className="ds-filter-sep" aria-hidden>
                      ·
                    </span>
                  )}
                  <button
                    type="button"
                    className="ds-filter"
                    data-testid={`${id}-${option.value}`}
                    aria-pressed={on}
                    onClick={() =>
                      query.setValue(
                        filter.key,
                        on
                          ? selected.filter((v) => v !== option.value)
                          : [...selected, option.value],
                      )
                    }
                  >
                    {option.label}
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )
    }

    case 'types':
      return (
        <div className="dex-filter-field" data-testid={id}>
          {!hideLabel && <span className="ds-field-label">{filter.label}</span>}
          <TypeFilter
            available={filter.available}
            selected={asNumbers(value)}
            onChange={(next) => query.setValue(filter.key, next)}
            testIdPrefix={filter.testIdPrefix}
            label={filter.label}
          />
        </div>
      )

    case 'toggle':
      return (
        <div className="dex-filter-field" data-testid={id}>
          <Toggle
            on={asBool(value)}
            label={filter.label}
            onChange={(next) => query.setValue(filter.key, next)}
          />
        </div>
      )

    case 'range': {
      const range = asRange(value)
      const set = (part: 'min' | 'max', next: string) =>
        query.setValue(filter.key, { ...range, [part]: next })
      return (
        <div className="dex-filter-field dex-filter-range" data-testid={id}>
          {!hideLabel && <span className="ds-field-label">{filter.label}</span>}
          <span className="dex-filter-range-row">
            <input
              className="ds-field-control"
              type="number"
              inputMode="decimal"
              step={filter.step ?? 1}
              // The real extent of the data, so the reader is typing against a
              // scale rather than guessing one.
              placeholder={String(filter.bounds.min)}
              aria-label={`${filter.label} minimum`}
              data-testid={`${id}-min`}
              value={range.min}
              onChange={(e) => set('min', e.target.value)}
            />
            <span className="dex-filter-range-sep" aria-hidden>
              –
            </span>
            <input
              className="ds-field-control"
              type="number"
              inputMode="decimal"
              step={filter.step ?? 1}
              placeholder={String(filter.bounds.max)}
              aria-label={`${filter.label} maximum`}
              data-testid={`${id}-max`}
              value={range.max}
              onChange={(e) => set('max', e.target.value)}
            />
            {filter.unit && <span className="move-unit">{filter.unit}</span>}
          </span>
        </div>
      )
    }
  }
}
