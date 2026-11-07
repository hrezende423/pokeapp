import { useState } from 'react'
import { TextField } from '../../../components/ds/TextField'
import { TypeLabel } from '../../../components/ds/TypeLabel'
import type { StatKey } from '../../team-builder/statMath'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { HP_LABEL, hiddenPowerKeys, individualCap, readHiddenPower } from './hiddenPowerMath'

const TOOL = findTool('2')!

/**
 * #2 Hidden Power: its type and power from a spread.
 *
 * Gen 2 asks for four DVs (Attack, Defense, Speed, Special) and Gen 3-4 for six
 * IVs; the fields follow the app's generation. Fields keep their raw text, so an
 * empty or out-of-range value becomes a sentence in the result rather than a 0.
 */
export function HiddenPowerTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!}>
      {({ generation }) => <HiddenPowerBody key={generation} generation={generation} />}
    </ToolShell>
  )
}

function HiddenPowerBody({ generation }: { generation: number }) {
  const cap = individualCap(generation)
  const word = generation <= 2 ? 'DV' : 'IV'
  // Every field starts at the cap: the most common question is "what does a
  // perfect spread give", and an all-empty form would open on a reason.
  const [raw, setRaw] = useState<Partial<Record<StatKey, string>>>(() =>
    Object.fromEntries(hiddenPowerKeys(generation).map((k) => [k, String(cap)])),
  )
  const outcome = readHiddenPower(generation, raw)

  return (
    <>
      <ToolInputs>
        <h2 className="calc-section-heading">{word}s</h2>
        <div className="calc-row">
          {hiddenPowerKeys(generation).map((key) => (
            <TextField
              key={key}
              label={`${HP_LABEL[key]} ${word}`}
              type="number"
              min={0}
              max={cap}
              value={raw[key] ?? ''}
              data-testid={`hp-input-${key}`}
              onChange={(e) => setRaw((r) => ({ ...r, [key]: e.target.value }))}
            />
          ))}
        </div>
      </ToolInputs>
      <ToolResult reason={outcome.ok ? null : outcome.reason}>
        {outcome.ok && (
          <>
            <div className="calc-result-headline" data-testid="hp-result">
              <span data-testid="hp-type">
                <TypeLabel type={outcome.type} />
              </span>{' '}
              <span className="num" data-testid="hp-power">
                {outcome.power}
              </span>
            </div>
            <p className="calc-result-note">
              {generation <= 2
                ? `Power 31–70 in Gen 2. HP DV ${outcome.hpDv}, packed from the other four.`
                : 'Power 30–70 in Gen 3–4.'}
            </p>
          </>
        )}
      </ToolResult>
    </>
  )
}
