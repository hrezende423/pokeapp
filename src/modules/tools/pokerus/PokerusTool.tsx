import { useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { TextField } from '../../../components/ds/TextField'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { chancesAfter, rulesFor, settle, type Reach, type Rules, type Slot } from './pokerusMath'

const TOOL = findTool('17')!
const MAX_BATTLES = 500

/**
 * #17 Pokérus: given who in the party has it now, the chance each member has it
 * after so many battles, where the spread stops, and how long that takes -- by
 * the selected game's own routine.
 */
export function PokerusTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ game }) => (game ? <PokerusBody key={game.name} game={game.name} /> : null)}
    </ToolShell>
  )
}

const SLOT_LABEL: Record<Slot, string> = {
  none: 'Never had it',
  active: 'Has it now',
  cured: 'Cured',
}
const REACH_LABEL: Record<Reach, string> = {
  always: 'Catches it',
  sometimes: 'Depends on the rolls',
  never: 'Never catches it',
}
const WHEN: Record<Exclude<Rules, 'none'>, string> = {
  gen2: 'Rolled after every battle you win, 1 in 3. Only the first infected member spreads, to one side. A fresh infection (3 in 65,536) needs Goldenrod City reached and nobody infected.',
  gen34:
    'Rolled after every battle except link battles, win or lose, 1 in 3. Every infected member spreads to both neighbours. A fresh infection is 3 in 65,536 per battle.',
}

const pct = (p: number) =>
  p >= 0.9995 ? '100%' : p > 0 && p < 0.001 ? '<0.1%' : `${(p * 100).toFixed(1)}%`

function PokerusBody({ game }: { game: string }) {
  const rules = rulesFor(game)
  const [party, setParty] = useState<Slot[]>(['active', 'none', 'none', 'none', 'none', 'none'])
  const [battles, setBattles] = useState('10')
  const [days, setDays] = useState(1)

  const n = Number(battles)
  const reason =
    rules == null
      ? 'Pick a game.'
      : rules === 'none'
        ? 'FireRed and LeafGreen never give or spread Pokérus: both routines are empty in the game. A Pokémon traded in keeps it, and it never wears off there.'
        : !party.includes('active')
          ? 'Mark at least one party member as having it now.'
          : !Number.isInteger(n) || n < 1 || n > MAX_BATTLES
            ? `Battles must be a whole number from 1 to ${MAX_BATTLES}.`
            : null
  const live = reason == null && rules != null && rules !== 'none'
  const chances = live ? chancesAfter(rules, party, n, days) : []
  const settled = live ? settle(rules, party, days) : null

  return (
    <>
      <ToolInputs>
        <div className="calc-row">
          <SelectField
            label="Party size"
            options={[1, 2, 3, 4, 5, 6].map((k) => ({ value: String(k), label: String(k) }))}
            value={String(party.length)}
            data-testid="pkr-size"
            onChange={(e) => {
              const k = Number(e.target.value)
              setParty((p) => Array.from({ length: k }, (_, i) => p[i] ?? 'none'))
            }}
          />
          <TextField
            label="Battles"
            type="number"
            value={battles}
            data-testid="pkr-battles"
            onChange={(e) => setBattles(e.target.value)}
          />
          {rules === 'gen2' && (
            <SelectField
              label="Strain lasts"
              options={[1, 2, 3, 4].map((d) => ({
                value: String(d),
                label: `${d} day${d > 1 ? 's' : ''}`,
              }))}
              value={String(days)}
              data-testid="pkr-days"
              onChange={(e) => setDays(Number(e.target.value))}
            />
          )}
        </div>
        <div className="calc-row">
          {party.map((s, i) => (
            <SelectField
              key={i}
              label={`Slot ${i + 1}`}
              options={(Object.keys(SLOT_LABEL) as Slot[]).map((v) => ({
                value: v,
                label: SLOT_LABEL[v],
              }))}
              value={s}
              data-testid={`pkr-slot-${i + 1}`}
              onChange={(e) =>
                setParty((p) => p.map((x, k) => (k === i ? (e.target.value as Slot) : x)))
              }
            />
          ))}
        </div>
        {rules && rules !== 'none' && <p className="calc-result-note">{WHEN[rules]}</p>}
        {rules === 'gen2' && days === 4 && (
          <p className="calc-result-note" data-testid="pkr-gen2-quirk">
            A 4-day strain stalls in Gen 2: the game tests the days with a 2-bit mask, so an
            infected member with 4 days left reads as cured and stops the search past it.
          </p>
        )}
      </ToolInputs>
      <ToolResult reason={reason}>
        {settled && (
          <>
            <p className="calc-result-note" data-testid="pkr-expected">
              {settled.battles === 0
                ? 'It cannot spread any further.'
                : `About ${settled.battles.toFixed(1)} battles on average until it has spread as far as it can (same day).`}
            </p>
            <div className="tools-compare-scroll">
              <table className="tools-compare" data-testid="pkr-table">
                <thead>
                  <tr>
                    <th scope="col">Slot</th>
                    <th scope="col">Now</th>
                    <th scope="col">After {n}</th>
                    <th scope="col">In the end</th>
                  </tr>
                </thead>
                <tbody>
                  {party.map((s, i) => (
                    <tr key={i} data-testid={`pkr-row-${i + 1}`} data-chance={chances[i]}>
                      <th scope="row">{i + 1}</th>
                      <td>{SLOT_LABEL[s]}</td>
                      <td className="num">{s === 'cured' ? '—' : pct(chances[i])}</td>
                      <td>{s === 'cured' ? 'Immune' : REACH_LABEL[settled.reached[i]]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </ToolResult>
    </>
  )
}
