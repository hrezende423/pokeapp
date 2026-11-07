import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { Toggle } from '../../../components/ds/Toggle'
import { getMove, getSpecies, isSpeciesInGeneration } from '../../../data'
import { moveEntries } from '../../dex/entrySources'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { METHOD_LABEL, searchMovesets, type MethodGroup } from './movesetMath'
import { useLearnRows } from '../useLearnRows'

const TOOL = findTool('10')!
const GROUPS: MethodGroup[] = ['level-up', 'machine', 'tutor', 'egg', 'special']

/**
 * #10 Moveset searcher: every Pokemon that can know all the moves picked, in the
 * selected game, by the learn methods allowed -- and how each one learns each
 * move. The game row matters: tutors and TMs differ between a generation's games.
 */
export function MovesetTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ generation, game }) =>
        game ? <MovesetBody key={`${generation}`} generation={generation} game={game.name} /> : null
      }
    </ToolShell>
  )
}


function MovesetBody({ generation, game }: { generation: number; game: string }) {
  const moves = useMemo(
    () =>
      moveEntries({ generation, isAll: false }).sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      ),
    [generation],
  )
  const [picked, setPicked] = useState<(number | null)[]>([null, null, null, null])
  const [methods, setMethods] = useState<Set<MethodGroup>>(() => new Set(GROUPS))
  const learn = useLearnRows(game)

  const chosen = picked.filter((m): m is number => m != null)
  const outcome = learn.error
    ? { ok: false as const, reason: `This game’s learnsets did not load: ${learn.error}` }
    : !learn.rows
      ? { ok: false as const, reason: 'Loading this game’s learnsets…' }
      : searchMovesets(learn.rows, chosen, methods, (id) => isSpeciesInGeneration(id, generation))

  const label = (pokemonId: number, speciesId: number) => {
    const s = getSpecies(speciesId)
    const v = s?.varieties.find((x) => x.pokemon_id === pokemonId)
    if (!s) return `#${speciesId}`
    if (!v || v.is_default) return s.display_name
    const form = v.name.slice(s.name.length + 1).replace(/-/g, ' ')
    return `${s.display_name} (${form})`
  }

  return (
    <>
      <ToolInputs>
        <h2 className="calc-section-heading">Moves (all of them)</h2>
        <div className="calc-row">
          {picked.map((m, i) => (
            <SelectField
              key={i}
              label={`Move ${i + 1}`}
              options={[
                { value: '', label: '—' },
                ...moves.map((mv) => ({ value: String(mv.id), label: mv.display_name })),
              ]}
              value={m != null ? String(m) : ''}
              data-testid={`ms-move-${i + 1}`}
              onChange={(e) =>
                setPicked((p) =>
                  p.map((x, k) => (k === i ? (e.target.value ? Number(e.target.value) : null) : x)),
                )
              }
            />
          ))}
        </div>
        <h2 className="calc-section-heading">Learned by</h2>
        <div className="calc-toggle-row">
          {GROUPS.map((g) => (
            <Toggle
              key={g}
              on={methods.has(g)}
              label={METHOD_LABEL[g]}
              onChange={(v) =>
                setMethods((s) => {
                  const next = new Set(s)
                  if (v) next.add(g)
                  else next.delete(g)
                  return next
                })
              }
            />
          ))}
        </div>
      </ToolInputs>
      <ToolResult reason={outcome.ok ? null : outcome.reason}>
        {outcome.ok && (
          <>
            <p className="calc-result-headline" data-testid="ms-count">
              <span className="num">{outcome.hits.length}</span> Pokémon
            </p>
            <ul className="tools-list" data-testid="ms-hits">
              {outcome.hits.map((h) => (
                <li key={h.pokemonId} className="tools-item" data-testid={`ms-hit-${h.pokemonId}`}>
                  <span>{label(h.pokemonId, h.speciesId)}</span>
                  <span className="tools-blurb">
                    {h.how
                      .map((x) => `${getMove(x.moveId)?.display_name}: ${x.ways.join(', ')}`)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </ToolResult>
    </>
  )
}
