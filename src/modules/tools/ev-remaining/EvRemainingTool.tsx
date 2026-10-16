import { useEffect, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { getSpecies } from '../../../data'
import { clearRemainingEntry, peekRemainingEntry } from '../../collection/collectionHandoff'
import { EFFORT_LABEL } from '../../collection/collectionMath'
import { useNav } from '../../nav/navContext'
import { orderedBuilds } from '../../team-builder/model'
import { useTeamBuilderData } from '../../team-builder/store'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { remaining } from './remainingMath'

const TOOL = findTool('9')!

/**
 * #9 EV / Stat Exp remaining: what a Pokemon in your Collection still has to
 * gain to match the Build it is being trained toward. Opened from a Collection
 * entry it starts on that entry; the build can be changed here.
 */
export function EvRemainingTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!}>
      {({ generation }) => <RemainingBody key={generation} generation={generation} />}
    </ToolShell>
  )
}

function RemainingBody({ generation }: { generation: number }) {
  const { setModule } = useNav()
  const data = useTeamBuilderData()
  const entries = (data.collection ?? []).filter((c) => c.generation === generation)
  const builds = orderedBuilds(data).filter((b) => b.generation === generation)
  const [handoff] = useState(peekRemainingEntry)
  useEffect(() => {
    if (handoff) clearRemainingEntry(handoff.id)
  }, [handoff])
  const [entryId, setEntryId] = useState<string>(() => handoff?.entryId ?? entries[0]?.id ?? '')
  const entry = entries.find((c) => c.id === entryId) ?? entries[0]
  const [buildPick, setBuildPick] = useState<string>('')
  const buildId = buildPick || entry?.buildId || ''
  const build = builds.find((b) => b.id === buildId)
  const word = generation <= 2 ? 'Stat Exp' : 'EVs'
  const name = (x: { nickname: string; speciesId: number }) =>
    x.nickname || getSpecies(x.speciesId)?.display_name || `#${x.speciesId}`

  const reason = !entries.length
    ? `No Gen ${generation} Pokémon in your Collection yet.`
    : !entry
      ? 'Pick a Pokémon from your Collection.'
      : !build
        ? 'Pick the Build it is being trained toward.'
        : null
  const r = entry && build ? remaining(generation, entry.effort, build.effort) : null

  return (
    <>
      <ToolInputs>
        <div className="calc-row">
          {entries.length > 0 && (
            <SelectField
              label="Your Pokémon (Collection)"
              options={entries.map((c) => ({ value: c.id, label: `${name(c)} · Lv ${c.level}` }))}
              value={entry?.id ?? ''}
              data-testid="rem-entry"
              onChange={(e) => {
                setEntryId(e.target.value)
                setBuildPick('')
              }}
            />
          )}
          <SelectField
            label="Target build"
            options={[
              { value: '', label: 'Choose…' },
              ...builds.map((b) => ({ value: b.id, label: name(b) })),
            ]}
            value={buildId}
            data-testid="rem-build"
            onChange={(e) => setBuildPick(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="tools-link"
          data-testid="rem-open-collection"
          onClick={() => setModule('collection')}
        >
          Open the Collection
        </button>
      </ToolInputs>
      <ToolResult reason={reason}>
        {r && (
          <>
            <div className="calc-result-headline" data-testid="rem-total">
              {r.done ? (
                'Fully trained'
              ) : (
                <>
                  <span className="num">{r.totalLeft}</span> {word} to go
                </>
              )}
            </div>
            <ul className="tools-list" data-testid="rem-rows">
              {r.rows.map((row) => (
                <li key={row.key} className="tools-item" data-testid={`rem-row-${row.key}`}>
                  <span>{EFFORT_LABEL[row.key]}</span>
                  <span>
                    <span className="num">{row.current}</span> of{' '}
                    <span className="num">{row.target}</span>
                    {row.left > 0 && (
                      <>
                        {' · '}
                        <span className="num" data-testid={`rem-left-${row.key}`}>
                          {row.left}
                        </span>{' '}
                        to go
                      </>
                    )}
                    {row.over > 0 && (
                      <span className="tools-blurb"> · {row.over} over the target</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </ToolResult>
    </>
  )
}
