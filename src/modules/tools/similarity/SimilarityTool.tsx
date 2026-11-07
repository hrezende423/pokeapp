import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { getSpecies } from '../../../data'
import { speciesEntries } from '../../dex/entrySources'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { WEIGHTS, mostSimilar } from './similarityMath'

const TOOL = findTool('14')!

/**
 * #14 Similarity finder: the twenty Pokemon most like the one picked, in the
 * app's generation, by a formula stated on the page.
 */
export function SimilarityTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!}>
      {({ generation }) => <SimilarityBody key={generation} generation={generation} />}
    </ToolShell>
  )
}

const pct = (n: number) => `${Math.round(n * 100)}%`

function SimilarityBody({ generation }: { generation: number }) {
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const [id, setId] = useState<number>(species[0]?.id ?? 1)
  const target = getSpecies(id)
  const hits = useMemo(
    () => (target ? mostSimilar(generation, target, species) : []),
    [generation, target, species],
  )

  return (
    <>
      <ToolInputs>
        <SelectField
          label="Pokémon"
          options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
          value={String(id)}
          data-testid="sim-species"
          onChange={(e) => setId(Number(e.target.value))}
        />
        <p className="calc-result-note" data-testid="sim-formula">
          Score out of 100: {WEIGHTS.shape} × stat shape (cosine of the base stats) +{' '}
          {WEIGHTS.defences} × defences (type chart, tier by tier) + {WEIGHTS.size} × size (base
          stat total) + {WEIGHTS.types} × shared types.
        </p>
      </ToolInputs>
      <ToolResult reason={target ? null : 'Pick a Pokémon.'}>
        <ol className="tools-list" data-testid="sim-rows">
          {hits.map((h, i) => (
            <li
              key={h.speciesId}
              className="tools-item"
              data-testid={`sim-rank-${i + 1}`}
              data-species={h.speciesId}
            >
              <span>
                <span className="num">{h.score.toFixed(1)}</span>{' '}
                {getSpecies(h.speciesId)?.display_name}
              </span>
              <span className="tools-blurb">
                shape {pct(h.parts.shape)} · defences {pct(h.parts.defences)} · size{' '}
                {pct(h.parts.size)} · types {pct(h.parts.types)}
              </span>
            </li>
          ))}
        </ol>
      </ToolResult>
    </>
  )
}
