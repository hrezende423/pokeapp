import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { getSpecies, type Species } from '../../../data'
import { speciesEntries } from '../../dex/entrySources'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { bestOf, compareSpecies } from './compareMath'

const TOOL = findTool('13')!
const MAX = 6

/**
 * #13 Compare Pokémon: two to six species side by side, every field as of the
 * app's generation. The highest number in a numeric row is set in the heavier
 * weight -- emphasis by weight, never by colour (the design system's rule).
 * Graduates the "Compare Pokemon" placeholder in the Tools dropdown.
 */
export function CompareTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!}>
      {({ generation }) => <CompareBody key={generation} generation={generation} />}
    </ToolShell>
  )
}

function CompareBody({ generation }: { generation: number }) {
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const [picked, setPicked] = useState<(number | null)[]>(() => [
    species[0]?.id ?? null,
    species[3]?.id ?? null,
  ])
  const chosen = picked
    .map((id) => (id != null ? getSpecies(id) : undefined))
    .filter((s): s is Species => Boolean(s))
  const fields = chosen.length >= 2 ? compareSpecies(generation, chosen) : []

  return (
    <>
      <ToolInputs>
        <div className="calc-row">
          {picked.map((id, i) => (
            <SelectField
              key={i}
              label={`Pokémon ${i + 1}`}
              options={[
                ...(i >= 2 ? [{ value: '', label: '—' }] : []),
                ...species.map((s) => ({ value: String(s.id), label: s.display_name })),
              ]}
              value={id != null ? String(id) : ''}
              data-testid={`cmp-species-${i + 1}`}
              onChange={(e) =>
                setPicked((p) =>
                  p.map((x, k) => (k === i ? (e.target.value ? Number(e.target.value) : null) : x)),
                )
              }
            />
          ))}
        </div>
        {picked.length < MAX && (
          <button
            type="button"
            className="tools-link"
            data-testid="cmp-add"
            onClick={() => setPicked((p) => [...p, null])}
          >
            + Add a Pokémon
          </button>
        )}
      </ToolInputs>
      <ToolResult reason={chosen.length < 2 ? 'Pick at least two Pokémon.' : null}>
        <div className="tools-compare-scroll">
          <table className="tools-compare" data-testid="cmp-table">
            <thead>
              <tr>
                <th />
                {chosen.map((s) => (
                  <th key={s.id} scope="col">
                    {s.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const best = f.numbers ? bestOf(f.numbers) : new Set<number>()
                return (
                  <tr key={f.key} data-testid={`cmp-row-${f.key}`}>
                    <th scope="row">{f.label}</th>
                    {f.values.map((v, i) => (
                      <td
                        key={i}
                        className={f.numbers ? 'num' : undefined}
                        data-best={best.has(i) || undefined}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ToolResult>
    </>
  )
}
