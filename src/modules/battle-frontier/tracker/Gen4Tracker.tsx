import { useState } from 'react'
import { GAME_SCOPE } from '../reference/games'
import { GEN4_FACILITIES, HGSS_FLAG, type Gen4FacilityId } from '../reference/gen4'
import { gen4GameOf, updateGen4Game, type Gen4TrackerGame } from './model'
import { nextBrain, nextBrainText, setBest, setStreak, togglePrint, type Gen4FacilityLog } from './gen4'
import { SymbolToggle } from './LogAdd'
import { trackerDocument } from './trackerStore'

/**
 * The Challenge Tracker in Platinum and HeartGold/SoulSilver: one row per
 * facility -- the streak under way, the best (raised with the streak, editable),
 * the Silver and Gold Prints (text toggles, as Emerald's symbols), and the next
 * Brain, derived from the streak (gen4.ts, reference/gen4.ts). No battle log:
 * the Gen 4 Frontier's opponents are not extracted. HeartGold/SoulSilver carries
 * the "reuses Platinum, unconfirmed" flag.
 */
export function Gen4Tracker({ game }: { game: Gen4TrackerGame }) {
  const doc = trackerDocument.useDocument()
  const log = gen4GameOf(doc, game)
  const hgss = game === 'heartgold-soulsilver'
  const edit = (fn: Parameters<typeof updateGen4Game>[2]) => trackerDocument.update((d) => updateGen4Game(d, game, fn))
  return (
    <div className="bf-page" data-layout="frontier-tracker" data-game={game}>
      <header className="bf-head" data-layout="page-head">
        <h1 className="bf-title">Challenge Tracker</h1>
        <span className="bf-scope">{GAME_SCOPE[game]}</span>
      </header>
      <div
        className="bf-stack bf-g4"
        data-layout="tracker-gen4"
        style={{ gridTemplateAreas: hgss ? "'flag' 'table'" : "'table'" }}
      >
        {hgss && (
          <p className="bf-flag" data-layout="frontier-flag" data-testid="tracker-hgss-flag" style={{ gridArea: 'flag' }}>
            {HGSS_FLAG}
          </p>
        )}
        <div className="bf-tw" style={{ gridArea: 'table' }}>
          <table className="bf-t bf-g4-table" data-testid="tracker-gen4">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Current streak</th>
                <th>Best streak</th>
                <th>Prints</th>
                <th>Next Brain</th>
              </tr>
            </thead>
            <tbody>
              {GEN4_FACILITIES.map((f) => {
                const row = log?.facilities[f.id]
                return (
                  <tr key={f.id} data-facility={f.id} data-testid={`g4-row-${f.id}`}>
                    <td className="bf-nw">{f.name}</td>
                    <td>
                      <StreakField
                        label={`${f.name}: current streak`}
                        testId={`g4-streak-${f.id}`}
                        value={row?.streak ?? 0}
                        onCommit={(n) => edit((g) => setStreak(g, f.id, n))}
                      />
                    </td>
                    <td>
                      <StreakField
                        label={`${f.name}: best streak`}
                        testId={`g4-best-${f.id}`}
                        value={row?.best ?? 0}
                        onCommit={(n) => edit((g) => setBest(g, f.id, n))}
                      />
                    </td>
                    <td>
                      <Prints id={f.id} row={row} onToggle={(p) => edit((g) => togglePrint(g, f.id, p))} />
                    </td>
                    <td data-testid={`g4-next-${f.id}`}>
                      {nextBrainText(nextBrain(f.id, row))}
                      {f.brainWhen && <span className="bf-muted"> ({f.brainWhen})</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/**
 * A streak typed in place: committed on every valid keystroke, so the next-Brain
 * line follows the typing; an emptied field reads 0 once it loses focus.
 */
function StreakField({
  label,
  testId,
  value,
  onCommit,
}: {
  label: string
  testId: string
  value: number
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="bf-uf bf-num bf-g4-num"
      inputMode="numeric"
      aria-label={label}
      data-testid={testId}
      value={draft ?? String(value)}
      onChange={(e) => {
        const t = e.target.value.trim()
        if (!/^\d{0,4}$/.test(t)) return
        setDraft(t)
        if (t !== '') onCommit(Number(t))
      }}
      onBlur={() => {
        if (draft === '') onCommit(0)
        setDraft(null)
      }}
    />
  )
}

function Prints({
  id,
  row,
  onToggle,
}: {
  id: Gen4FacilityId
  row: Gen4FacilityLog | undefined
  onToggle: (p: 'silver' | 'gold') => void
}) {
  return (
    <span className="bf-pair">
      <SymbolToggle label="Silver Print" on={!!row?.silver} testId={`g4-silver-${id}`} onClick={() => onToggle('silver')} />
      <SymbolToggle label="Gold Print" on={!!row?.gold} testId={`g4-gold-${id}`} onClick={() => onToggle('gold')} />
    </span>
  )
}
