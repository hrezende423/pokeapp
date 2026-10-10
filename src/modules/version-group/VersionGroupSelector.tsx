import { SelectField } from '../../components/ds/SelectField'
import { MAX_SPECIES_ID } from '../../data'
import { ALL_GENERATIONS, useVersionGroup } from './context'

/**
 * The app's generation picker. It sits in the account menu, under the theme
 * switch (owner, 2026-10-10), because it is a standing preference for the whole
 * app rather than a control of the page on screen. The row's own label says
 * "Generation", so the field's is visually hidden (still read out).
 *
 * The "All" caption reads its ceiling from MAX_SPECIES_ID, which is derived from
 * the generation ranges -- adding a generation there updates this label too
 * instead of leaving a stale number behind.
 */
export function VersionGroupSelector() {
  const { selectedGeneration, setGeneration, generations } = useVersionGroup()

  return (
    <SelectField
      label="Generation"
      hideLabel
      data-testid="gen-select"
      value={selectedGeneration == null ? ALL_GENERATIONS : String(selectedGeneration)}
      onChange={(e) =>
        setGeneration(e.target.value === ALL_GENERATIONS ? null : Number(e.target.value))
      }
      options={[
        { value: ALL_GENERATIONS, label: `All (#1-${MAX_SPECIES_ID})` },
        ...generations.map((g) => ({ value: String(g), label: `Gen ${g}` })),
      ]}
    />
  )
}
