import { useMemo, useState } from 'react'
import { getSpecies } from '../../../data'
import { gameContext } from '../../battle/game'
import { useGameMoveTable } from '../../calculators/useGameMoveTable'
import { itemEntries, speciesEntries } from '../../dex/entrySources'
import { findTool } from '../registry'
import { SPEED_ITEMS, newRow, type TierField, type TierRow } from '../speed-tiers/speedTiersMath'
import { TierRowEditor } from '../speed-tiers/TierRowEditor'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { readMinimizer } from './speedMinimizerMath'

const TOOL = findTool('6')!
const NO_FIELD: TierField = {
  weather: null,
  tailwind: { mine: false, theirs: false },
  trickRoom: false,
}

/**
 * #6 Speed EV minimizer: the least Speed EVs (Gen 3-4) or Stat Exp (Gen 1-2)
 * your Pokemon needs to move before a target -- with its nature as set and with a
 * +Speed one -- and the lowest level that would do it. The solver is the battle
 * engine's (`speedThreshold`); "before" means strictly faster.
 */
export function SpeedMinimizerTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!}>
      {({ generation, game }) =>
        game ? <MinimizerBody key={generation} generation={generation} game={game.name} /> : null
      }
    </ToolShell>
  )
}

function MinimizerBody({ generation, game }: { generation: number; game: string }) {
  const ctx = useMemo(() => gameContext(game), [game])
  const table = useGameMoveTable(game)
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const items = useMemo(
    () => itemEntries({ generation, isAll: false }).filter((i) => SPEED_ITEMS.includes(i.name)),
    [generation],
  )
  const [mine, setMine] = useState<TierRow>(() => ({
    ...newRow('mine', species[0]?.id ?? null, ctx),
    speedEffort: '0',
  }))
  const [target, setTarget] = useState<TierRow>(() => newRow('theirs', species[3]?.id ?? null, ctx))

  const outcome =
    table.status === 'ready'
      ? readMinimizer(ctx, table.data, mine, target, NO_FIELD)
      : {
          ok: false as const,
          reason:
            table.status === 'error'
              ? `This game’s data did not load: ${table.message}`
              : 'Loading this game’s data…',
        }
  const effortWord = ctx.spreadModel === 'ev' ? 'Speed EVs' : 'Speed Stat Exp'
  const nameOf = (r: TierRow) =>
    (r.speciesId != null ? getSpecies(r.speciesId)?.display_name : '') ?? ''

  return (
    <>
      <ToolInputs>
        <TierRowEditor
          index={0}
          row={mine}
          ctx={ctx}
          species={species}
          items={items}
          title="Your Pokémon"
          showSide={false}
          showEffort={false}
          onChange={(p) => setMine((r) => ({ ...r, ...p }))}
        />
        <TierRowEditor
          index={1}
          row={target}
          ctx={ctx}
          species={species}
          items={items}
          title="The target"
          showSide={false}
          onChange={(p) => setTarget((r) => ({ ...r, ...p }))}
        />
      </ToolInputs>
      <ToolResult reason={outcome.ok ? null : outcome.reason}>
        {outcome.ok && (
          <MinimizerAnswer
            t={outcome.threshold}
            effortWord={effortWord}
            hasNatures={ctx.hasNatures}
            mine={nameOf(mine)}
            target={nameOf(target)}
          />
        )}
      </ToolResult>
    </>
  )
}

function MinimizerAnswer({
  t,
  effortWord,
  hasNatures,
  mine,
  target,
}: {
  t: import('../../battle/speed').SpeedThreshold
  effortWord: string
  hasNatures: boolean
  mine: string
  target: string
}) {
  return (
    <>
      <div className="calc-result-headline" data-testid="min-headline">
        {t.minEffort != null ? (
          <>
            <span className="num" data-testid="min-effort">
              {t.minEffort}
            </span>{' '}
            {effortWord}
          </>
        ) : t.bestIsTie ? (
          'A speed tie at best'
        ) : (
          'Not reachable with effort alone'
        )}
      </div>
      <p className="calc-result-note" data-testid="min-detail">
        {target} reaches <span className="num">{t.target}</span>; {mine} has{' '}
        <span className="num">{t.current}</span> as set
        {t.outspeedsNow ? ' and already moves first.' : '.'}
      </p>
      {hasNatures && (
        <p className="calc-result-note" data-testid="min-nature">
          With a +Speed nature:{' '}
          {t.minEffortPlusNature != null ? (
            <span className="num">{t.minEffortPlusNature}</span>
          ) : (
            'not reachable'
          )}
          {t.minEffortPlusNature != null ? ` ${effortWord}.` : '.'}
        </p>
      )}
      <p className="calc-result-note" data-testid="min-level">
        Lowest level that moves first with this spread:{' '}
        {t.minLevel != null ? <span className="num">{t.minLevel}</span> : 'none up to 100'}.
      </p>
      {t.bestIsTie && t.minEffort == null && (
        <p className="calc-result-note">
          Maximum effort lands exactly on the target’s Speed: 50/50.
        </p>
      )}
    </>
  )
}
