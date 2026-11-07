import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { TextField } from '../../../components/ds/TextField'
import { Toggle } from '../../../components/ds/Toggle'
import { getMove } from '../../../data'
import { DamageFieldPanel } from '../../calculators/DamageFieldPanel'
import { DamagePokemonPanel } from '../../calculators/DamagePokemonPanel'
import {
  DEFAULT_ATTACKER_ID,
  DEFAULT_DEFENDER_ID,
  emptyDualField,
  fieldFor,
  newSide,
  toCalcPokemon,
  type DualField,
  type SideState,
} from '../../calculators/damageCalcState'
import {
  setCatalog,
  speciesPickerOptions,
  useTrainerSetPartitions,
} from '../../calculators/damageSets'
import { useGenerationLearnset } from '../../calculators/useGenerationLearnset'
import { useSideMoves } from '../../calculators/useSideMoves'
import { useTeamBuilderData } from '../../team-builder/store'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { readBulk, type BulkPlan } from './bulkMath'

const TOOL = findTool('7')!

/**
 * #7 Defensive bulk: the least HP and Defense (or Sp. Def) effort that survives
 * one hit with HP to spare. Both Pokemon are the Damage Calculator's own panels
 * -- set lists, spreads, items, abilities, stages -- so a hit here is the same
 * hit as there; the move is one of the attacker's four.
 */
export function BulkTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!}>
      {({ generation, game }) =>
        game ? <BulkBody key={generation} gen={generation} game={game.name} /> : null
      }
    </ToolShell>
  )
}

function BulkBody({ gen, game }: { gen: number; game: string }) {
  const [sides, setSides] = useState<[SideState, SideState]>(() => [
    newSide(DEFAULT_ATTACKER_ID, gen),
    newSide(DEFAULT_DEFENDER_ID, gen),
  ])
  const [field, setField] = useState<DualField>(emptyDualField)
  const [slot, setSlot] = useState(0)
  const [isCrit, setCrit] = useState(false)
  const [keep, setKeep] = useState('0')
  const [anyMove, setAnyMove] = useState<[boolean, boolean]>([false, false])

  const setSide = (i: 0 | 1) => (next: SideState) =>
    setSides((s) => (i === 0 ? [next, s[1]] : [s[0], next]))
  const learn0 = useGenerationLearnset(
    sides[0].speciesId,
    toCalcPokemon(sides[0]).variety.pokemon_id,
    gen,
  )
  const learn1 = useGenerationLearnset(
    sides[1].speciesId,
    toCalcPokemon(sides[1]).variety.pokemon_id,
    gen,
  )
  const moves0 = useSideMoves(
    sides[0],
    learn0.state.status === 'ready' ? learn0.state.rows : null,
    gen,
  )
  const moves1 = useSideMoves(
    sides[1],
    learn1.state.status === 'ready' ? learn1.state.rows : null,
    gen,
  )
  const partitions = useTrainerSetPartitions(game)
  const builds = useTeamBuilderData()
  const catalog = useMemo(
    () => setCatalog(speciesPickerOptions(gen), partitions, builds, gen),
    [gen, partitions, builds],
  )

  const moveId = moves0[slot] ?? null
  const move = moveId != null ? getMove(moveId) : undefined
  const keepPct = keep.trim() === '' ? NaN : Number(keep)
  const outcome = useMemo(() => {
    if (!move) return { ok: false as const, reason: 'Pick the attacker’s move.' }
    try {
      return readBulk({
        gen,
        attacker: toCalcPokemon(sides[0]),
        defender: toCalcPokemon(sides[1]),
        move,
        isCrit,
        field: fieldFor(field, 0),
        keepPct,
      })
    } catch (err) {
      return { ok: false as const, reason: err instanceof Error ? err.message : String(err) }
    }
  }, [gen, sides, move, isCrit, field, keepPct])

  const effort = gen <= 2 ? 'Stat Exp' : 'EVs'
  const line = (p: BulkPlan, defLabel: string) =>
    `${p.hp} HP / ${p.def} ${defLabel} ${effort} — ${p.maxHp} HP, highest roll ${p.maxDamage}, ${p.left} left`

  return (
    <>
      <ToolInputs>
        <div className="calc-row">
          <SelectField
            label="Attacker’s move"
            options={moves0.map((id, i) => ({
              value: String(i),
              label: id != null ? (getMove(id)?.display_name ?? '—') : '—',
            }))}
            value={String(slot)}
            data-testid="bulk-move"
            onChange={(e) => setSlot(Number(e.target.value))}
          />
          <TextField
            label="Keep at least (% HP)"
            type="number"
            min={0}
            max={99}
            value={keep}
            data-testid="bulk-keep"
            onChange={(e) => setKeep(e.target.value)}
          />
        </div>
        <div className="calc-toggle-row">
          <Toggle on={isCrit} label="Critical hit" onChange={setCrit} />
        </div>
        {/* The panels are sized for the Damage Calculator's own type scale and
            container, which live on its `.dcalc` root: reuse that, not the page. */}
        <div className="dcalc">
          <div className="dcalc-grid">
            {([0, 1] as const).map((i) => (
              <DamagePokemonPanel
                key={i}
                index={i}
                gen={gen}
                side={sides[i]}
                onChange={setSide(i)}
                showGender={false}
                anyMove={anyMove[i]}
                onAnyMove={(v) => setAnyMove((a) => (i === 0 ? [v, a[1]] : [a[0], v]))}
                learnset={i === 0 ? learn0 : learn1}
                moves={i === 0 ? moves0 : moves1}
                catalog={catalog}
              />
            ))}
            <DamageFieldPanel
              gen={gen}
              field={field}
              names={['Attacker', 'Defender']}
              onChange={setField}
            />
          </div>
        </div>
      </ToolInputs>
      <ToolResult reason={outcome.ok ? null : outcome.reason}>
        {outcome.ok && (
          <>
            <div className="calc-result-headline" data-testid="bulk-best">
              {outcome.best?.total === 0 ? (
                'No investment needed'
              ) : outcome.best ? (
                <>
                  <span className="num">{outcome.best.hp}</span> HP /{' '}
                  <span className="num">{outcome.best.def}</span> {outcome.defLabel} {effort}
                </>
              ) : (
                'No spread survives this hit'
              )}
            </div>
            {outcome.best && (
              <p className="calc-result-note" data-testid="bulk-best-detail">
                {line(outcome.best, outcome.defLabel)}.
              </p>
            )}
            <p className="calc-result-note" data-testid="bulk-current">
              As set: {line(outcome.current, outcome.defLabel)}.
            </p>
            <p className="calc-result-note" data-testid="bulk-hp-only">
              HP alone (defence as set):{' '}
              {outcome.hpOnly ? line(outcome.hpOnly, outcome.defLabel) : 'not enough'}.
            </p>
            <p className="calc-result-note" data-testid="bulk-def-only">
              {outcome.defLabel} alone (HP as set):{' '}
              {outcome.defOnly ? line(outcome.defOnly, outcome.defLabel) : 'not enough'}.
            </p>
          </>
        )}
      </ToolResult>
    </>
  )
}
