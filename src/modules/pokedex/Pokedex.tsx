import { useDexSelection } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import { SpeciesDetail } from './SpeciesDetail'
import { SpeciesList } from './SpeciesList'
import './pokedex.css'

/**
 * Pokedex shell: a fixed-width species list on the left, detail on the right.
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
      </header>

      <div className="pokedex-body">
        <SpeciesList selectedId={selectedId} onSelect={setSelectedId} />
        <div className="pokedex-detail">
          {selectedId == null ? (
            <p className="subtitle" data-testid="no-selection">
              Select a species to see its details.
            </p>
          ) : (
            /* Keyed by species so the artwork toggles remount: each species
               opens on regular static artwork rather than inheriting the
               previous one's source/colour/motion/gender state. */
            <SpeciesDetail
              key={selectedId}
              speciesId={selectedId}
              onSelectSpecies={setSelectedId}
            />
          )}
        </div>
      </div>
    </div>
  )
}
