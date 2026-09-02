import { useMemo } from 'react'
import { TypeRow } from '../../components/ds/TypeLabel'
import { getType, resolveTypesForGeneration } from '../../data'
import type { Species, Variety } from '../../data'

/**
 * The species page's persistent banner: dex number, name, genus, type row.
 *
 * THIS IS PAGE CHROME, NOT TAB CONTENT, and that is the whole point of the
 * component existing. It is rendered once by SpeciesDetailPage, outside the tab
 * switch and outside the scroll region, so switching tabs cannot unmount it,
 * re-render it, or scroll it away. Punch-list item 5 -- "the sub-nav renders above
 * the name/types/genus header instead of below it" -- had no fix while this
 * element did not exist: the name was in the LEFT column and the types were inside
 * the Info tab, so there was no single stacking order to reorder. There is one now,
 * and the sub-nav sits under this block.
 *
 * GENUS BELONGS HERE. It was showing in the left column, where the frame never put
 * it (punch-list item 4). Figma node `genus` (57:745) is a child of
 * container-poke-name, on the same row as the name and to its right.
 *
 * Figma frame 57:730, node container-poke-name 57:733, 1115 x 159 raw:
 *
 *   node            id        x    y    w    h
 *   number          57:744    0    10   133  38
 *   Name-main       57:734    0    41   408  82
 *   genus           57:745    319  41   422  86
 *   group-TypeText  57:735    -1   126  307  29
 *
 * Three stacked rows, with the genus sharing the name's row. The name and genus
 * boxes overlap in the frame (the name box is 408 wide but the genus starts at
 * 319), which is the tell that neither is tight -- so this is a baseline-aligned
 * flex row with a real gap rather than two absolutely-placed boxes, which would
 * collide on a long name.
 *
 * TYPES ARE ERA-RESOLVED, through the same resolveTypesForGeneration every other
 * type display uses. They moved here from inside the Info tab, so the app's
 * generation selector still drives them -- and now they are visible on all four
 * tabs instead of only one.
 */
export function SpeciesBanner({
  species,
  variety,
  generation,
}: {
  species: Species
  variety: Variety | undefined
  generation: number
}) {
  const typeNames = useMemo(() => {
    if (!variety) return []
    return resolveTypesForGeneration(variety, generation)
      .map((t) => getType(t.type_id)?.name)
      .filter((n): n is string => n != null)
  }, [variety, generation])

  return (
    <header className="species-banner" data-testid="species-banner" data-species-id={species.id}>
      <span className="species-banner-number num" data-testid="species-banner-number">
        #{String(species.id).padStart(4, '0')}
      </span>

      <div className="species-banner-title">
        <h2 className="species-banner-name" data-testid="species-banner-name">
          {species.display_name}
        </h2>
        {species.genus && (
          <p className="species-banner-genus" data-testid="species-banner-genus">
            {species.genus}
          </p>
        )}
      </div>

      <div className="species-banner-types" data-testid="species-banner-types">
        <TypeRow types={typeNames} />
      </div>
    </header>
  )
}
