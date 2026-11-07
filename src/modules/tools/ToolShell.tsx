import type { ReactNode } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { scrollKey } from '../../components/scrollMemory'
import type { VersionGroup } from '../../data'
import { GameRow } from '../version-group/GameRow'
import { useVersionGroup } from '../version-group/context'
import { useGameInGeneration } from '../version-group/gameInGeneration'
import { gameFilter, toolAvailability, type ToolGate } from './gates'
import '../../components/ds/ds.css'
import '../calculators/calculators.css'
import './tools.css'

/**
 * The frame every tool page shares: title, the scope it is answering in, and the
 * body -- or, where the tool cannot answer, the reason in the body's place.
 *
 * NAMED REGIONS (CLAUDE.md "Laying out a screen"): the page is `tool` with areas
 * `head` and `body`; the body is `tool-body` with `inputs` and `result`, which the
 * tool fills with <ToolInputs> and <ToolResult>. The head sits outside the scroll
 * area so the title and the game row never scroll away.
 *
 * THE SCOPE IS THE APP'S GENERATION (owner, 2026-10-15). A tool whose answer
 * differs between a generation's games gets the game row -- the in-generation
 * picker, limited to the games where the tool exists -- which cannot leave the
 * generation, so it is not a selector exception.
 */

export interface ToolScope {
  generation: number
  /** The game being read: the row's pick, or the generation's default. */
  game: VersionGroup | null
}

export function ToolShell({
  toolKey,
  title,
  gate,
  gamePicker = false,
  children,
}: {
  /** Stable key (the brief's number), for test ids and the remembered scroll offset. */
  toolKey: string
  title: string
  gate: ToolGate
  /** Show the game row: the answer differs between this generation's games. */
  gamePicker?: boolean
  children: (scope: ToolScope) => ReactNode
}) {
  const app = useVersionGroup()
  const games = useGameInGeneration(`tool-${toolKey}`, gameFilter(gate))
  const availability = toolAvailability(gate, app.isAll ? null : app.generation)

  return (
    <div className="calc tool-page" data-layout="tool" data-testid={`tool-page-${toolKey}`}>
      <div className="calc-head tool-head">
        <h1 className="calc-title">{title}</h1>
        <div className="tool-scope">
          <span className="tool-scope-gen" data-testid="tool-scope-gen">
            {app.isAll ? 'All generations' : `Gen ${app.generation}`}
          </span>
          {availability.ok && gamePicker && (
            <GameRow scope={games} testId="tool-game-row" variant="nav" />
          )}
        </div>
      </div>
      <ScrollArea
        className="tool-scroll"
        testId="tool-scroll-area"
        memoryKey={scrollKey('tool', toolKey)}
      >
        <div className="calc-content tool-body" data-layout="tool-body">
          {availability.ok ? (
            children({ generation: app.generation, game: games.versionGroup })
          ) : (
            <ToolResult reason={availability.reason} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/** The inputs region. */
export function ToolInputs({ children }: { children: ReactNode }) {
  return (
    <div className="calc-section tool-inputs" data-testid="tool-inputs">
      {children}
    </div>
  )
}

/**
 * The result region. Given a `reason` it prints that INSTEAD of a result: an
 * incomplete or invalid input is never a blank, a zero or a NaN.
 */
export function ToolResult({ reason, children }: { reason?: string | null; children?: ReactNode }) {
  return (
    <div className="calc-result tool-result" data-testid="tool-result" data-state={reason ? 'reason' : 'value'}>
      {reason ? (
        <p className="tool-reason" data-testid="tool-reason">
          {reason}
        </p>
      ) : (
        children
      )}
    </div>
  )
}
