import { getItem, getLocation, getMove, getSpecies, getType } from '../../data'
import type { EvolutionDetail, EvolutionNode } from '../../data'

/**
 * Render one evolution requirement as a readable clause.
 *
 * Every non-null field is surfaced rather than reduced to just the level, because
 * the interesting Gen 2-4 methods are the compound ones: Espeon needs friendship
 * *and* daytime, Leafeon needs a specific location, Mantyke needs a party member.
 */
function describe(detail: EvolutionDetail): string {
  const parts: string[] = []

  switch (detail.trigger) {
    case 'level-up':
      parts.push(detail.min_level != null ? `Level ${detail.min_level}` : 'Level up')
      break
    case 'use-item':
      parts.push(`Use ${getItem(detail.item_id ?? -1)?.display_name ?? 'an item'}`)
      break
    case 'trade':
      parts.push('Trade')
      break
    case 'shed':
      parts.push('Shed (empty party slot + Poke Ball)')
      break
    default:
      parts.push(detail.trigger ?? 'Unknown')
  }

  if (detail.held_item_id != null) {
    parts.push(`holding ${getItem(detail.held_item_id)?.display_name ?? 'an item'}`)
  }
  if (detail.min_happiness != null) parts.push(`friendship ${detail.min_happiness}+`)
  if (detail.min_beauty != null) parts.push(`beauty ${detail.min_beauty}+`)
  if (detail.min_affection != null) parts.push(`affection ${detail.min_affection}+`)
  if (detail.time_of_day) parts.push(`during the ${detail.time_of_day}`)
  if (detail.location_id != null) {
    parts.push(`at ${getLocation(detail.location_id)?.display_name ?? 'a location'}`)
  }
  if (detail.known_move_id != null) {
    parts.push(`knowing ${getMove(detail.known_move_id)?.display_name ?? 'a move'}`)
  }
  if (detail.known_move_type_id != null) {
    parts.push(`knowing a ${getType(detail.known_move_type_id)?.name ?? ''} move`)
  }
  if (detail.party_species_id != null) {
    parts.push(`with ${getSpecies(detail.party_species_id)?.display_name ?? 'a species'} in party`)
  }
  if (detail.trade_species_id != null) {
    parts.push(`traded for ${getSpecies(detail.trade_species_id)?.display_name ?? 'a species'}`)
  }
  if (detail.party_type_id != null) {
    parts.push(`with a ${getType(detail.party_type_id)?.name ?? ''} type in party`)
  }
  if (detail.relative_physical_stats != null) {
    const rel =
      detail.relative_physical_stats > 0
        ? 'Attack > Defense'
        : detail.relative_physical_stats < 0
          ? 'Attack < Defense'
          : 'Attack = Defense'
    parts.push(rel)
  }
  if (detail.gender != null) parts.push(detail.gender === 1 ? 'female only' : 'male only')
  if (detail.needs_overworld_rain) parts.push('while raining')
  if (detail.turn_upside_down) parts.push('holding the console upside down')

  return parts.join(', ')
}

function Node({
  node,
  currentId,
  depth,
}: {
  node: EvolutionNode
  currentId: number
  depth: number
}) {
  const species = getSpecies(node.species_id)
  return (
    <li data-testid={`evo-node-${node.species_id}`}>
      <span className={node.species_id === currentId ? 'evo-self' : undefined}>
        #{String(node.species_id).padStart(3, '0')} {species?.display_name ?? '???'}
      </span>
      {node.evolution_details.length > 0 && (
        <ul className="evo-methods">
          {node.evolution_details.map((detail, i) => (
            <li key={i} data-testid={`evo-method-${node.species_id}-${i}`}>
              {describe(detail)}
              {detail.version_group && <em> ({detail.version_group})</em>}
            </li>
          ))}
        </ul>
      )}
      {node.evolves_to.length > 0 && (
        <ul className="evo-branch" data-branches={node.evolves_to.length}>
          {node.evolves_to.map((child) => (
            <Node key={child.species_id} node={child} currentId={currentId} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function EvolutionTree({ chain, currentId }: { chain: EvolutionNode; currentId: number }) {
  const branchCount = chain.evolves_to.length
  return (
    <div data-testid="evolution-tree" data-root-branches={branchCount}>
      <ul className="evo-root">
        <Node node={chain} currentId={currentId} depth={0} />
      </ul>
      {branchCount === 0 && <p className="subtitle">This species does not evolve.</p>}
    </div>
  )
}
