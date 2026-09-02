import type { CSSProperties } from 'react'
import { evolutionThumbUrl, getItem, getLocation, getMove, getSpecies, getType } from '../../data'
import type { EvolutionDetail, EvolutionNode, Species } from '../../data'
import { A, COND_ICON, ITEM_ICON, layoutEvolution, type PlacedArrow } from './evoLayout'
import { EVO_GENDER_MALE, evoGenderIconUrl, evoGenderLabel } from './evoGenderIcon'
import {
  evoConditionIconKey,
  evoConditionIconUrl,
  isIndistinguishableFork,
} from './evoConditionIcons'
import { triggerKind } from './evolutionTriggers'

/**
 * The evolution chart, rebuilt to the nine Figma layout-evo-* reference frames.
 *
 * WHAT CHANGED, AND WHY IT IS A REBUILD RATHER THAN A RESTYLE. The old version was
 * a nested flex tree of bordered <button> cards, each carrying a thumbnail, a dex
 * number and a name, joined by a Tabler arrow glyph with a text caption beside it.
 * The reference has none of that: no card, no border, no dex number, no name, no
 * glyph-plus-label. It has artwork, a tapered chevron wedge, and the real item and
 * condition sprites sitting on or under that wedge. Those are different pictures,
 * not the same picture in different colours, so the presentation layer is replaced
 * whole. The DATA layer is untouched -- same chain, same era resolution, same
 * painted-icon precedence, same structural random-fork detection.
 *
 * GEOMETRY IS COMPUTED, NOT CSS'D. See evoLayout.ts: the reference frames are hand
 * composed per chain, so there is no flex/grid arrangement that reproduces them.
 * layoutEvolution walks the chain and returns absolute positions in raw units,
 * which this renders as percentages inside one aspect-ratio box -- so the chart IS
 * the reference proportions at whatever size the column gives it.
 *
 * WHERE A GENERIC RENDERER CANNOT BE THE REFERENCE. The frames place branches by
 * eye: Tyrogue's third branch is drawn to the LEFT of the parent with a left-
 * pointing arrow, and Wurmple's condition icons sit nearer the child than the
 * midpoint. One algorithm cannot be hand-composition for all 493 species, so the
 * rules it does follow are the ones that generalise: linear steps run left to
 * right, two or three branches fan to the right at the reference's own angles, and
 * four or more become the circle the Eevee frame draws. That is a deliberate
 * narrowing of the reference, recorded here rather than presented as a match.
 *
 * ARTWORK IS STILL A BUTTON, because it still navigates -- clicking a stage opens
 * that species. It just no longer LOOKS like a control: no border, no fill, no
 * label. The accessible name comes from the image alt plus a hidden dex number,
 * so removing the visible name does not remove it from the accessibility tree.
 */

/**
 * Render one evolution requirement as a readable clause.
 *
 * Still every non-null field, and still the full sentence: the icons carry the
 * distinguishing condition and the short label carries the level, so this is what
 * holds the rest -- Espeon needing friendship AND daytime, Mantyke needing a party
 * member. It is the title attribute and the hidden accessible text now rather than
 * body copy, because the reference has no body copy here.
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
    parts.push(relativeStatClause(detail.relative_physical_stats))
  }
  if (detail.gender != null) parts.push(detail.gender === 1 ? 'female only' : 'male only')
  if (detail.needs_overworld_rain) parts.push('while raining')
  if (detail.turn_upside_down) parts.push('holding the console upside down')

  return parts.join(', ')
}

function relativeStatClause(rel: number): string {
  if (rel > 0) return 'Atk > Def'
  if (rel < 0) return 'Atk < Def'
  return 'Atk = Def'
}

const RARE_CANDY_ITEM_ID = 50
const SOOTHE_BELL_ITEM_ID = 195

interface CondIcon {
  src: string
  /** Spoken form, for the hidden label. Never rendered as alt -- see below. */
  label: string
  /** 'item' sprites draw at ITEM_ICON, painted condition icons at COND_ICON. */
  size: number
  iconKey: string
}

function itemIcon(id: number | null | undefined, size: number): CondIcon | null {
  const item = getItem(id ?? -1)
  if (!item?.sprite) return null
  return { src: item.sprite, label: item.display_name, size, iconKey: `item-${item.name}` }
}

