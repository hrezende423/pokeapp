import { useEffect, useMemo, useState } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { scrollKey } from '../../components/scrollMemory'
import { Tabs } from '../../components/ds/Navigation'
import { SelectField } from '../../components/ds/SelectField'
import { loadTrainers, type TrainerPartition } from '../../data/trainers'
import { loadBattleData, type BattleData } from '../battle/battleData'
import { gameContext, type GameContext } from '../battle/game'
import { useTeamBuilderData } from '../team-builder/store'
import type { TeamBuilderData } from '../team-builder/model'
import type { MatchupSetup, Scenario } from './model'
import { resolveSetup, type Resolved } from './resolve'
import { loadScenario, saveScenario, setupFor, updateSetup, useMatchupDoc } from './store'
import { useMatchupScope } from './useMatchupScope'
import { Note } from './parts'
import { SetupTab } from './SetupTab'
import { MatrixTab } from './MatrixTab'
import { SpeedTab } from './SpeedTab'
import { DamageTab } from './DamageTab'
import { SwitchTab } from './SwitchTab'
import { SandboxTab } from './SandboxTab'
import { OutcomeTab } from './OutcomeTab'
import { GauntletTab } from './GauntletTab'
import { ScanTab } from './ScanTab'
import { CompareTab } from './CompareTab'
import '../../components/ds/ds.css'
import './teamMatchup.css'

/**
 * TEAM MATCHUP (Tools): my team against a trainer's, every Pokemon against every
 * Pokemon, and whole battles against the trainer's own AI.
 *
 * SEPARATE FROM THE DAMAGE CALCULATOR, which stays one Pokemon against one; a
 * matrix cell opens it on that pair (M3). The engine is ../battle (pure, no
 * React): this file and its tabs are only its form.
 *
 * ITS OWN GAME (useMatchupScope) -- the fourth sanctioned exception to the
 * app-wide selector. The game decides every mechanic (battle/game.ts, S4).
 *
 * EVERY OUTPUT SAYS WHAT IT RESTS ON (S7f): the provenance line under the tabs
 * names each side's spread mode and the scenario; each Pokemon's name carries
 * "custom spread", "ceiling" or a what-if level where one applies.
 */

const TABS = [
  'Setup',
  'Matrix',
  'Speed',
  'Damage',
  'Switching',
  'Sandbox',
  'Outcome',
  'Gauntlet',
  'Scan',
  'Compare',
] as const
type Tab = (typeof TABS)[number]
const slug = (t: string) => t.toLowerCase()

export interface MatchupView {
  vg: string
  ctx: GameContext
  data: BattleData
  partition: TrainerPartition | null
  setup: MatchupSetup
  update: (fn: (s: MatchupSetup) => MatchupSetup) => void
  tb: TeamBuilderData
  resolved: Resolved
  badges: Set<string>
  scenario: Scenario | null
  scenarios: Scenario[]
  /** Switch tab from inside a tab (e.g. a scan row opening its boss). */
  goTo: (tab: Tab) => void
}

type Load<T> =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ready'; value: T }
  | { key: string; status: 'error'; message: string }

function useLoaded<T>(key: string, load: (k: string) => Promise<T>): Load<T> {
  const [state, setState] = useState<Load<T>>({ key, status: 'loading' })
  useEffect(() => {
    let live = true
    load(key).then(
      (value) => live && setState({ key, status: 'ready', value }),
      (err) =>
        live &&
        setState({
          key,
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        }),
    )
    return () => {
      live = false
    }
  }, [key, load])
  // Readiness is derived from the key, so a new game never shows the old one's data.
  return state.key === key ? state : { key, status: 'loading' }
}

