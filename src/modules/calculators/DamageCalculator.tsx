import { useMemo, useState } from 'react'
import { IconArrowsLeftRight } from '@tabler/icons-react'
import { getAbility, getMove } from '../../data'
import { Button } from '../../components/ds/Button'
import { CompactFieldStrip } from '../../components/ds/FormParts'
import { SelectField } from '../../components/ds/SelectField'
import { resolveTypesForGeneration, getType } from '../../data'
import { calculateDamage, emptyField, type CalcField, type DamageResult } from './damage'
import {
  DEFAULT_ATTACKER_ID,
  DEFAULT_DEFENDER_ID,
  MOVE_SLOT_COUNT,
  defaultMoves,
  newSide,
  normalizeField,
  normalizeSide,
  toCalcPokemon,
  varietyOf,
  type SideState,
} from './damageCalcState'
import { DamageFieldPanel } from './DamageFieldPanel'
import { DamagePokemonPanel } from './DamagePokemonPanel'
import { DamageResultView } from './DamageResultView'
import { useDamageCalcScope } from './useDamageCalcScope'
import { useGenerationLearnset } from './useGenerationLearnset'

/**
 * Damage Calculator, Generations 1-4, singles, one attacker against one defender.
 *
 * THE ENGINE IS ./damage -- a port of the Showdown calculator's gen12/gen3/gen4
 * mechanics against pokeapp's own data -- and this file is only its form. Every
 * number on screen comes out of `calculateDamage`; nothing here does arithmetic
 * on a stat beyond what the form needs to display.
 *
 * ITS OWN GENERATION (useDamageCalcScope), the third sanctioned exception to the
 * app-wide selector -- see that hook. Switching it normalizes both sides and the
 * field into the new era in the same update (normalizeSide/normalizeField), so no
 * frame renders a Gen 3 ability on a Gen 2 Pokemon.
 *
 * MOVES DEFAULT TO THE LEARNSET, with an "Any" switch for hypotheticals. The four
 * slots start as the attacker's four strongest learnable moves; the tiles each show
 * their result and the selected one opens in full above the panels -- the
 * reference calculator's own arrangement.
 *
 * Out of scope for this pass, and nothing here blocks them: doubles (spread
 * reduction is a field flag the Gen 3-4 modules have the reference's slot for),
 * and a whole-dex table (calculateDamage in a loop).
 */
export function DamageCalculator() {
  const scope = useDamageCalcScope()
  const gen = scope.generation

  const [attacker, setAttacker] = useState<SideState>(() => newSide(DEFAULT_ATTACKER_ID, gen))
  const [defender, setDefender] = useState<SideState>(() => newSide(DEFAULT_DEFENDER_ID, gen))
  const [field, setField] = useState<CalcField>(() => emptyField())
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [anyMove, setAnyMove] = useState(false)

  const setGeneration = (next: number) => {
    scope.setGeneration(next)
    setAttacker((s) => normalizeSide(s, next, DEFAULT_ATTACKER_ID))
    setDefender((s) => normalizeSide(s, next, DEFAULT_DEFENDER_ID))
    setField((f) => normalizeField(f, next))
  }

  const swap = () => {
    setAttacker(defender)
    setDefender(attacker)
    setSelectedSlot(0)
  }

  const learnset = useGenerationLearnset(attacker.speciesId, varietyOf(attacker).pokemon_id, gen)
  const learnRows = learnset.state.status === 'ready' ? learnset.state.rows : null
  const attackerVariety = varietyOf(attacker)
  const moves = useMemo<(number | null)[]>(() => {
    if (attacker.moves) return attacker.moves
    if (!learnRows) return Array(MOVE_SLOT_COUNT).fill(null)
    const types = resolveTypesForGeneration(attackerVariety, gen).map(
      (t) => getType(t.type_id)?.name ?? '',
    )
    return defaultMoves(learnRows, gen, types)
  }, [attacker.moves, learnRows, gen, attackerVariety])

  const { results, errors } = useMemo(() => {
    const a = toCalcPokemon(attacker)
    const d = toCalcPokemon(defender)
    const out: (DamageResult | null)[] = []
    const errs: (string | null)[] = []
    moves.forEach((id, slot) => {
      const move = id != null ? getMove(id) : undefined
      if (!move) {
        out.push(null)
        errs.push(null)
        return
      }
      try {
        out.push(
          calculateDamage(
            gen,
            a,
            d,
            {
              move,
              isCrit: attacker.crit[slot],
              hits: attacker.hits[slot],
              powerOverride: attacker.power[slot],
            },
            field,
          ),
        )
        errs.push(null)
      } catch (err) {
        out.push(null)
        errs.push(err instanceof Error ? err.message : String(err))
      }
    })
    return { results: out, errors: errs }
  }, [attacker, defender, field, gen, moves])

  const attackerHasRivalry =
    gen >= 4 && attacker.abilityId != null && getAbility(attacker.abilityId)?.name === 'rivalry'
  const selectedMove = moves[selectedSlot] != null ? getMove(moves[selectedSlot]!) : undefined

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
          <Button variant="secondary" onClick={swap} data-testid="dcalc-swap">
            <IconArrowsLeftRight size={16} stroke={1.5} aria-hidden /> Swap sides
          </Button>
        </div>

        <div className="dcalc-result-area" data-layout="dcalc-result">
          <DamageResultView
            result={results[selectedSlot] ?? null}
            moveName={selectedMove?.display_name ?? null}
            error={errors[selectedSlot] ?? null}
          />
        </div>

        <DamagePokemonPanel
          role="attacker"
          gen={gen}
          side={attacker}
          onChange={setAttacker}
          showMoves
          showGender={attackerHasRivalry}
          anyMove={anyMove}
          onAnyMove={setAnyMove}
          results={results}
          selectedSlot={selectedSlot}
          onSelectSlot={setSelectedSlot}
          learnset={learnset}
          moves={moves}
        />
        <DamagePokemonPanel
          role="defender"
          gen={gen}
          side={defender}
          onChange={setDefender}
          showMoves={false}
          showGender={attackerHasRivalry}
          anyMove={anyMove}
          onAnyMove={setAnyMove}
          results={[]}
          selectedSlot={0}
          onSelectSlot={() => {}}
          learnset={learnset}
          moves={[]}
        />
        <DamageFieldPanel gen={gen} field={field} onChange={setField} />
      </div>
    </div>
  )
}