/**
 * The icon row and short label for one requirement, in the reference's own
 * vocabulary.
 *
 * THE REFERENCE USES REAL ITEM SPRITES FOR THE MECHANIC ITSELF, which is the part
 * a generic "trigger glyph" cannot express. image-rare-candy appears on every
 * level-up step in every frame; image-soothe-bell appears on Espeon's and
 * Umbreon's; image-evo-stone is the actual stone. So level-up leads with the Rare
 * Candy sprite and use-item leads with the item's own sprite, and the painted
 * condition icons (sun, moon, trade, dice, the three rocks, beauty, Remoraid,
 * the two genders) follow it joined by "+", exactly as icon-add does in the
 * frames.
 *
 * The Tabler trigger glyphs are gone from the chart for the same reason the text
 * captions are: nothing in the reference draws one. triggerKind is still called,
 * for the data attribute the suites read.
 */
function conditionParts(detail: EvolutionDetail): {
  icons: CondIcon[]
  /** The level, in the tabular face -- it is a number. */
  level: string | null
  /** Everything else, one per line, in the body face. */
  clauses: string[]
} {
  const icons: CondIcon[] = []
  const clauses: string[] = []

  if (detail.trigger === 'use-item') {
    const stone = itemIcon(detail.item_id, ITEM_ICON)
    if (stone) icons.push(stone)
  } else if (detail.trigger === 'trade') {
    icons.push({
      src: evoConditionIconUrl('trade'),
      label: 'By trading',
      size: ITEM_ICON,
      iconKey: 'trade',
    })
    const held = itemIcon(detail.held_item_id, COND_ICON)
    if (held) icons.push(held)
  } else if (detail.trigger === 'shed') {
    // The 2-stage-ghost frame draws this as a "+" and a wide text run beside the
    // second child, with no icon of its own. Kept as the label.
    clauses.push('Empty slot')
  } else {
    const candy = itemIcon(RARE_CANDY_ITEM_ID, ITEM_ICON)
    if (candy) icons.push({ ...candy, label: 'Level up', iconKey: 'item-rare-candy' })
    if (detail.trigger !== 'level-up' && detail.trigger) clauses.push(detail.trigger)
  }

  // Gender first among the conditions, matching evoConditionIconKey's contract:
  // it is the distinguishing field on every detail that sets it.
  const genderUrl = evoGenderIconUrl(detail.gender)
  const genderText = evoGenderLabel(detail.gender)
  if (genderUrl && genderText) {
    icons.push({
      src: genderUrl,
      label: genderText,
      size: COND_ICON,
      iconKey: detail.gender === EVO_GENDER_MALE ? 'gender-male' : 'gender-female',
    })
  }

  const key = evoConditionIconKey(detail)
  // Trade already contributed its own icon above; adding it again would double it.
  if (key && !(key === 'trade' && detail.trigger === 'trade')) {
    icons.push({
      src: evoConditionIconUrl(key),
      label: key.replace(/-/g, ' '),
      size: COND_ICON,
      iconKey: key,
    })
  }

  // Friendship has no painted icon of its own; the frames use the Soothe Bell.
  if (detail.min_happiness != null || detail.min_affection != null) {
    const bell = itemIcon(SOOTHE_BELL_ITEM_ID, COND_ICON)
    if (bell) icons.push({ ...bell, label: 'High friendship', iconKey: 'item-soothe-bell' })
  }

  if (detail.trigger === 'level-up' && detail.held_item_id != null) {
    const held = itemIcon(detail.held_item_id, COND_ICON)
    if (held) icons.push(held)
  }

  if (detail.relative_physical_stats != null) {
    clauses.push(relativeStatClause(detail.relative_physical_stats))
  }

  /*
    ONE LINE PER CLAUSE, not one joined string. The frames give each fragment its
    own text node -- the 3-branch frame has a 90-wide "Lv.20" AND a separate
    164-wide "Atk > Def" per branch -- and joining them produced a single run wide
    enough to cross Tyrogue's artwork and both its neighbours' labels.
  */
  return {
    icons,
    level: detail.min_level != null ? `Lv.${detail.min_level}` : null,
    clauses,
  }
}

