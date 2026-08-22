import { useState } from 'react'
import { VersionGroupSelector } from '../version-group/VersionGroupSelector'
import { useVersionGroup } from '../version-group/context'
import { SpeciesDetail } from './SpeciesDetail'
import { SpeciesList } from './SpeciesList'
import './pokedex.css'

/**
 * Pokedex shell: master list on the left, detail on the right.
 *
 * The selected species is plain component state rather than a route. Deep links
 * need a router, which is not worth pulling in for one view yet; the selection
 * intentionally survives a version-group change so switching games updates an
 * open detail view in place.
 */
export function Pokedex() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { versionGroup, generation } = useVersionGroup()

  return (
    <div className="pokedex">
      <header className="pokedex-head">
        <div>
          <h1>Pokédex</h1>
          <p className="subtitle" data-testid="scope-note">
            Generation {generation} · {versionGroup.name}
          </p>
        </div>
        <VersionGroupSelector />
      </header>

      <div className="pokedex-body">
        <SpeciesList selectedId={selectedId} onSelect={setSelectedId} />
        <div className="pokedex-detail">
          {selectedId == null ? (
            <p className="subtitle" data-testid="no-selection">
              Select a species to see its details.
            </p>
          ) : (
            <SpeciesDetail speciesId={selectedId} />
          )}
        </div>
      </div>
    </div>
  )
}
