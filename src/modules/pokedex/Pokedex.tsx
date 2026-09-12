import { useDexSelection, useNav } from '../nav/navContext'
import { ScrollArea } from '../../components/ScrollArea'
import { scrollKey } from '../../components/scrollMemory'
import { useFilters } from '../filters/filtersContext'
import { useVersionGroup } from '../version-group/context'
import { SpeciesDetailPage } from './SpeciesDetailPage'
import { SpeciesList } from './SpeciesList'
// The grid card's type row is the validated TypeLabel/TypeRow pair, whose styles
// live in the design-system sheet. Imported here so the Pokedex does not depend
// on the design-system tab happening to be in the bundle.
import '../../components/ds/ds.css'
import './pokedex.css'

/**
 * Pokedex shell, in the two states the reference frames describe.
 *
 * Nothing selected -> the browse grid (Figma MainPage-Light / MainPage-Dark):
 * three columns of ghost cards, the whole page. Something selected -> the rebuilt
 * species detail page (Figma DetailPage), which owns its own two-column split.
 *
 * Both states render the same SpeciesList component, so the generation scope and
 * the filter controls cannot diverge between them.
 *
 * THE ?detail FLAG AND THE OLD RAIL-PLUS-DETAIL VIEW ARE GONE. The flag existed
 * while the new page was being built a step at a time; it came out once the last
 * of its four tabs landed and the old page's one unique feature -- the four-axis
 * artwork control -- was folded into the Sprites tab rather than dropped. With
 * that done there was nothing the old view could show that this one cannot, so
 * SpeciesDetail, Learnset, Encounters and TypeEffectiveness were deleted rather
 * than left as a second, unreachable answer to the same question.
 *
 * The selected species lives in the nav context rather than in a route: deep
 * links need a router, which is not worth pulling in yet, but the global search
 * has to be able to open a species from another tab, which local state cannot
 * serve. The selection intentionally survives a version-group change so switching
 * games updates an open detail view in place.
 */
export function Pokedex() {
  const [selectedId, setSelectedId] = useDexSelection('pokedex')
  const nav = useNav()
  const browsing = selectedId == null

  /*
    WHERE THE GRID WAS LEFT, keyed by what the grid was SHOWING.

    Opening a species unmounts the grid -- `browsing` flips and the whole
    scroller goes -- so returning to it is a fresh mount every time and there is
    nothing local left to remember the offset. scrollMemory.ts holds it outside
    React for that reason.

    THE FILTER STATE IS PART OF THE KEY, and that is the whole invalidation
    story: a different generation, search term or type filter is a different key,
    so it opens at the top rather than at an offset measured against a list that
    no longer exists. Restoring a clamped offset into a filtered list would put
    the reader somewhere they had never been. Two contexts are read here purely
    to compose this -- the grid itself is filtered inside SpeciesList, which
    calls the same two.
  */
  const { generation, isAll } = useVersionGroup()
  const { search, typeFilter } = useFilters()
  const gridKey = scrollKey(
    'pokedex-grid',
    generation,
    isAll,
    search.trim().toLowerCase(),
    [...typeFilter].sort((a, b) => a - b).join('.'),
  )

  return (
    <div className="pokedex">
      {/*
        No page header. The title, the generation/version subtitle and the
        species count are all gone -- the Figma MainPage frames never showed
        them, so the grid sitting directly under the app bar's own hairline is
        the reference, not a departure from it.

        The way back from a detail view lives inside the detail page's pinned
        column, where Figma puts its "icon-page-back" instance, so there is no
        back row here.
      */}
      {browsing ? (
        <div className="pokedex-body pokedex-body-grid">
          {/*
            The grid scrolls itself and the page does not scroll at all. The
            scroll-down indicator and the back-to-top control come from
            ScrollArea, which was built for exactly this.
          */}
          <ScrollArea testId="pokedex-grid-scroll-area" memoryKey={gridKey}>
            <div className="pokedex-grid-wrap">
              <SpeciesList selectedId={selectedId} onSelect={setSelectedId} layout="grid" />
            </div>
          </ScrollArea>
        </div>
      ) : (
        /* NOT wrapped in .pokedex-body or a ScrollArea: the page owns its own
           two-column split and its own single scroll area, and either wrapper
           would add a second scrolling ancestor and break the pinning.

           Keyed by species so the artwork view remounts -- each species opens on
           regular static artwork rather than inheriting the previous one's
           source/colour/motion/gender state. */
        <SpeciesDetailPage
          key={selectedId}
          speciesId={selectedId}
          onBack={() => setSelectedId(null)}
          onSelectSpecies={setSelectedId}
          onSelectEggGroup={(id) => nav.navigate('breedingdex', id)}
          /* Pokedex > species > move page, which is the flow the back stack was
             built for. `navigate` is the same one-update cross-module jump the
             egg groups and the global search use -- and it records the step, so
             one back press returns to the species and the next to the grid. */
          onSelectMove={(id) => nav.navigate('movedex', id)}
        />
      )}
    </div>
  )
}