/**
 * The tapered chevron wedge.
 *
 * The viewBox is arrow-evo-chain's own 280 x 61.5 and the drawn box keeps that
 * exact ratio (thickness = length / 4.55, see evoLayout.ts), so the chevrons never
 * distort however long the arrow gets. The LENGTH follows the span, which is what
 * the reference does: 280 x 61.5 across a 391-raw linear gap, stretched to about
 * 570 x 90 across Eevee's 2.3 A radial one.
 *
 * Two registers, both from the frames: a very light wedge that widens toward the
 * child, and three chevrons a few steps darker sitting on it. Both are
 * currentColor at different opacities rather than two more palette entries, so the
 * chart re-tones with the theme and adds nothing to the token set. --accent is not
 * available here (four sanctioned uses, none of them this) and would read as a
 * state anyway.
 */
function EvoArrow({ arrow, width, height }: { arrow: PlacedArrow; width: number; height: number }) {
  const pct = (v: number, base: number) => `${(v / base) * 100}%`
  return (
    <svg
      className="evo-arrow"
      data-testid={`evo-arrow-${arrow.child.species_id}`}
      viewBox="0 0 280 61.5"
      aria-hidden
      focusable="false"
      style={{
        left: pct(arrow.mx - arrow.len / 2, width),
        top: pct(arrow.my - arrow.thick / 2, height),
        width: pct(arrow.len, width),
        height: pct(arrow.thick, height),
        transform: `rotate(${arrow.angle}deg)`,
      }}
    >
      {/* Widening toward the head: 17.5 tall at the tail, full 61.5 at the child. */}
      <polygon className="evo-arrow-wedge" points="0,22 280,0 280,61.5 0,39.5" />
      {/* Centred on the wedge, which is where the frames put them. */}
      {[-46, 0, 46].map((dx) => (
        <polyline
          key={dx}
          className="evo-arrow-chevron"
          points={`${152 + dx},9.5 ${178 + dx},30.75 ${152 + dx},52`}
        />
      ))}
    </svg>
  )
}

