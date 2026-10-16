import { useEffect, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { TextField } from '../../../components/ds/TextField'
import { listNatures } from '../../../data'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { clearContestTreat, peekContestTreat } from './contestHandoff'
import {
  CONDITIONS,
  MAX,
  feed,
  servingsUntilFull,
  tasteOf,
  type ContestRules,
  type Treat,
} from './contestMath'

const TOOL = findTool('18')!
const FLAVOR_LABEL = ['Spicy', 'Dry', 'Sweet', 'Bitter', 'Sour']

/**
 * #18 Contest stats plan: feed Pokéblocks (RSE) or Poffins (DPPt) in order and
 * see each condition and the sheen after, until the Pokémon will not eat. A
 * block or Poffin made in #19 can be sent here with one click.
 */
export function ContestTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ generation, game }) =>
        game ? <ContestBody key={generation} rules={generation === 3 ? 'gen3' : 'gen4'} /> : null
      }
    </ToolShell>
  )
}

interface RowDraft {
  flavors: string[]
  feel: string
  count: string
}

const draftOf = (t: Treat, count = 1): RowDraft => ({
  flavors: t.flavors.map(String),
  feel: String(t.feel),
  count: String(count),
})
const num = (s: string) => (s.trim() === '' ? NaN : Number(s))
const isByte = (x: number) => Number.isInteger(x) && x >= 0 && x <= MAX

