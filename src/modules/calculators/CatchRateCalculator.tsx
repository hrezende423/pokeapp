import { useMemo, useState } from 'react'
import {
  getSpecies,
  getType,
  listItems,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
} from '../../data'
import type { Species, Variety } from '../../data'
import { GEN2_DEX_WEIGHT_LB10 } from '../../data/gen2DexWeights'
import { SelectField } from '../../components/ds/SelectField'
import { TextField } from '../../components/ds/TextField'
import { Toggle } from '../../components/ds/Toggle'
import { speciesEntries } from '../dex/entrySources'
import { computeStat, type StatNumbers } from '../team-builder/statMath'
import { GameRow } from '../version-group/GameRow'
import { useVersionGroup } from '../version-group/context'
import { useGameInGeneration } from '../version-group/gameInGeneration'
import { MAIN_SERIES_GAMES } from '../tools/gates'
import { ToolResult } from '../tools/ToolShell'
import {
  NEUTRAL_CONTEXT,
  ballsFor,
  catchChance,
  catchEngineFor,
  oneInN,
  type Ball,
  type CatchContext,
  type CatchStatus,
  type CatchTarget,
} from './catchRateMath'

/**
 * Catch Rate Calculator (#8): one throw's chance, as the selected game computes
 * it -- every ball that game has, with the circumstances that ball reads.
 *
 * THE GAME, NOT ONLY THE GENERATION: Gen 4's two routines differ (HeartGold/
 * SoulSilver has the Apricorn balls and its own Heavy Ball bug), so the tab has
 * the in-generation game row. It cannot leave the app's generation.
 *
 * A WILD POKEMON'S MAX HP: no EVs or Stat Exp, and the HP IV/DV chosen here
 * (default the maximum). The current HP is typed as a number because the
 * routines floor it (Gen 1 divides it by 4, Gen 2 works in bytes).
 */

const include = (vg: string) => MAIN_SERIES_GAMES.includes(vg)

const STATUSES: { value: CatchStatus; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'sleep', label: 'Asleep' },
  { value: 'freeze', label: 'Frozen' },
  { value: 'paralysis', label: 'Paralyzed' },
  { value: 'burn', label: 'Burned' },
  { value: 'poison', label: 'Poisoned' },
]

const defaultVariety = (s: Species): Variety =>
  s.varieties.find((v) => v.is_default) ?? s.varieties[0]

/** Gen 1-2: the HP DV is packed from the other four, so pick DVs whose low bits spell it. */
function dvsForHp(hpDv: number): StatNumbers {
  const bit = (n: number) => (hpDv >> n) & 1
  return { attack: 14 + bit(3), defense: 14 + bit(2), speed: 14 + bit(1), special: 14 + bit(0) }
}

function genderOptions(s: Species | undefined): ('male' | 'female')[] {
  const rate = s?.gender_rate ?? -1
  if (rate < 0) return []
  if (rate === 0) return ['male']
  if (rate === 8) return ['female']
  return ['male', 'female']
}