function thumbFor(species: Species | undefined, shiny: boolean): string | null {
  const variety = species?.varieties.find((v) => v.is_default) ?? species?.varieties[0]
  return variety ? evolutionThumbUrl(variety, shiny) : null
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

  if (branchCount === 0) {
    // The single-stage frame (139:1170) is one artwork in a square, nothing else.
    const species = getSpecies(chain.species_id)
    const thumb = thumbFor(species, shiny)
    return (
      <div
        className="evo-tree evo-tree-single"
        data-testid="evolution-tree"
        data-root-branches={0}
        data-shiny={shiny}
      >
        {thumb && (
          <img
            className="evo-art"
            src={thumb}
            alt={species?.display_name ?? `Species ${chain.species_id}`}
            data-testid={`evo-thumb-${chain.species_id}`}
            data-shiny={shiny}
            loading="lazy"
          />
        )}
        <p className="subtitle" data-testid="evo-none">
          This species does not evolve.
        </p>
      </div>
    )
  }

  const { width, height, nodes, arrows } = layoutEvolution(chain)
  const pct = (v: number, base: number) => `${(v / base) * 100}%`

  /*
    A RANDOM FORK IS STILL A PROPERTY OF THE BRANCH POINT, and still detected
    structurally rather than by species list -- see isIndistinguishableFork. It is
    drawn as the dice icon on the branch point's own arrows, which is what the
    2-branch-long frame does: Wurmple's two arrows each carry dice + rare candy.
    That replaces the old separate "Random" row, which was a caption, not a picture.
  */
  const randomForks = new Set<number>()
  const walk = (node: EvolutionNode) => {
    if (isIndistinguishableFork(node.evolves_to.map((c) => c.evolution_details))) {
      for (const c of node.evolves_to) randomForks.add(c.species_id)
    }
    node.evolves_to.forEach(walk)
  }
  walk(chain)

  return (
    <div
      className="evo-tree"
      data-testid="evolution-tree"
      data-root-branches={branchCount}
      data-shiny={shiny}
      data-nodes={nodes.length}
      style={{ aspectRatio: `${width} / ${height}`, '--evo-w': width } as CSSProperties}
    >
      {arrows.map((arrow) => (
        <EvoArrow key={`a-${arrow.child.species_id}`} arrow={arrow} width={width} height={height} />
      ))}

      {arrows.map((arrow) => {
        const details = arrow.child.evolution_details
        const isRandom = randomForks.has(arrow.child.species_id)
        return (
          <div
            key={`c-${arrow.child.species_id}`}
            className="evo-cond"
            data-testid={`evo-cond-${arrow.child.species_id}`}
            style={{ left: pct(arrow.cx, width), top: pct(arrow.cy, height) }}
          >
            {details.length === 0 ? (
              <span className="evo-trigger" data-kind="unknown">
                <span className="evo-trigger-text">?</span>
              </span>
            ) : (
              details.map((detail, i) => {
                const { icons, level, clauses } = conditionParts(detail)
                const sentence = describe(detail)
                /*
                  THE DICE GOES INLINE, at the head of the first requirement's icon
                  row. The 2-branch-long frame draws Wurmple's fork exactly that
                  way -- dice, "+", rare candy, "Lv.7" on one line -- and the
                  separate row it had before put it on a line of its own above.
                */
                const row =
                  isRandom && i === 0
                    ? [
                        {
                          src: evoConditionIconUrl('random-split'),
                          label: 'Random outcome',
                          size: COND_ICON,
                          iconKey: 'random-split',
                        },
                        ...icons,
                      ]
                    : icons
                return (
                  <span
                    key={i}
                    className="evo-trigger"
                    data-kind={triggerKind(detail)}
                    data-testid={`evo-trigger-${arrow.child.species_id}-${i}`}
                    title={
                      (isRandom ? 'Random: nothing in the data decides which. ' : '') +
                      sentence +
                      (detail.version_group ? ` (${detail.version_group})` : '')
                    }
                  >
                    {row.map((icon, k) => (
                      <span
                        className="evo-trigger-icon"
                        key={icon.iconKey + k}
                        data-testid={
                          icon.iconKey === 'random-split'
                            ? `evo-fork-random-${arrow.parent.species_id}`
                            : undefined
                        }
                      >
                        {k > 0 && (
                          <span className="evo-trigger-plus" aria-hidden>
                            +
                          </span>
                        )}
                        <img
                          src={icon.src}
                          alt=""
                          className="evo-painted-icon"
                          data-evo-icon={icon.iconKey}
                          style={{ '--evo-icon-size': icon.size } as CSSProperties}
                          loading="lazy"
                        />
                      </span>
                    ))}
                    {level && <span className="evo-trigger-text">{level}</span>}
                    {clauses.map((clause) => (
                      <span className="evo-trigger-clause" key={clause}>
                        {clause}
                      </span>
                    ))}
                    {/* The version group is in the title and in the sentence
                        below, not on screen: the reference draws no such chip, and
                        on Eevee's radial chart seven of them collided with each
                        other and with the artwork. */}
                    <span className="visually-hidden">{sentence}</span>
                  </span>
                )
              })
            )}
          </div>
        )
      })}

      {nodes.map((placed) => {
        const species = getSpecies(placed.node.species_id)
        const thumb = thumbFor(species, shiny)
        const isCurrent = placed.node.species_id === currentId
        const name = species?.display_name ?? `Species ${placed.node.species_id}`
        return (
          <button
            key={placed.node.species_id}
            type="button"
            className="evo-art-btn"
            data-testid={`evo-node-${placed.node.species_id}`}
            data-species-id={placed.node.species_id}
            data-current={isCurrent}
            aria-current={isCurrent}
            onClick={onSelect ? () => onSelect(placed.node.species_id) : undefined}
            disabled={!onSelect}
            style={{
              left: pct(placed.x, width),
              top: pct(placed.y, height),
              width: pct(A, width),
              height: pct(A, height),
            }}
          >
            {thumb ? (
              <img
                className="evo-art"
                src={thumb}
                alt={name}
                data-testid={`evo-thumb-${placed.node.species_id}`}
                data-shiny={shiny}
                loading="lazy"
              />
            ) : (
              <span className="evo-art-missing" aria-hidden>
                ?
              </span>
            )}
            {/* The reference draws no dex number or name. Neither is dropped from
                the accessibility tree with it. */}
            <span className="visually-hidden">
              {`#${String(placed.node.species_id).padStart(3, '0')} ${name}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
