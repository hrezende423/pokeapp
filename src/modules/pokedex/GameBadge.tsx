import type { CSSProperties } from 'react'
import { versionLabel } from './speciesFacts'

/**
 * A game's name as a coloured badge.
 *
 * DOES EACH GAME HAVE AN ASSOCIATED COLOUR? Not in the data. PokeAPI's `version`
 * resource carries id / name / names / version_group and nothing else, and
 * neither does this app's version-groups.json -- checked before this was built.
 * But every game has a box-art colour a reader recognises, and the community's
 * version-colour set is the de-facto table for it, so that is the palette:
 * --game-<name>, contrast-corrected per theme in design-tokens.css by
 * scripts/calibrate-game-colors.mjs.
 *
 * WHY A BADGE HERE WHEN A TYPE IS NEVER ONE. "Type is data, not decoration" is
 * the rule that keeps type indicators as bare coloured text, and it still holds.
 * A version label is not the same kind of thing: it is the NAME a reader scans a
 * sixteen-entry Pokedex history by, and it repeats down a column where a shape
 * is what makes it findable. It uses --radius-badge-square, which
 * design-tokens.json sanctions and TypeLabel deliberately left unimplemented for
 * want of a fill and text-colour spec. This is that spec: text at the corrected
 * colour, fill at a 12% self-tint of it, both derived from one --game-c so they
 * cannot drift apart.
 *
 * A GAME WITH NO TOKEN FALLS BACK TO --text-secondary rather than to an
 * arbitrary colour -- the same rule TypeLabel applies to fairy/unknown/shadow.
 * Every version in the Gen 1-4 scope has one, so the fallback is for a bundle
 * that grows, not for a hole in this one.
 */

const GAMES_WITH_COLOR = new Set([
  'red',
  'blue',
  'yellow',
  'gold',
  'silver',
  'crystal',
  'ruby',
  'sapphire',
  'emerald',
  'firered',
  'leafgreen',
  'diamond',
  'pearl',
  'platinum',
  'heartgold',
  'soulsilver',
  'colosseum',
  'xd',
  'red-japan',
  'green-japan',
  'blue-japan',
])

export function GameBadge({
  version,
  className = 'species-game-badge',
  testId,
}: {
  /** Lowercase version slug, e.g. "heartgold". */
  version: string
  /** Which badge rule to use; both are the same treatment at two sizes. */
  className?: string
  testId?: string
}) {
  const colored = GAMES_WITH_COLOR.has(version)
  return (
    <span
      className={className}
      data-game={version}
      data-colored={colored}
      data-testid={testId}
      style={colored ? ({ '--game-c': `var(--game-${version})` } as CSSProperties) : undefined}
    >
      {versionLabel(version)}
    </span>
  )
}