export function CatchRateCalculator() {
  const { generation } = useVersionGroup()
  const scope = useGameInGeneration('calc-catch', include)
  const game = scope.versionGroup?.name ?? ''
  const engine = catchEngineFor(game, generation)
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const balls = ballsFor(engine)
  const ballName = (b: Ball) => listItems().find((i) => i.name === b)?.display_name ?? b

  const [speciesId, setSpeciesId] = useState<number>(species[0]?.id ?? 1)
  const [level, setLevel] = useState('30')
  const [hpIv, setHpIv] = useState(String(generation <= 2 ? 15 : 31))
  const [currentHp, setCurrentHp] = useState('')
  const [status, setStatus] = useState<CatchStatus>('none')
  const [ballPick, setBall] = useState<Ball>('poke-ball')
  const [ctx, setCtx] = useState<CatchContext>(NEUTRAL_CONTEXT)
  const [targetGender, setTargetGender] = useState<'male' | 'female'>('male')
  const ball = balls.includes(ballPick) ? ballPick : 'poke-ball'
  const patch = (p: Partial<CatchContext>) => setCtx((c) => ({ ...c, ...p }))

  const sp = getSpecies(speciesId)
  // Cheap enough to compute every render; a memo here could not be preserved by the compiler.
  const outcome = (() => {
    if (!sp) return { ok: false as const, reason: 'Pick a Pokémon.' }
    const lv = Number(level)
    if (!Number.isInteger(lv) || lv < 1 || lv > 100) {
      return { ok: false as const, reason: 'Level must be a whole number from 1 to 100.' }
    }
    const cap = generation <= 2 ? 15 : 31
    const iv = Number(hpIv)
    if (hpIv.trim() === '' || !Number.isInteger(iv) || iv < 0 || iv > cap) {
      return {
        ok: false as const,
        reason: `HP ${generation <= 2 ? 'DV' : 'IV'} must be a whole number from 0 to ${cap}.`,
      }
    }
    const variety = defaultVariety(sp)
    const stats = resolveStatsForGeneration(variety, generation)
    const base = (name: string) => stats.find((s) => s.stat === name)?.base_stat ?? 0
    const maxHp = computeStat({
      generation,
      level: lv,
      base: base('hp'),
      key: 'hp',
      effort: {},
      individual: generation <= 2 ? dvsForHp(iv) : { hp: iv },
      nature: { increased: null, decreased: null },
    })
    const hp = currentHp.trim() === '' ? maxHp : Number(currentHp)
    if (!Number.isInteger(hp) || hp < 1 || hp > maxHp) {
      return { ok: false as const, reason: `Current HP must be a whole number from 1 to ${maxHp}.` }
    }
    const genders = genderOptions(sp)
    const target: CatchTarget = {
      speciesId: sp.id,
      catchRate: sp.capture_rate ?? 45,
      level: lv,
      maxHp,
      currentHp: hp,
      status,
      types: resolveTypesForGeneration(variety, generation).map(
        (t) => getType(t.type_id)?.name ?? '',
      ),
      baseSpeed: base('speed'),
      weightHg: variety.weight ?? 0,
      gen2WeightLb10: GEN2_DEX_WEIGHT_LB10[sp.id] ?? null,
      gender:
        genders.length === 0
          ? 'genderless'
          : genders.includes(targetGender)
            ? targetGender
            : genders[0],
    }
    return { ok: true as const, maxHp, hp, result: catchChance(engine, target, ball, ctx) }
  })()

  const yourSpecies = ctx.yourSpeciesId != null ? getSpecies(ctx.yourSpeciesId) : undefined

  return (
    <div className="calc-tool" data-testid="calc-catch-rate" data-engine={engine}>
      {/* Segments, not the nav variant: this screen already has its tab strip
          and the app bar's active item -- a third accent would break the two-per-screen rule. */}
      <GameRow scope={scope} testId="catch-game-row" />
      <div className="calc-section">
        <h2 className="calc-section-heading">Target</h2>
        <div className="calc-row">
          <SelectField
            label="Species"
            options={species.map((s) => ({ value: String(s.id), label: s.display_name }))}
            value={String(speciesId)}
            data-testid="catch-species"
            onChange={(e) => setSpeciesId(Number(e.target.value))}
          />
          <TextField
            label="Level"
            type="number"
            value={level}
            data-testid="catch-level"
            onChange={(e) => setLevel(e.target.value)}
          />
          <TextField
            label={generation <= 2 ? 'HP DV' : 'HP IV'}
            type="number"
            value={hpIv}
            data-testid="catch-hp-iv"
            onChange={(e) => setHpIv(e.target.value)}
          />
          <TextField
            label={outcome.ok ? `Current HP (of ${outcome.maxHp})` : 'Current HP'}
            type="number"
            placeholder={outcome.ok ? String(outcome.maxHp) : ''}
            value={currentHp}
            data-testid="catch-hp"
            onChange={(e) => setCurrentHp(e.target.value)}
          />
          <SelectField
            label="Status"
            options={STATUSES}
            value={status}
            data-testid="catch-status"
            onChange={(e) => setStatus(e.target.value as CatchStatus)}
          />
          {genderOptions(sp).length > 1 && ball === 'love-ball' && (
            <SelectField
              label="Its gender"
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
              value={targetGender}
              onChange={(e) => setTargetGender(e.target.value as 'male' | 'female')}
            />
          )}
        </div>
      </div>

      <div className="calc-section">
        <h2 className="calc-section-heading">Throw</h2>
        <div className="calc-row">
          <SelectField
            label="Ball"
            options={balls.map((b) => ({ value: b, label: ballName(b) }))}
            value={ball}
            data-testid="catch-ball"
            onChange={(e) => setBall(e.target.value as Ball)}
          />
          {ball === 'level-ball' && (
            <TextField
              label="Your Pokémon’s level"
              type="number"
              value={String(ctx.yourLevel)}
              data-testid="catch-your-level"
              onChange={(e) =>
                patch({ yourLevel: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })
              }
            />
          )}
          {(ball === 'quick-ball' || ball === 'timer-ball') && (
            <TextField
              label="Turns already taken"
              type="number"
              value={String(ctx.turns)}
              data-testid="catch-turns"
              onChange={(e) => patch({ turns: Math.max(0, Number(e.target.value) || 0) })}
            />
          )}
          {ball === 'safari-ball' && (engine === 'gen4' || engine === 'hgss') && (
            <SelectField
              label="Safari caution stage"
              options={Array.from({ length: 13 }, (_, i) => ({
                value: String(i),
                label: i === 6 ? 'Neutral' : String(i - 6),
              }))}
              value={String(ctx.safariStage)}
              onChange={(e) => patch({ safariStage: Number(e.target.value) })}
            />
          )}
          {ball === 'love-ball' && (
            <>
              <SelectField
                label="Your Pokémon"
                options={[
                  { value: '', label: 'Choose…' },
                  ...species.map((s) => ({ value: String(s.id), label: s.display_name })),
                ]}
                value={ctx.yourSpeciesId != null ? String(ctx.yourSpeciesId) : ''}
                data-testid="catch-your-species"
                onChange={(e) =>
                  patch({ yourSpeciesId: e.target.value ? Number(e.target.value) : null })
                }
              />
              {genderOptions(yourSpecies).length > 0 && (
                <SelectField
                  label="Your Pokémon’s gender"
                  options={genderOptions(yourSpecies).map((g) => ({
                    value: g,
                    label: g === 'male' ? 'Male' : 'Female',
                  }))}
                  value={
                    ctx.yourGender === 'genderless' ? genderOptions(yourSpecies)[0] : ctx.yourGender
                  }
                  onChange={(e) => patch({ yourGender: e.target.value as 'male' | 'female' })}
                />
              )}
            </>
          )}
        </div>
        <div className="calc-toggle-row">
          {ball === 'lure-ball' && (
            <Toggle on={ctx.fishing} label="Fishing" onChange={(v) => patch({ fishing: v })} />
          )}
          {ball === 'dive-ball' && (
            <Toggle
              on={ctx.underwater}
              label="Underwater"
              onChange={(v) => patch({ underwater: v })}
            />
          )}
          {ball === 'dusk-ball' && (
            <Toggle
              on={ctx.nightOrCave}
              label="Night or in a cave"
              onChange={(v) => patch({ nightOrCave: v })}
            />
          )}
          {ball === 'repeat-ball' && (
            <Toggle
              on={ctx.caughtBefore}
              label="Already caught one"
              onChange={(v) => patch({ caughtBefore: v })}
            />
          )}
        </div>
      </div>

      <ToolResult reason={outcome.ok ? null : outcome.reason}>
        {outcome.ok && (
          <div data-testid="calc-catch-rate-result">
            {outcome.result.guaranteed ? (
              <p className="calc-result-headline" data-testid="catch-percent">
                Guaranteed catch
              </p>
            ) : (
              <>
                <p className="calc-result-headline">
                  <span className="num" data-testid="catch-percent">
                    {(outcome.result.probability * 100).toFixed(2)}%
                  </span>{' '}
                  per throw
                </p>
                <p className="calc-result-note">
                  {oneInN(outcome.result.probability) != null
                    ? `About 1 in ${oneInN(outcome.result.probability)} throws.`
                    : 'This ball cannot catch it.'}
                </p>
              </>
            )}
            <p className="calc-result-note">
              {outcome.hp} / {outcome.maxHp} HP · catch rate {sp?.capture_rate} ·
              {engine === 'gen1'
                ? 'HP factor'
                : engine === 'gen2'
                  ? 'final catch byte'
                  : 'modified catch rate'}{' '}
              <span className="num">{outcome.result.value}</span>
            </p>
            {outcome.result.note && (
              <p className="calc-result-note" data-testid="catch-note">
                {outcome.result.note}
              </p>
            )}
          </div>
        )}
      </ToolResult>
    </div>
  )
}
