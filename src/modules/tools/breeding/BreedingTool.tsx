import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { getMove, getSpecies, isSpeciesInGeneration, listSpecies } from '../../../data'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { useLearnRows } from '../useLearnRows'
import { breedingChain, eggMovesOf, hatchlings, type Chain } from './breedingMath'

const TOOL = findTool('16')!

/**
 * #16 Breeding chain: the fathers that pass an egg move onto a Pokemon in the
 * selected game -- directly, or through the fewest breedings in between.
 * Graduates the "Breeding Planner" placeholder in the Tools dropdown.
 */
export function BreedingTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ generation, game }) =>
        game ? (
          <BreedingBody
            key={`${generation}-${game.name}`}
            generation={generation}
            game={game.name}
          />
        ) : null
      }
    </ToolShell>
  )
}

const name = (id: number) => getSpecies(id)?.display_name ?? `#${id}`
const moveName = (id: number) => getMove(id)?.display_name ?? `#${id}`

function BreedingBody({ generation, game }: { generation: number; game: string }) {
  const learn = useLearnRows(game)
  const pool = useMemo(
    () => listSpecies().filter((s) => isSpeciesInGeneration(s.id, generation)),
    [generation],
  )
  const targets = useMemo(
    () =>
      learn.rows
        ? hatchlings(learn.rows, pool).sort((a, b) => a.display_name.localeCompare(b.display_name))
        : [],
    [learn.rows, pool],
  )
  const [targetId, setTargetId] = useState<number | null>(null)
  const [moveId, setMoveId] = useState<number | null>(null)
  const target = targetId ?? targets[0]?.id ?? null
  const eggMoves = useMemo(
    () =>
      learn.rows && target != null
        ? [...eggMovesOf(learn.rows, target)].sort((a, b) => moveName(a).localeCompare(moveName(b)))
        : [],
    [learn.rows, target],
  )
  const move = moveId != null && eggMoves.includes(moveId) ? moveId : (eggMoves[0] ?? null)

  const result = learn.error
    ? { ok: false as const, reason: `This game’s learnsets did not load: ${learn.error}` }
    : !learn.rows
      ? { ok: false as const, reason: 'Loading this game’s learnsets…' }
      : target == null || move == null
        ? { ok: false as const, reason: 'Pick a Pokémon and one of its egg moves.' }
        : breedingChain(learn.rows, pool, target, move)

  return (
    <>
      <ToolInputs>
        <SelectField
          label="Pokémon to hatch"
          options={targets.map((s) => ({ value: String(s.id), label: s.display_name }))}
          value={target != null ? String(target) : ''}
          data-testid="brd-species"
          onChange={(e) => setTargetId(Number(e.target.value))}
        />
        <SelectField
          label="Egg move"
          options={eggMoves.map((m) => ({ value: String(m), label: moveName(m) }))}
          value={move != null ? String(move) : ''}
          data-testid="brd-move"
          onChange={(e) => setMoveId(Number(e.target.value))}
        />
        <p className="calc-result-note">
          Gen 2–4: only the father passes an egg move. He must share an egg group with the mother,
          whose species the egg is; Ditto passes nothing. Fathers that are only obtainable by trade
          are included.
        </p>
      </ToolInputs>
      <ToolResult reason={result.ok ? null : result.reason}>
        {result.ok && target != null && move != null && (
          <div data-testid="brd-result" data-steps={result.steps}>
            {result.lightBall && (
              <p className="calc-result-note" data-testid="brd-light-ball">
                No father needed: a Pikachu or Raichu parent holding a Light Ball passes{' '}
                {moveName(move)}.
              </p>
            )}
            {result.chains.length > 0 && (
              <p className="calc-result-note" data-testid="brd-steps">
                {result.steps === 1
                  ? 'One breeding.'
                  : `${result.steps} breedings — no father learns it directly.`}
              </p>
            )}
            <ol className="tools-list">
              {result.chains.map((c, i) => (
                <ChainRow key={i} chain={c} target={target} index={i} />
              ))}
            </ol>
          </div>
        )}
      </ToolResult>
    </>
  )
}

function ChainRow({ chain, target, index }: { chain: Chain; target: number; index: number }) {
  // Nearest the target first, so the reader's order is the reverse: far end first.
  const lines = [...chain.via].reverse()
  return (
    <li
      className="tools-item"
      data-testid={`brd-chain-${index + 1}`}
      data-via={chain.via.join(',')}
      data-sources={chain.sources.map((s) => s.speciesId).join(',')}
    >
      <span>
        {chain.sources.map((s, k) => (
          <span key={s.speciesId}>
            {k > 0 && ', '}
            {name(s.speciesId)} <span className="tools-blurb">({s.how.join(', ')})</span>
          </span>
        ))}
      </span>
      <span className="tools-blurb">
        {[...lines.map((id) => `a male ${name(id)} hatched knowing it`), name(target)].join(' → ')}
      </span>
    </li>
  )
}
