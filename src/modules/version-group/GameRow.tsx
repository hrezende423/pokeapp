import { versionGroupLabel } from '../pokedex/speciesFacts'
import type { GameInGeneration } from './gameInGeneration'

/**
 * The game row itself: the species page's segmented buttons (`.species-scope-*`),
 * game axis only. Renders nothing when the generation holds a single game.
 *
 * `variant="nav"` is the Movedex's (owner, 2026-10-11): a right-aligned mini
 * navbar in the app bar's own treatment -- ghost text buttons, the selected one
 * in --accent, the rest --text-secondary, one hairline under the buttons only --
 * and no "Game" label. The selected game is a selected tab, which is one of the
 * accent's two sanctioned uses; with the app bar's active item that makes two.
 */
export function GameRow({
  scope,
  testId,
  variant = 'segments',
}: {
  scope: GameInGeneration
  testId: string
  variant?: 'segments' | 'nav'
}) {
  if (scope.games.length < 2 || !scope.versionGroup) return null
  const current = scope.versionGroup.name
  if (variant === 'nav') {
    return (
      <div className="game-nav" data-testid={testId}>
        <div className="game-nav-items" role="group" aria-label="Game">
          {scope.games.map((vg) => (
            <button
              key={vg.name}
              type="button"
              className={vg.name === current ? 'nav-trigger nav-trigger-active' : 'nav-trigger'}
              data-testid={`${testId}-${vg.name}`}
              data-active={vg.name === current}
              aria-pressed={vg.name === current}
              onClick={() => scope.setVersionGroup(vg.name)}
            >
              {versionGroupLabel(vg.name)}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="species-scope" data-testid={testId}>
      <div className="species-scope-row">
        <span className="species-scope-label" id={`${testId}-label`}>
          Game
        </span>
        <div className="species-scope-segments" role="group" aria-labelledby={`${testId}-label`}>
          {scope.games.map((vg) => (
            <button
              key={vg.name}
              type="button"
              className="species-scope-segment"
              data-testid={`${testId}-${vg.name}`}
              data-active={vg.name === current}
              aria-pressed={vg.name === current}
              onClick={() => scope.setVersionGroup(vg.name)}
            >
              {versionGroupLabel(vg.name)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
