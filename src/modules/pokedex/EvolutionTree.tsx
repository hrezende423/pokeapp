import { evolutionThumbUrl, getItem, getLocation, getMove, getSpecies, getType } from '../../data'
import type { EvolutionDetail, EvolutionNode, Species } from '../../data'
import { EvoRequirementIcon } from './TriggerIcon'
import { evoConditionIconUrl, isIndistinguishableFork } from './evoConditionIcons'
import { triggerCaption, triggerKind } from './evolutionTriggers'

/**
 * Render one evolution requirement as a readable clause.
 *
 * Every non-null field is surfaced rather than reduced to just the level, because
 * the interesting Gen 2-4 methods are the compound ones: Espeon needs friendship
 * *and* daytime, Leafeon needs a specific location, Mantyke needs a party member.
 * The icon beside this text carries only the single distinguishing condition, so
 * the full clause is where the rest of the requirement lives.
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

function thumbFor(species: Species | undefined, shiny: boolean): string | null {
  const variety = species?.varieties.find((v) => v.is_default) ?? species?.varieties[0]
  return variety ? evolutionThumbUrl(variety, shiny) : null
}

/** One species in the tree: thumbnail over dex number and name. */
function NodeCard({
  node,
  currentId,
  shiny,
  onSelect,
}: {
  node: EvolutionNode
  currentId: number
  shiny: boolean
  onSelect?: (id: number) => void
}) {
  const species = getSpecies(node.species_id)
  const thumb = thumbFor(species, shiny)
  const isCurrent = node.species_id === currentId

  return (
    <button
      type="button"
      className={isCurrent ? 'evo-card evo-card-current' : 'evo-card'}
      data-testid={`evo-node-${node.species_id}`}
      data-species-id={node.species_id}
      data-current={isCurrent}
      aria-current={isCurrent}
      onClick={onSelect ? () => onSelect(node.species_id) : undefined}
      disabled={!onSelect}
    >
      <span className="evo-thumb">
        {thumb ? (
          <img
            src={thumb}
            alt={species?.display_name ?? `Species ${node.species_id}`}
            data-testid={`evo-thumb-${node.species_id}`}
            data-shiny={shiny}
            loading="lazy"
            width={64}
            height={64}
          />
        ) : (
          <span className="evo-thumb-missing" aria-hidden>
            ?
          </span>
        )}
      </span>
      <span className="evo-dex">#{String(node.species_id).padStart(3, '0')}</span>
      <span className="evo-name">{species?.display_name ?? '???'}</span>
    </button>
  )
}

/**
 * The labelled arrow between a parent and one child.
 *
 * A child can be reachable by several requirements (Eevee's Espeon needs
 * friendship, and in HGSS also daytime); each gets its own icon + caption line so
 * a branch never collapses two different methods into one.
 */
function Arrow({ details, childId }: { details: EvolutionDetail[]; childId: number }) {
  return (
    <span className="evo-arrow" data-testid={`evo-arrow-${childId}`}>
      {details.length === 0 ? (
        <span className="evo-trigger" data-kind="unknown">
          <span className="evo-trigger-text">?</span>
        </span>
      ) : (
        details.map((detail, i) => {
          const kind = triggerKind(detail)
          const caption = triggerCaption(detail, kind)
          return (
            <span
              key={i}
              className="evo-trigger"
              data-kind={kind}
              data-testid={`evo-trigger-${childId}-${i}`}
              title={describe(detail) + (detail.version_group ? ` (${detail.version_group})` : '')}
            >
              <EvoRequirementIcon detail={detail} kind={kind} />
              {caption && <span className="evo-trigger-text">{caption}</span>}
              {detail.version_group && (
                <span className="evo-trigger-vg">{detail.version_group}</span>
              )}
            </span>
          )
        })
      )}
    </span>
  )
}

/**
 * A node and everything downstream of it.
 *
 * Layout is the recursive rule from the brief: the parent sits on the left and
 * its children stack vertically to its right, with the same rule applied to each
 * child. Linear chains come out as a single row and branching ones as a fan, so
 * Eevee's eight branches need no special case -- they are just eight rows.
 */
function Subtree({
  node,
  currentId,
  shiny,
  onSelect,
  depth,
}: {
  node: EvolutionNode
  currentId: number
  shiny: boolean
  onSelect?: (id: number) => void
  depth: number
}) {
  /*
    A RANDOM FORK IS A PROPERTY OF THE BRANCH POINT, so the dice goes here on the
    parent rather than on either arrow. Both outcomes stay fully drawn beside it --
    the icon says "which one you get is not determined by anything above", and the
    two cards say what the outcomes are. Naming them in the hidden label too, since
    the icon alone does not say Silcoon or Cascoon.

    No resolver sits behind this and none is needed: nothing in the app tracks
    individual caught Pokemon, so there is no personality value to resolve against.
    See isIndistinguishableFork for why the detection is structural.
  */
  const randomFork = isIndistinguishableFork(node.evolves_to.map((c) => c.evolution_details))
  const outcomeNames = node.evolves_to
    .map((c) => getSpecies(c.species_id)?.display_name ?? `#${c.species_id}`)
    .join(' or ')

  return (
    <div className="evo-subtree" data-depth={depth}>
      <NodeCard node={node} currentId={currentId} shiny={shiny} onSelect={onSelect} />
      {node.evolves_to.length > 0 && (
        <ul
          className="evo-children"
          data-branches={node.evolves_to.length}
          data-random-fork={randomFork}
          data-testid={`evo-children-${node.species_id}`}
        >
          {randomFork && (
            <li
              className="evo-fork-random"
              data-testid={`evo-fork-random-${node.species_id}`}
              title={`Random: ${outcomeNames}. Nothing in the data decides which.`}
            >
              <img
                src={evoConditionIconUrl('random-split')}
                alt=""
                width={20}
                height={20}
                loading="lazy"
                className="evo-painted-icon"
                data-evo-icon="random-split"
              />
              {/* aria-hidden so a screen reader gets the full sentence below once
                  rather than "Random" and then "Random outcome: ..." twice. */}
              <span className="evo-fork-random-text" aria-hidden>
                Random
              </span>
              <span className="visually-hidden">{`Random outcome: ${outcomeNames}`}</span>
            </li>
          )}
          {node.evolves_to.map((child) => (
            <li className="evo-child" key={child.species_id}>
              <Arrow details={child.evolution_details} childId={child.species_id} />
              <Subtree
                node={child}
                currentId={currentId}
                shiny={shiny}
                onSelect={onSelect}
                depth={depth + 1}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function EvolutionTree({
  chain,
  currentId,
  shiny = false,
  onSelect,
}: {
  chain: EvolutionNode
  currentId: number
  shiny?: boolean
  onSelect?: (id: number) => void
}) {
  const branchCount = chain.evolves_to.length
  return (
    <div
      className="evo-tree"
      data-testid="evolution-tree"
      data-root-branches={branchCount}
      data-shiny={shiny}
    >
      <Subtree node={chain} currentId={currentId} shiny={shiny} onSelect={onSelect} depth={0} />
      {branchCount === 0 && (
        <p className="subtitle" data-testid="evo-none">
          This species does not evolve.
        </p>
      )}
    </div>
  )
}
