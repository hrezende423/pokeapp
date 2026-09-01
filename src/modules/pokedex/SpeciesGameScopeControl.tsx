import { generationLabel, versionGroupLabel } from './speciesFacts'
import type { SpeciesGameScope } from './useSpeciesGameScope'

/**
 * The control itself: generation segments, then the games inside that generation.
 *
 * Segmented buttons rather than a native select, because both axes have few
 * options and the whole set being visible is the affordance -- the same reasoning
 * the theme switcher's segmented pill is built on. The app bar's game selector
 * stays a native select; it has 15 options and is a different problem.
 */
export function SpeciesGameScopeControl({
  scope,
  label,
  testId,
}: {
  scope: SpeciesGameScope
  label: string
  testId: string
}) {
  return (
    <div className="species-scope" data-testid={testId}>
      <div className="species-scope-row">
        <span className="species-scope-label" id={`${testId}-gen-label`}>
          {label}
        </span>
        <div
          className="species-scope-segments"
          role="group"
          aria-labelledby={`${testId}-gen-label`}
          data-testid={`${testId}-generations`}
        >
          {scope.generations.map((gen) => (
            <button
              key={gen}
              type="button"
              className="species-scope-segment"
              data-testid={`${testId}-generation-${gen}`}
              data-active={gen === scope.generation}
              aria-pressed={gen === scope.generation}
              onClick={() => scope.setGeneration(gen)}
            >
              {generationLabel(gen).replace('Generation ', 'Gen ')}
            </button>
          ))}
        </div>
      </div>

      {/* Only when the generation actually holds more than one game table. */}
      {scope.groupsInGeneration.length > 1 && (
        <div className="species-scope-row">
          <span className="species-scope-label" id={`${testId}-game-label`}>
            Game
          </span>
          <div
            className="species-scope-segments"
            role="group"
            aria-labelledby={`${testId}-game-label`}
            data-testid={`${testId}-games`}
          >
            {scope.groupsInGeneration.map((vg) => (
              <button
                key={vg.name}
                type="button"
                className="species-scope-segment"
                data-testid={`${testId}-game-${vg.name}`}
                data-active={vg.name === scope.versionGroup.name}
                aria-pressed={vg.name === scope.versionGroup.name}
                onClick={() => scope.setVersionGroup(vg.name)}
              >
                {versionGroupLabel(vg.name)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
