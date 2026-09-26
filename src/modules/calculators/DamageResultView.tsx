import { FormSectionLabel } from '../../components/ds/FormParts'
import type { DamageResult } from './damage'

/**
 * The top of the screen, the reference calculator's arrangement: each Pokemon's
 * four moves with their percent against the other, one of the eight selected,
 * and that move's full line and every roll underneath.
 *
 * The line is the Showdown calculator's own wording, so a result here can be
 * pasted beside one from calc.pokemonshowdown.com and compared.
 */

export interface MoveResult {
  name: string
  result: DamageResult | null
  error: string | null
}

function summary(r: MoveResult): string {
  if (r.error) return 'error'
  if (!r.result) return '—'
  const reason = r.result.noDamageReason
  if (reason === 'immune' || reason === 'ability') return 'no effect'
  if (reason === 'variable') return 'not calculated'
  if (reason === 'status') return 'status'
  return `${r.result.percent[0]} – ${r.result.percent[1]}%`
}

export function MoveResultList({
  index,
  name,
  results,
  selected,
  onSelect,
}: {
  index: 0 | 1
  name: string
  /** One per slot; null where the slot is empty. */
  results: (MoveResult | null)[]
  /** The selected slot when this side's move is the selected one, else null. */
  selected: number | null
  onSelect: (slot: number) => void
}) {
  return (
    <div className="dcalc-move-results" data-testid={`dcalc-p${index + 1}-results`}>
      <FormSectionLabel>{`${name}’s moves`}</FormSectionLabel>
      <div className="dcalc-move-result-list">
        {results.map((r, slot) =>
          r ? (
            <button
              key={slot}
              type="button"
              className="dcalc-move-result"
              aria-pressed={selected === slot}
              data-selected={selected === slot ? 'true' : undefined}
              data-testid={`dcalc-p${index + 1}-result-${slot}`}
              onClick={() => onSelect(slot)}
            >
              <span className="dcalc-move-result-name">{r.name}</span>
              <span className="dcalc-move-result-pct num">{summary(r)}</span>
            </button>
          ) : (
            <span key={slot} className="dcalc-move-result dcalc-move-result-empty">
              <span className="dcalc-move-result-name">(empty)</span>
            </span>
          ),
        )}
      </div>
    </div>
  )
}

export function DamageResultView({ selected }: { selected: MoveResult | null }) {
  if (selected?.error) {
    return (
      <div className="dcalc-result" data-testid="calc-damage-result" data-state="error">
        <p className="dcalc-note" data-tone="alert">
          The calculation failed: {selected.error}
        </p>
      </div>
    )
  }
  const result = selected?.result
  if (!result) {
    return (
      <div className="dcalc-result" data-testid="calc-damage-result" data-state="empty">
        <p className="dcalc-note">Pick a move.</p>
      </div>
    )
  }

  const reason = result.noDamageReason
  const rolls = flattenRolls(result.damage)

  return (
    <div className="dcalc-result" data-testid="calc-damage-result" data-state={reason ?? 'damage'}>
      <p className="dcalc-result-line" data-testid="calc-damage-desc">
        {result.fullText}
      </p>
      {reason != null && (
        <p className="dcalc-note" data-testid="calc-damage-reason">
          {reason === 'status' && 'A status move — it deals no damage.'}
          {reason === 'immune' && 'No effect — the defender is immune to this type.'}
          {reason === 'ability' && 'No effect — blocked by the defender’s ability.'}
          {reason === 'variable' &&
            'Not calculated: this move’s damage comes from something the calculator does not model (a one-hit KO, a counter-attack, a fraction of HP).'}
        </p>
      )}
      {rolls && (
        <p className="dcalc-result-rolls" data-testid="calc-damage-rolls">
          Possible damage amounts:{' '}
          {rolls.map((line, i) => (
            <span key={i} className="num">
              {rolls.length > 1 ? `${i > 0 ? ' · ' : ''}hit ${i + 1}: ` : ''}({line.join(', ')})
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function flattenRolls(damage: DamageResult['damage']): number[][] | null {
  if (typeof damage === 'number') return damage > 0 ? [[damage]] : null
  if (damage.length === 0) return null
  if (typeof damage[0] === 'number') return [damage as number[]]
  return damage as number[][]
}