export function TeamMatchupPage() {
  const scope = useMatchupScope()
  const vg = scope.versionGroup
  const [tab, setTab] = useState<Tab>('Setup')
  const doc = useMatchupDoc()
  const tb = useTeamBuilderData()
  const setup = setupFor(doc, vg)
  const battle = useLoaded(vg, loadBattleData)
  const trainers = useLoaded(vg, loadTrainers)
  const ctx = useMemo(() => gameContext(vg), [vg])
  const partition = trainers.status === 'ready' ? trainers.value : null
  const resolved = useMemo(
    () => resolveSetup(ctx, setup, tb, partition),
    [ctx, setup, tb, partition],
  )
  const badges = useMemo(() => new Set(setup.badges), [setup.badges])
  const scenarios = doc.scenarios.filter((s) => s.versionGroup === vg)
  const scenario = scenarios.find((s) => s.id === setup.scenarioId) ?? null

  const view: MatchupView | null =
    battle.status === 'ready'
      ? {
          vg,
          ctx,
          data: battle.value,
          partition,
          setup,
          update: (fn) => updateSetup(vg, fn),
          tb,
          resolved,
          badges,
          scenario,
          scenarios,
          goTo: setTab,
        }
      : null

  return (
    <div className="tm" data-testid="team-matchup" data-game={vg} data-generation={ctx.generation}>
      <div className="tm-head" data-layout="tm-head">
        <h1 className="tm-title">Team Matchup</h1>
        <SelectField
          label="Game"
          hideLabel
          options={scope.games.map((g) => ({ group: g.label, options: g.options }))}
          value={vg}
          data-testid="tm-game"
          onChange={(e) => scope.setVersionGroup(e.target.value)}
        />
        <ScenarioControl vg={vg} setup={setup} scenario={scenario} scenarios={scenarios} />
      </div>
      <div className="tm-tabs" data-layout="tm-tabs">
        <Tabs tabs={[...TABS]} active={tab} onSelect={(t) => setTab(t as Tab)} />
      </div>
      <Provenance view={view} resolved={resolved} scenario={scenario} />
      <ScrollArea testId="tm-scroll-area" memoryKey={scrollKey('team-matchup', tab)}>
        <div
          className="tm-body"
          role="tabpanel"
          data-testid={`tm-panel-${slug(tab)}`}
          data-layout={`tm-${slug(tab)}`}
        >
          {battle.status === 'loading' && <Note>Loading {ctx.label}'s battle data…</Note>}
          {battle.status === 'error' && (
            <Note tone="warn">Could not load the battle data: {battle.message}</Note>
          )}
          {trainers.status === 'error' && (
            <Note tone="warn">Could not load the trainers: {trainers.message}</Note>
          )}
          {view && (
            <>
              {tab === 'Setup' && <SetupTab view={view} />}
              {tab === 'Matrix' && <MatrixTab view={view} />}
              {tab === 'Speed' && <SpeedTab view={view} />}
              {tab === 'Damage' && <DamageTab view={view} />}
              {tab === 'Switching' && <SwitchTab view={view} />}
              {tab === 'Sandbox' && <SandboxTab view={view} />}
              {tab === 'Outcome' && <OutcomeTab view={view} />}
              {tab === 'Gauntlet' && <GauntletTab view={view} />}
              {tab === 'Scan' && <ScanTab view={view} />}
              {tab === 'Compare' && <CompareTab view={view} />}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/** S7f: what every number on screen rests on. */
function Provenance({
  view,
  resolved,
  scenario,
}: {
  view: MatchupView | null
  resolved: Resolved
  scenario: Scenario | null
}) {
  const mineCustom = resolved.mine.filter((m) => m.spreadMode === 'custom').length
  const theirsCustom = resolved.theirs.filter((m) => m.spreadMode === 'custom').length
  const ceiling = [...resolved.mine, ...resolved.theirs].some((m) => m.spread.ceiling)
  const mode = (n: number, total: number, base: string) =>
    n === 0 ? `${base}` : n === total ? 'customised' : `${base}, ${n} customised`
  return (
    <div className="tm-provenance" data-testid="tm-provenance" data-layout="tm-provenance">
      <span>
        Your spreads: <b>{mode(mineCustom, resolved.mine.length, 'current (saved builds)')}</b>
      </span>
      <span>
        Theirs: <b>{mode(theirsCustom, resolved.theirs.length, 'game data')}</b>
      </span>
      <span>
        Scenario:{' '}
        <b data-testid="tm-provenance-scenario">
          {scenario ? scenario.name : 'none (working setup)'}
        </b>
      </span>
      {view && (
        <span>
          Opponent: <b>{resolved.opponentTitle}</b>
        </span>
      )}
      {ceiling && (
        <span className="tm-ceiling" data-testid="tm-ceiling">
          Best-case ceiling: "Maximize all EVs" exceeds the 510 EV cap — not a real spread
        </span>
      )}
    </div>
  )
}

function ScenarioControl({
  vg,
  setup,
  scenario,
  scenarios,
}: {
  vg: string
  setup: MatchupSetup
  scenario: Scenario | null
  scenarios: Scenario[]
}) {
  const [name, setName] = useState('')
  return (
    <div className="tm-scenario" data-layout="tm-scenario">
      <SelectField
        label="Scenario"
        hideLabel
        data-testid="tm-scenario-select"
        value={scenario?.id ?? ''}
        options={[
          { value: '', label: 'Working setup' },
          ...scenarios.map((s) => ({ value: s.id, label: s.name })),
        ]}
        onChange={(e) => {
          const s = scenarios.find((x) => x.id === e.target.value)
          if (s) loadScenario(s)
          else updateSetup(vg, (x) => ({ ...x, scenarioId: null }))
        }}
      />
      <input
        className="tm-input"
        aria-label="Scenario name"
        placeholder={scenario ? scenario.name : 'Name this scenario'}
        value={name}
        data-testid="tm-scenario-name"
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="button"
        className="tm-link"
        data-testid="tm-scenario-save"
        onClick={() => {
          saveScenario(vg, name || scenario?.name || '', setup, name ? null : scenario?.id)
          setName('')
        }}
      >
        {scenario && !name ? 'Save' : 'Save as new'}
      </button>
    </div>
  )
}
