import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { TextField } from '../../../components/ds/TextField'
import { getMove } from '../../../data'
import { useGameMoveTable } from '../../calculators/useGameMoveTable'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import {
  SKILL_LABEL,
  SKILL_POINTS,
  judge,
  mindRating,
  type Mark,
  type Side,
  type SkillResult,
} from './arenaMath'

const TOOL = findTool('21')!
const TURNS = 3

/**
 * #21 Battle Arena scoring: three turns, then the referee judges Mind, Skill
 * and Body. Enter what each side did; the page gives each category's score,
 * the marks and the verdict (a tie knocks both out).
 */
export function ArenaTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ game }) => (game ? <ArenaBody game={game.name} /> : null)}
    </ToolShell>
  )
}

interface Draft {
  moves: string[]
  skills: string[]
  stopped: string
  hpStart: string
  hpEnd: string
}

const emptyDraft = (): Draft => ({
  moves: Array(TURNS).fill(''),
  skills: Array(TURNS).fill(''),
  stopped: '0',
  hpStart: '100',
  hpEnd: '100',
})
const num = (s: string) => (s.trim() === '' ? NaN : Number(s))
const moveName = (id: number) => getMove(id)?.display_name ?? `#${id}`
const MARK: Record<Mark, string> = { win: '○ 2', tie: '△ 1', loss: '✕ 0' }
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function ArenaBody({ game }: { game: string }) {
  const table = useGameMoveTable(game)
  const [sides, setSides] = useState<[Draft, Draft]>([emptyDraft(), emptyDraft()])
  const moveOptions = useMemo(
    () =>
      table.status === 'ready'
        ? Object.keys(table.data.moves)
            .map(Number)
            .filter((id) => getMove(id))
            .sort((a, b) => moveName(a).localeCompare(moveName(b)))
            .map((id) => ({
              value: String(id),
              label: `${moveName(id)} (${signed(mindRating(id))})`,
            }))
        : [],
    [table],
  )

  const parsed = sides.map((d): Side => ({
    moves: d.moves.map((m) => (m ? Number(m) : null)),
    skills: d.skills.map((s) => (s ? (s as SkillResult) : null)),
    stopped: num(d.stopped),
    hpStart: num(d.hpStart),
    hpEnd: num(d.hpEnd),
  }))
  const whole = (x: number) => Number.isInteger(x) && x >= 0
  const reason =
    table.status === 'error'
      ? `Emerald’s move table did not load: ${table.message}`
      : table.status !== 'ready'
        ? 'Loading Emerald’s move table…'
        : !parsed.every((s) => whole(s.hpStart) && s.hpStart > 0 && whole(s.hpEnd))
          ? 'HP must be whole numbers, the starting HP above 0.'
          : !parsed.every((s) => s.hpEnd <= s.hpStart)
            ? 'HP left cannot be more than the HP it started with.'
            : !parsed.every((s) => whole(s.stopped) && s.stopped <= TURNS)
              ? `Times stopped is a whole number from 0 to ${TURNS}.`
              : null
  const verdict = reason ? null : judge(parsed[0], parsed[1])

  const set = (side: number, patch: Partial<Draft>) =>
    setSides((ss) => ss.map((d, i) => (i === side ? { ...d, ...patch } : d)) as [Draft, Draft])

  return (
    <>
      <ToolInputs>
        {(['You', 'Opponent'] as const).map((who, side) => (
          <div key={who} data-testid={`arn-side-${side}`}>
            {Array.from({ length: TURNS }, (_, t) => (
              <div className="calc-row" key={t}>
                <SelectField
                  label={`${who} · turn ${t + 1} move`}
                  options={[{ value: '', label: '—' }, ...moveOptions]}
                  value={sides[side].moves[t]}
                  data-testid={`arn-${side}-move-${t + 1}`}
                  onChange={(e) =>
                    set(side, {
                      moves: sides[side].moves.map((x, k) => (k === t ? e.target.value : x)),
                    })
                  }
                />
                <SelectField
                  label="It"
                  options={[
                    { value: '', label: '—' },
                    ...(Object.keys(SKILL_LABEL) as SkillResult[]).map((r) => ({
                      value: r,
                      label: `${SKILL_LABEL[r]} (${signed(SKILL_POINTS[r])})`,
                    })),
                  ]}
                  value={sides[side].skills[t]}
                  data-testid={`arn-${side}-skill-${t + 1}`}
                  onChange={(e) =>
                    set(side, {
                      skills: sides[side].skills.map((x, k) => (k === t ? e.target.value : x)),
                    })
                  }
                />
              </div>
            ))}
            <div className="calc-row">
              <TextField
                label={`${who} · stopped by an ability (−3 each)`}
                type="number"
                value={sides[side].stopped}
                data-testid={`arn-${side}-stopped`}
                onChange={(e) => set(side, { stopped: e.target.value })}
              />
              <TextField
                label="HP at the start"
                type="number"
                value={sides[side].hpStart}
                data-testid={`arn-${side}-hp-start`}
                onChange={(e) => set(side, { hpStart: e.target.value })}
              />
              <TextField
                label="HP left"
                type="number"
                value={sides[side].hpEnd}
                data-testid={`arn-${side}-hp-end`}
                onChange={(e) => set(side, { hpEnd: e.target.value })}
              />
            </div>
          </div>
        ))}
        <p className="calc-result-note">
          Mind is each move’s own rating, in brackets: +1 for most attacks, −1 for Protect, Detect,
          Endure and Fake Out, 0 for the rest. Each category won scores 2, a tie 1 each.
        </p>
      </ToolInputs>
      <ToolResult reason={reason}>
        {verdict && (
          <>
            <p className="calc-result-note" data-testid="arn-verdict" data-result={verdict.result}>
              {verdict.result === 'you'
                ? `You win, ${verdict.total[0]}–${verdict.total[1]}.`
                : verdict.result === 'opponent'
                  ? `The opponent wins, ${verdict.total[1]}–${verdict.total[0]}.`
                  : `A draw, ${verdict.total[0]}–${verdict.total[1]}: both Pokémon are knocked out.`}
            </p>
            <div className="tools-compare-scroll">
              <table className="tools-compare" data-testid="arn-table">
                <thead>
                  <tr>
                    <th />
                    <th scope="col">You</th>
                    <th scope="col">Opponent</th>
                  </tr>
                </thead>
                <tbody>
                  {(['mind', 'skill', 'body'] as const).map((c) => (
                    <tr key={c} data-testid={`arn-${c}`}>
                      <th scope="row">
                        {c === 'mind' ? 'Mind' : c === 'skill' ? 'Skill' : 'Body (% HP left)'}
                      </th>
                      {[0, 1].map((i) => (
                        <td key={i} className="num" data-value={verdict[c][i]}>
                          {verdict[c][i]} · {MARK[verdict.marks[c][i]]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {verdict.mind.every((x) => x === 0) && sides.every((d) => d.moves.every((m) => !m)) && (
              <p className="calc-result-note">No moves entered: Mind is 0 for both.</p>
            )}
          </>
        )}
      </ToolResult>
    </>
  )
}
