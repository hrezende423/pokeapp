import { Segmented } from './Segmented'
import type { MatrixControls, MatrixDepth, MatrixExistence, MatrixLayout } from './useMatrixControls'
import type { TypeCoverageScope } from './useTypeCoverageScope'

/**
 * The page's right-hand control rail.
 *
 * ONE RAIL, ONE POSITION, EVERY TAB. The generation dropdown sits directly under
 * the tab strip on all four tabs -- that was the explicit request, and it is why
 * the rail is a region of the SHELL rather than something each view draws for
 * itself: four views placing the same control independently is exactly the
 * "elements positioned by coordinates that do not refer to each other" problem
 * the layout rules were adopted to stop.
 *
 * Matrix adds its three toggles below the dropdown, each on its own row. The
 * other three tabs show the dropdown alone, so the rail is narrow there and the
 * content column takes the room back.
 *
 * A NATIVE SELECT, not a custom overlay menu. The design system's select IS a
 * styled native one and the overlay menu is a separate undesigned component, so
 * a hand-rolled dropdown here would be inventing a pattern rather than using one.
 */

const LAYOUTS: { value: MatrixLayout; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'standard', label: 'Standard' },
]
const DEPTHS: { value: MatrixDepth; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'single', label: 'Single' },
]
const EXISTENCES: { value: MatrixExistence; label: string }[] = [
  { value: 'existing', label: 'Existing' },
  { value: 'all', label: 'All' },
]

export function ControlRail({
  scope,
  controls,
  showMatrixControls,
}: {
  scope: TypeCoverageScope
  controls: MatrixControls
  /** Matrix only. The other tabs take the dropdown and nothing else. */
  showMatrixControls: boolean
}) {
  return (
    <aside className="tc-rail" data-layout="control-rail">
      <div className="tc-rail-row">
        <label className="tc-select-field" data-testid="tc-generation">
          <span className="tc-control-label">Generation</span>
          <span className="tc-select-shell">
            <select
              className="tc-select"
              data-testid="tc-generation-select"
              value={scope.generation}
              onChange={(e) => scope.setGeneration(Number(e.target.value))}
            >
              {scope.generations.map((gen) => (
                <option key={gen} value={gen}>
                  Gen {gen}
                </option>
              ))}
            </select>
            {/* The unicode chevron the spec names, not a Tabler icon. */}
            <span className="tc-select-chevron" aria-hidden>
              ▾
            </span>
          </span>
        </label>
      </div>

      {showMatrixControls && (
        <>
          <div className="tc-rail-row">
            <Segmented
              label="Layout"
              testId="tc-toggle-layout"
              options={LAYOUTS}
              value={controls.layout}
              onChange={controls.setLayout}
            />
          </div>
          {/* Hidden, not disabled, under Standard: "include dual-type
              combinations" and "only combinations something really has" are
              questions with no meaning when the rows are attacking types. */}
          {controls.customControls && (
            <div className="tc-rail-row">
              <Segmented
                label="Combinations"
                testId="tc-toggle-depth"
                options={DEPTHS}
                value={controls.depth}
                onChange={controls.setDepth}
              />
            </div>
          )}
          {controls.customControls && (
            <div className="tc-rail-row">
              <Segmented
                label="Species"
                testId="tc-toggle-existence"
                options={EXISTENCES}
                value={controls.existence}
                onChange={controls.setExistence}
              />
            </div>
          )}
        </>
      )}
    </aside>
  )
}