function ContestBody({ rules }: { rules: ContestRules }) {
  const natures = listNatures().sort((a, b) => a.display_name.localeCompare(b.display_name))
  const [handoff] = useState(peekContestTreat)
  useEffect(() => {
    if (handoff) clearContestTreat(handoff.id)
  }, [handoff])
  const [natureId, setNatureId] = useState(natures[0]?.id ?? 1)
  const [start, setStart] = useState<string[]>(['0', '0', '0', '0', '0', '0'])
  const [rows, setRows] = useState<RowDraft[]>(() => [
    draftOf(handoff?.treat ?? { flavors: [0, 0, 0, 0, 0], feel: 0 }, 10),
  ])

  const nature = natures.find((n) => n.id === natureId)
  const taste = tasteOf(nature?.likes_flavor ?? null, nature?.hates_flavor ?? null)
  const startNums = start.map(num)
  const rowNums = rows.map((r) => ({
    flavors: r.flavors.map(num),
    feel: num(r.feel),
    count: num(r.count),
  }))
  const sheenWord = rules === 'gen3' ? 'feel' : 'smoothness'
  const reason = !startNums.every(isByte)
    ? 'Conditions and sheen are whole numbers from 0 to 255.'
    : !rowNums.every((r) => r.flavors.every(isByte) && isByte(r.feel))
      ? `Each flavour and the ${sheenWord} are whole numbers from 0 to 255.`
      : !rowNums.every((r) => Number.isInteger(r.count) && r.count >= 1 && r.count <= 100)
        ? 'Each count is a whole number from 1 to 100.'
        : null
  const fed = reason
    ? null
    : feed(
        rules,
        taste,
        { conditions: startNums.slice(0, 5), sheen: startNums[5] },
        rowNums.map((r) => ({ treat: { flavors: r.flavors, feel: r.feel }, count: r.count })),
      )
  const eatenPerRow = rows.map((_, i) => fed?.steps.filter((s) => s.row === i).length ?? 0)
  const setRow = (i: number, patch: Partial<RowDraft>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <>
      <ToolInputs>
        <SelectField
          label="Nature"
          options={natures.map((n) => ({ value: String(n.id), label: n.display_name }))}
          value={String(natureId)}
          data-testid="con-nature"
          onChange={(e) => setNatureId(Number(e.target.value))}
        />
        <p className="calc-result-note" data-testid="con-taste">
          {taste.liked == null
            ? 'Neutral: no flavour liked or disliked.'
            : `Likes ${FLAVOR_LABEL[taste.liked]} (${CONDITIONS[taste.liked]}), dislikes ${FLAVOR_LABEL[taste.disliked!]} (${CONDITIONS[taste.disliked!]}).`}{' '}
          {rules === 'gen3'
            ? 'Gen 3: the nature acts only one way per block — +10% on the liked flavour if the block scores liked overall, −10% on the disliked if it scores disliked, nothing if it scores even.'
            : 'Gen 4: liked flavour ×1.1, disliked ×0.9, rounded down, on every Poffin.'}
        </p>
        <div className="calc-row">
          {[...CONDITIONS, 'Sheen'].map((c, i) => (
            <TextField
              key={c}
              label={`Now: ${c}`}
              type="number"
              value={start[i]}
              data-testid={`con-start-${i}`}
              onChange={(e) => setStart((s) => s.map((x, k) => (k === i ? e.target.value : x)))}
            />
          ))}
        </div>
        {rows.map((r, i) => (
          <div className="calc-row" key={i} data-testid={`con-row-${i + 1}`}>
            {FLAVOR_LABEL.map((f, j) => (
              <TextField
                key={f}
                label={`${i + 1}: ${f}`}
                type="number"
                value={r.flavors[j]}
                data-testid={`con-row-${i + 1}-f${j}`}
                onChange={(e) =>
                  setRow(i, { flavors: r.flavors.map((x, k) => (k === j ? e.target.value : x)) })
                }
              />
            ))}
            <TextField
              label={rules === 'gen3' ? 'Feel' : 'Smoothness'}
              type="number"
              value={r.feel}
              data-testid={`con-row-${i + 1}-feel`}
              onChange={(e) => setRow(i, { feel: e.target.value })}
            />
            <TextField
              label="How many"
              type="number"
              value={r.count}
              data-testid={`con-row-${i + 1}-count`}
              onChange={(e) => setRow(i, { count: e.target.value })}
            />
            {rows.length > 1 && (
              <button
                type="button"
                className="tools-link"
                onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="tools-link"
          data-testid="con-add"
          onClick={() => setRows((rs) => [...rs, draftOf({ flavors: [0, 0, 0, 0, 0], feel: 0 })])}
        >
          + Add a {rules === 'gen3' ? 'Pokéblock' : 'Poffin'}
        </button>
      </ToolInputs>
      <ToolResult reason={reason}>
        {fed && (
          <>
            <p className="calc-result-note" data-testid="con-summary" data-refused={fed.refused}>
              Ate {fed.steps.length} · sheen {fed.final.sheen}/{MAX}
              {fed.refused > 0 && ` · ${fed.refused} left uneaten: the sheen is full`}
              {fed.refused === 0 &&
                fed.final.sheen < MAX &&
                (() => {
                  const room = servingsUntilFull(fed.final.sheen, rowNums[rows.length - 1].feel)
                  return Number.isFinite(room)
                    ? ` · room for ${room} more of the last one`
                    : ` · the last one adds no sheen, so it never fills`
                })()}
            </p>
            <div className="tools-compare-scroll">
              <table className="tools-compare" data-testid="con-table">
                <thead>
                  <tr>
                    <th scope="col">Condition</th>
                    <th scope="col">Now</th>
                    <th scope="col">After</th>
                  </tr>
                </thead>
                <tbody>
                  {CONDITIONS.map((c, i) => (
                    <tr
                      key={c}
                      data-testid={`con-final-${c.toLowerCase()}`}
                      data-value={fed.final.conditions[i]}
                    >
                      <th scope="row">{c}</th>
                      <td className="num">{startNums[i]}</td>
                      <td className="num">{fed.final.conditions[i]}</td>
                    </tr>
                  ))}
                  <tr data-testid="con-final-sheen" data-value={fed.final.sheen}>
                    <th scope="row">Sheen</th>
                    <td className="num">{startNums[5]}</td>
                    <td className="num">{fed.final.sheen}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ol className="tools-list">
              {rows.map((_, i) => (
                <li key={i} className="tools-item" data-testid={`con-eaten-${i + 1}`}>
                  <span>
                    {rules === 'gen3' ? 'Pokéblock' : 'Poffin'} {i + 1}
                  </span>
                  <span className="tools-blurb">
                    ate {eatenPerRow[i]} of {rowNums[i].count}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </ToolResult>
    </>
  )
}
