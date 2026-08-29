import { IconArrowLeft } from '@tabler/icons-react'
import { useDexSelection } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import { ScrollDownHint } from './ScrollDownHint'
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
  const { versionGroup, generation, isAll } = useVersionGroup()
  const browsing = selectedId == null

  return (
    <div className="pokedex">
      <header className="pokedex-head">
        <div>
          <h1>Pokédex</h1>
          <p className="subtitle" data-testid="scope-note">
            {isAll
              ? 'All generations · national dex'
              : `Generation ${generation} · ${versionGroup?.name ?? ''}`}
          </p>
        </div>
        {/* The way back to the grid. Figma puts an "icon-page-back" instance at
            the top-left of both DetailPage frames; this is the same affordance
            kept inside the page header, so the detail view itself stays
            untouched by this pass. */}
        {!browsing && (
          <button
            type="button"
            className="pokedex-back"
            data-testid="back-to-grid"
            onClick={() => setSelectedId(null)}
          >
            <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
            All species
          </button>
        )}
      </header>

      {browsing ? (
        <div className="pokedex-body pokedex-body-grid">
          <div className="pokedex-grid-wrap">
            <SpeciesList selectedId={selectedId} onSelect={setSelectedId} layout="grid" />
            <ScrollDownHint />
          </div>
        </div>
      ) : (
        <div className="pokedex-body">
          <SpeciesList selectedId={selectedId} onSelect={setSelectedId} />
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
        </div>
      )}
    </div>
  )
}
