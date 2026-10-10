import { versionGroupLabel } from '../pokedex/speciesFacts'
import type { GameInGeneration } from './gameInGeneration'

/**
 * The game row itself: the species page's segmented buttons (`.species-scope-*`),
 * game axis only. Renders nothing when the generation holds a single game.
 */
export function GameRow({ scope, testId }: { scope: GameInGeneration; testId: string }) {
  if (scope.games.length < 2 || !scope.versionGroup) return null
  const current = scope.versionGroup.name
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
