import { useEffect, useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { getItem, getMove, getNature, getSpecies, resolveStatsForGeneration } from '../../../data'
import { loadTrainers, type FacilitySet } from '../../../data/trainers'
import { bestOf } from '../compare/compareMath'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import {
  BATTLE_CASTLE_NOTE,
  PLATINUM_UPGRADE_TRADES,
  RENTAL_FACILITY_LABEL,
  SLATEPORT_TENT,
  STAT_KEYS,
  canUpgrade,
  hasBattleCastle,
  rentalFacilities,
  rentalPool,
  rentalStats,
  slateportTentPool,
  type RentalFacility,
  type RentalGame,
} from './rentalMath'

const TOOL = findTool('22')!
const MAX = 6
const STAT_LABEL = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed']

/**
 * #22 Rental set comparator: the Battle Factory's rental pool for a round (or,
 * in Emerald, the Slateport Battle Tent's whole pool), and up to six of its sets
 * side by side at the stats you would rent them with.
 */
export function RentalTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ generation, game }) =>
        game ? (
          <RentalBody key={game.name} game={game.name as RentalGame} generation={generation} />
        ) : null
      }
    </ToolShell>
  )
}

type Load = { key: string; sets: FacilitySet[] | null; error: string | null }

function useFacilitySets(game: string, facility: RentalFacility): Load {
  const key = `${game}/${facility}`
  const [loaded, setLoaded] = useState<Load | null>(null)
  useEffect(() => {
    let alive = true
    loadTrainers(game).then(
      (p) =>
        alive &&
        setLoaded({
          key,
          sets: p.facilities?.find((f) => f.id === facility)?.sets ?? null,
          error: null,
        }),
      (e: unknown) =>
        alive && setLoaded({ key, sets: null, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
    }
  }, [game, facility, key])
  return loaded?.key === key ? loaded : { key, sets: null, error: null }
}

const setLabel = (s: FacilitySet, i: number) =>
  `${getSpecies(s.species_id ?? 0)?.display_name ?? s.key} · ${
    s.item_id ? (getItem(s.item_id)?.display_name ?? 'item') : 'no item'
  } · #${i + 1}`

function RentalBody({ game, generation }: { game: RentalGame; generation: number }) {
  const facilities = rentalFacilities(game)
  const [facility, setFacility] = useState<RentalFacility>('battle-frontier')
  const tent = facility === 'slateport-battle-tent'
  const load = useFacilitySets(game, facility)
  const [open, setOpen] = useState(false)
  const [round, setRound] = useState(1)
  const [upgraded, setUpgraded] = useState(false)
  const [picked, setPicked] = useState<(number | null)[]>([null, null])

  const pool = tent
    ? slateportTentPool()
    : rentalPool(game, open, round, upgraded && canUpgrade(game, open, round))
  const inPool = useMemo(
    () =>
      load.sets
        ? load.sets
            .map((s, i) => ({ s, i }))
            .filter(({ i }) => i >= pool.from && i <= pool.to)
            .filter(({ s }) => s.species_id != null)
        : [],
    [load.sets, pool.from, pool.to],
  )
  const chosen = picked
    .map((i) => (i != null && i >= pool.from && i <= pool.to ? load.sets?.[i] : undefined))
    .map((s, k) => (s ? { s, i: picked[k]! } : null))
    .filter((x): x is { s: FacilitySet; i: number } => x != null)

  const rows = chosen.map(({ s }) => {
    const species = getSpecies(s.species_id!)
    const variety =
      species?.varieties.find((v) => v.pokemon_id === s.pokemon_id) ?? species?.varieties[0]
    const base = Object.fromEntries(
      (variety ? resolveStatsForGeneration(variety, generation) : []).map((x) => [
        x.stat,
        x.base_stat,
      ]),
    )
    const nature = s.nature_id != null ? getNature(s.nature_id) : undefined
    const mods = {
      increased: (nature?.increased_stat ?? null) as never,
      decreased: (nature?.decreased_stat ?? null) as never,
    }
    const evs = (s.evs ?? {}) as Record<string, number>
    const at = (iv: number) => rentalStats(base, evs, mods, pool.level, iv)
    return { nature, evs, stats: pool.iv === 'random' ? null : at(pool.iv), lo: at(0), hi: at(31) }
  })

  const reason = load.error
    ? `This game’s ${RENTAL_FACILITY_LABEL[facility]} sets did not load: ${load.error}`
    : !load.sets
      ? `Loading the ${RENTAL_FACILITY_LABEL[facility]} sets…`
      : chosen.length < 2
        ? 'Pick at least two sets from the pool.'
        : null

  return (
    <>
      <ToolInputs>
        {facilities.length > 1 && (
          <SelectField
            label="Facility"
            options={facilities.map((f) => ({ value: f, label: RENTAL_FACILITY_LABEL[f] }))}
            value={facility}
            data-testid="rnt-facility"
            onChange={(e) => {
              setFacility(e.target.value as RentalFacility)
              // Set indexes belong to one facility's pool.
              setPicked([null, null])
            }}
          />
        )}
        {!tent && (
          <div className="calc-row">
            <SelectField
              label="Level"
              options={[
                { value: 'l50', label: 'Level 50' },
                { value: 'open', label: 'Open Level (100)' },
              ]}
              value={open ? 'open' : 'l50'}
              data-testid="rnt-level"
              onChange={(e) => setOpen(e.target.value === 'open')}
            />
            <SelectField
              label="Round"
              options={Array.from({ length: 10 }, (_, k) => ({
                value: String(k + 1),
                label: `${k + 1} (battles ${k * 7 + 1}–${k * 7 + 7})`,
              }))}
              value={String(round)}
              data-testid="rnt-round"
              onChange={(e) => setRound(Number(e.target.value))}
            />
          </div>
        )}
        {!tent && (
          <SelectField
            label="Rentals"
            options={[
              { value: 'standard', label: 'Standard' },
              ...(canUpgrade(game, open, round)
                ? [
                    {
                      value: 'upgraded',
                      label:
                        game === 'emerald'
                          ? 'Better range (a long rental record)'
                          : `Upgraded (more than ${PLATINUM_UPGRADE_TRADES[0]} trades)`,
                    },
                  ]
                : []),
            ]}
            value={upgraded && canUpgrade(game, open, round) ? 'upgraded' : 'standard'}
            data-testid="rnt-upgraded"
            onChange={(e) => setUpgraded(e.target.value === 'upgraded')}
          />
        )}
        <p
          className="calc-result-note"
          data-testid="rnt-pool"
          data-from={pool.from}
          data-to={pool.to}
          data-iv={pool.iv}
          data-count={inPool.length}
        >
          Pool: sets {pool.from + 1}–{pool.to + 1} ({inPool.length} sets), level {pool.level}, every
          IV {pool.iv === 'random' ? 'random (the game reads past its IV table here)' : pool.iv}.
          {tent &&
            ` The tent offers six of all ${SLATEPORT_TENT.sets} sets at random every challenge: no rounds, no better rentals.`}
          {game === 'heartgold-soulsilver' &&
            ' HeartGold/SoulSilver: Platinum’s pool and rules — HGSS’s own are not extracted.'}
        </p>
        {hasBattleCastle(game) && (
          <p className="calc-result-note" data-testid="rnt-castle">
            {BATTLE_CASTLE_NOTE}
          </p>
        )}
        <div className="calc-row">
          {picked.map((idx, k) => (
            <SelectField
              key={k}
              label={`Set ${k + 1}`}
              options={[
                { value: '', label: '—' },
                ...inPool.map(({ s, i }) => ({ value: String(i), label: setLabel(s, i) })),
              ]}
              value={idx != null && idx >= pool.from && idx <= pool.to ? String(idx) : ''}
              data-testid={`rnt-set-${k + 1}`}
              onChange={(e) =>
                setPicked((p) =>
                  p.map((x, j) => (j === k ? (e.target.value ? Number(e.target.value) : null) : x)),
                )
              }
            />
          ))}
        </div>
        {picked.length < MAX && (
          <button
            type="button"
            className="tools-link"
            data-testid="rnt-add"
            onClick={() => setPicked((p) => [...p, null])}
          >
            + Add a set
          </button>
        )}
      </ToolInputs>
      <ToolResult reason={reason}>
        <div className="tools-compare-scroll">
          <table className="tools-compare" data-testid="rnt-table">
            <thead>
              <tr>
                <th />
                {chosen.map(({ s, i }) => (
                  <th key={i} scope="col">
                    {getSpecies(s.species_id!)?.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Item</th>
                {chosen.map(({ s, i }) => (
                  <td key={i}>{s.item_id ? getItem(s.item_id)?.display_name : '—'}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Nature</th>
                {rows.map((r, k) => (
                  <td key={k}>{r.nature?.display_name ?? '—'}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Moves</th>
                {chosen.map(({ s, i }) => (
                  <td key={i}>
                    {s.moves.map((m) => getMove(m)?.display_name ?? `#${m}`).join(', ')}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">EVs</th>
                {rows.map((r, k) => (
                  <td key={k}>
                    {STAT_KEYS.filter((key) => r.evs[key])
                      .map((key) => `${r.evs[key]} ${STAT_LABEL[STAT_KEYS.indexOf(key)]}`)
                      .join(', ') || '—'}
                  </td>
                ))}
              </tr>
              {STAT_LABEL.map((label, j) => {
                const values = rows.map((r) => (r.stats ? r.stats[j] : null))
                const best = bestOf(values)
                return (
                  <tr key={label} data-testid={`rnt-stat-${STAT_KEYS[j]}`}>
                    <th scope="row">{label}</th>
                    {rows.map((r, k) => (
                      <td
                        key={k}
                        className="num"
                        data-value={r.stats ? r.stats[j] : undefined}
                        data-best={best.has(k) || undefined}
                      >
                        {r.stats ? r.stats[j] : `${r.lo[j]}–${r.hi[j]}`}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ToolResult>
    </>
  )
}
