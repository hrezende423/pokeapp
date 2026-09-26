import type { DamageResult } from './damage'

/**
 * The selected move's result: the range, the percent of max HP, the KO chance,
 * the reference-format description line and every roll.
 *
 * The description line is the Showdown calculator's own wording on purpose, so a
 * result here can be pasted beside one from calc.pokemonshowdown.com and compared.
 */
export function DamageResultView({
  result,
  moveName,
  error,
}: {
  result: DamageResult | null
  moveName: string | null
  error: string | null
}) {
  if (error) {
    return (
      <div className="dcalc-result" data-testid="calc-damage-result" data-state="error">
        <p className="dcalc-note" data-tone="alert">
          The calculation failed: {error}
        </p>
      </div>
    )
  }
  if (!result || !moveName) {
    return (
      <div className="dcalc-result" data-testid="calc-damage-result" data-state="empty">
        <p className="dcalc-note">Pick a move for the attacker.</p>
      </div>
    )
  }

  const reason = result.noDamageReason
  const rolls = flattenRolls(result.damage)

  return (
    <div className="dcalc-result" data-testid="calc-damage-result" data-state={reason ?? 'damage'}>
      <div className="dcalc-result-head">
        <span className="dcalc-result-move">{moveName}</span>
        {reason == null && (
          <>
            <span className="dcalc-result-range num" data-testid="calc-damage-range">
              {result.range[0]} – {result.range[1]}
            </span>
            <span className="dcalc-result-pct num" data-testid="calc-damage-percent">
              {result.percent[0]} – {result.percent[1]}%
            </span>
          </>
        )}
      </div>
      {reason == null && result.koText && (
        <p className="dcalc-result-ko" data-testid="calc-damage-ko">
          {result.koText}
        </p>
      )}
      {reason != null && (
        <p className="dcalc-result-ko" data-testid="calc-damage-reason">
          {reason === 'status' && 'A status move — it deals no damage.'}
          {reason === 'immune' && 'No effect — the defender is immune to this type.'}
          {reason === 'ability' && 'No effect — blocked by the defender’s ability.'}
          {reason === 'variable' &&
            'Not calculated: this move’s damage comes from something the calculator does not model (a one-hit KO, a counter-attack, a fraction of HP).'}
        </p>
      )}
      <p className="dcalc-result-desc" data-testid="calc-damage-desc">
        {result.fullText}
      </p>
      {rolls && (
        <p className="dcalc-result-rolls" data-testid="calc-damage-rolls">
          <span className="dcalc-result-rolls-label">Possible damage amounts</span>
          {rolls.map((line, i) => (
            <span key={i} className="num">
              {rolls.length > 1 ? `Hit ${i + 1}: ` : ''}
              {line.join(', ')}
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
