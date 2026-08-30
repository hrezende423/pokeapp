import { IconArrowLeft } from '@tabler/icons-react'
import { useDexSelection } from '../nav/navContext'
import { ScrollArea } from '../../components/ScrollArea'
import { SpeciesDetail } from './SpeciesDetail'
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
 * three columns of ghost cards, the whole page. Something selected -> the
 * existing 240px rail beside the detail view, untouched by this pass; Figma
 * splits these across separate MainPage and DetailPage frames, and DetailPage's
 * own retrofit is not in scope here.
 *
 * Both states render the same SpeciesList component, so the generation scope and
 * the filter controls cannot diverge between them.
 *
 * The selected species lives in the nav context rather than in a route: deep
 * links need a router, which is not worth pulling in yet, but the global search
 * has to be able to open a species from another tab, which local state cannot
 * serve. The selection intentionally survives a version-group change so switching
 * games updates an open detail view in place.
 */
export function Pokedex() {
  const [selectedId, setSelectedId] = useDexSelection('pokedex')
  const browsing = selectedId == null

  return (
    <div className="pokedex">
      {/*
        No page header. The title, the generation/version subtitle and the
        species count are all gone -- the Figma MainPage frames never showed
        them, so the grid sitting directly under the app bar's own hairline is
        the reference, not a departure from it.

        The way back from a detail view still needs somewhere to live, so it
        renders on its own when something is selected. Figma puts an
        "icon-page-back" instance at the top-left of both DetailPage frames.
      */}
      {!browsing && (
        <div className="pokedex-back-row">
          <button
            type="button"
            className="pokedex-back"
            data-testid="back-to-grid"
            onClick={() => setSelectedId(null)}
          >
            <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
            All species
          </button>
        </div>
      )}

      {/*
        Each pane scrolls itself, and the page does not scroll at all. In the
        detail state that means TWO independent scroll areas side by side: the
        240px species rail and the detail column are different lengths, and
        making the page scroll both together was what previously forced the
        rail to be sticky and height-capped.

        The scroll-down indicator and the back-to-top control come from
        ScrollArea, so the grid keeps the affordance it already had -- built for
        exactly this -- and every other pane gains the same one.
      */}
      {browsing ? (
        <div className="pokedex-body pokedex-body-grid">
          <ScrollArea testId="pokedex-grid-scroll-area">
            <div className="pokedex-grid-wrap">
              <SpeciesList selectedId={selectedId} onSelect={setSelectedId} layout="grid" />
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="pokedex-body">
          <ScrollArea
            className="species-list-scroll"
            testId="pokedex-rail-scroll-area"
            hint={false}
          >
            <SpeciesList selectedId={selectedId} onSelect={setSelectedId} />
          </ScrollArea>
          <ScrollArea testId="pokedex-detail-scroll-area">
            <div className="pokedex-detail">
              {/* Keyed by species so the artwork toggles remount: each species
                  opens on regular static artwork rather than inheriting the
                  previous one's source/colour/motion/gender state. */}
              <SpeciesDetail
                key={selectedId}
                speciesId={selectedId}
                onSelectSpecies={setSelectedId}
              />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
