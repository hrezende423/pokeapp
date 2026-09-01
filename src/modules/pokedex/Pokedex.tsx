import { useDexSelection, useNav } from '../nav/navContext'
import { ScrollArea } from '../../components/ScrollArea'
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
          <ScrollArea testId="pokedex-grid-scroll-area">
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
        />
      )}
    </div>
  )
}
