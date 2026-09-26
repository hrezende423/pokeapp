import { useMemo, useState } from 'react'
import { getAbility, getMove, getType, resolveTypesForGeneration } from '../../data'
import { CompactFieldStrip } from '../../components/ds/FormParts'
import { SelectField } from '../../components/ds/SelectField'
import { calculateDamage } from './damage'
import {
  DEFAULT_ATTACKER_ID,
  DEFAULT_DEFENDER_ID,
  MOVE_SLOT_COUNT,
  defaultMoves,
  emptyDualField,
  fieldFor,
  newSide,
  normalizeField,
  normalizeSide,
  toCalcPokemon,
  varietyOf,
  type DualField,
  type SideState,
} from './damageCalcState'
import { DamageFieldPanel } from './DamageFieldPanel'
import { DamagePokemonPanel } from './DamagePokemonPanel'
import { DamageResultView, MoveResultList, type MoveResult } from './DamageResultView'
import { useDamageCalcScope } from './useDamageCalcScope'
import { useGenerationLearnset } from './useGenerationLearnset'

/**
 * Damage Calculator, Generations 1-4, singles, one Pokemon against another.
 *
 * LAID OUT AS THE SHOWDOWN CALCULATOR IS -- both Pokemon's moves with their
 * percent across the top, one of the eight selected and its full line under
 * them, then Pokemon 1 | Field | Pokemon 2 -- in this app's controls and a
 * smaller type scale scoped to this screen. EVERY MOVE IS CALCULATED IN BOTH
 * DIRECTIONS, so there is no attacker/defender role and no swap.
 *
 * THE ENGINE IS ./damage -- a port of the Showdown calculator's gen12/gen3/gen4
 * mechanics against pokeapp's own data -- and this file is only its form.
 *
 * ITS OWN GENERATION (useDamageCalcScope), the third sanctioned exception to the
 * app-wide selector. Switching it normalizes both sides and the field into the
 * new era in the same update, and each side remembers what an older era took
 * away so a round trip gives it back.
 *
 * MOVES DEFAULT TO THE LEARNSET, per Pokemon, with an "Any" switch for
 * hypotheticals.
 */

const OTHER = { 0: 1, 1: 0 } as const

export function DamageCalculator() {
  const scope = useDamageCalcScope()
  const gen = scope.generation

  const [sides, setSides] = useState<[SideState, SideState]>(() => [
    newSide(DEFAULT_ATTACKER_ID, gen),
    newSide(DEFAULT_DEFENDER_ID, gen),
  ])
  const [field, setField] = useState<DualField>(() => emptyDualField())
  const [selected, setSelected] = useState<{ side: 0 | 1; slot: number }>({ side: 0, slot: 0 })
  const [anyMove, setAnyMove] = useState<[boolean, boolean]>([false, false])

  const setSide = (i: 0 | 1) => (next: SideState) =>
    setSides((s) => (i === 0 ? [next, s[1]] : [s[0], next]))

  const setGeneration = (next: number) => {
    scope.setGeneration(next)
    setSides((s) => [
      normalizeSide(s[0], next, DEFAULT_ATTACKER_ID),
      normalizeSide(s[1], next, DEFAULT_DEFENDER_ID),
    ])
    setField((f) => normalizeField(f, next))
  }

  const learn0 = useGenerationLearnset(sides[0].speciesId, varietyOf(sides[0]).pokemon_id, gen)
  const learn1 = useGenerationLearnset(sides[1].speciesId, varietyOf(sides[1]).pokemon_id, gen)
  const rows0 = learn0.state.status === 'ready' ? learn0.state.rows : null
  const rows1 = learn1.state.status === 'ready' ? learn1.state.rows : null

  const moves0 = useSideMoves(sides[0], rows0, gen)
  const moves1 = useSideMoves(sides[1], rows1, gen)

  const results = useMemo(() => {
    const mons = [toCalcPokemon(sides[0]), toCalcPokemon(sides[1])]
    const run = (i: 0 | 1, moves: (number | null)[]): (MoveResult | null)[] =>
      moves.map((id, slot) => {
        const move = id != null ? getMove(id) : undefined
        if (!move) return null
        const side = sides[i]
        try {
          return {
            name: move.display_name,
            error: null,
            result: calculateDamage(
              gen,
              mons[i],
              mons[OTHER[i]],
              {
                move,
                isCrit: side.crit[slot],
                hits: side.hits[slot],
                powerOverride: side.power[slot],
              },
              fieldFor(field, i),
            ),
          }
        } catch (err) {
          return {
            name: move.display_name,
            result: null,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      })
    return [run(0, moves0), run(1, moves1)] as const
  }, [sides, field, gen, moves0, moves1])

  const hasRivalry = sides.some(
    (s) => gen >= 4 && s.abilityId != null && getAbility(s.abilityId)?.name === 'rivalry',
  )
  const names: [string, string] = [displayName(sides[0]), displayName(sides[1])]
  const current = results[selected.side][selected.slot] ?? null

  return (
    <div className="calc-tool dcalc" data-testid="calc-damage" data-generation={gen}>
      <div className="dcalc-grid" data-layout="damage-calc">
        <div className="dcalc-scope" data-layout="dcalc-scope">
          <CompactFieldStrip testId="dcalc-scope">
            <SelectField
              label="Generation"
              options={scope.generations.map((g) => ({ value: String(g), label: `Gen ${g}` }))}
              value={String(gen)}
              data-testid="dcalc-generation"
              onChange={(e) => setGeneration(Number(e.target.value))}
            />
          </CompactFieldStrip>
        </div>

        <div className="dcalc-results" data-layout="dcalc-results">
          {([0, 1] as const).map((i) => (
            <MoveResultList
              key={i}
              index={i}
              name={names[i]}
              results={results[i]}
              selected={selected.side === i ? selected.slot : null}
              onSelect={(slot) => setSelected({ side: i, slot })}
            />
          ))}
        </div>

        <div className="dcalc-result-area" data-layout="dcalc-result">
          <DamageResultView selected={current} />
        </div>

        {([0, 1] as const).map((i) => (
          <DamagePokemonPanel
            key={i}
            index={i}
            gen={gen}
            side={sides[i]}
            onChange={setSide(i)}
            showGender={hasRivalry}
            anyMove={anyMove[i]}
            onAnyMove={(v) => setAnyMove((a) => (i === 0 ? [v, a[1]] : [a[0], v]))}
            learnset={i === 0 ? learn0 : learn1}
            moves={i === 0 ? moves0 : moves1}
          />
        ))}

        <DamageFieldPanel gen={gen} field={field} names={names} onChange={setField} />
      </div>
    </div>
  )
}

/** A side's four slots: its own once edited, otherwise the learnset's defaults. */
function useSideMoves(side: SideState, learnRows: number[] | null, gen: number) {
  const variety = varietyOf(side)
  return useMemo<(number | null)[]>(() => {
    if (side.moves) return side.moves
    if (!learnRows) return Array(MOVE_SLOT_COUNT).fill(null)
    const types = resolveTypesForGeneration(variety, gen).map((t) => getType(t.type_id)?.name ?? '')
    return defaultMoves(learnRows, gen, types)
  }, [side.moves, learnRows, gen, variety])
}

function displayName(side: SideState): string {
  const p = toCalcPokemon(side)
  const v = p.variety
  if (v.is_default || !v.name.startsWith(`${p.species.name}-`)) return p.species.display_name
  const form = v.name
    .slice(p.species.name.length + 1)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')
  return `${p.species.display_name}-${form}`
}
