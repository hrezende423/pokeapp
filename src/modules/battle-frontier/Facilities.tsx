import type { ReactNode } from 'react'
import type { FacilityId, FrontierData, FrontierFormat, ShopClerk } from './data'
import { FACILITY_ORDER, FORMAT_LABEL, partyText, SET_TEXT } from './format'
import { SpeedFacilitySection } from './OtherFacilities'
import { Appearance, Joined, Kv, Muted, Num, Range, Repeat, SpeciesLink } from './parts'
import { TRAINER_HILL } from './reference/speed'

/**
 * Facilities: the seven facility sections, Trainer Hill, then what the Frontier shares (symbols, level
 * rules, banned species, Battle Points and the BP shop). Every value is the
 * loader's; the wording is the approved mockup's (frontier-facilities.html).
 */
export function Facilities({ data }: { data: FrontierData }) {
  return (
    <div className="bf-fac-grid" data-layout="facility-grid">
      {FACILITY_ORDER.map((id) => (
        <FacilitySection key={id} id={id} data={data} />
      ))}
      {/* Emerald's other facility: not the Frontier's, so outside its shared rules. */}
      <SpeedFacilitySection refData={TRAINER_HILL} area="hill" />
      <SharedSection data={data} />
    </div>
  )
}

/**
 * BP per completed set (Dome: tournament), from bpAward for sets 1-30, as runs of
 * equal awards: "1–2 → 1 · 3–4 → 2 · … · 29 on → 15". Exact, one line per format.
 */
function BpRuns({ data, facility, format }: { data: FrontierData; facility: FacilityId; format: FrontierFormat }) {
  const runs: { from: number; to: number; v: number }[] = []
  for (let k = 0; k < 30; k++) {
    const v = data.bpAward({ facility, format, completedSets: k + 1 })?.base ?? 0
    const last = runs.at(-1)
    if (last?.v === v) last.to = k + 1
    else runs.push({ from: k + 1, to: k + 1, v })
  }
  return (
    <Joined
      sep={<Muted> · </Muted>}
      items={runs.map((r, i) => (
        <span key={r.from} className="bf-nw">
          {i === runs.length - 1 ? (
            <>
              <Num n={r.from} /> <Muted>on</Muted>
            </>
          ) : r.from === r.to ? (
            <Num n={r.from} />
          ) : (
            <Range from={r.from} to={r.to} />
          )}{' '}
          <Muted>→</Muted> <Num n={r.v} />
        </span>
      ))}
    />
  )
}

function FacilitySection({ id, data }: { id: FacilityId; data: FrontierData }) {
  const f = data.facilities().find((x) => x.id === id)
  const b = data.brains().find((x) => x.facility === id)
  if (!f || !b) return null
  const rows: [string, ReactNode][] = [
    ['Formats', f.formats.map((x) => FORMAT_LABEL[x.id]).join(' · ')],
    ['Party', partyText(f)],
    ['Challenge', SET_TEXT[f.unit](f)],
    ['Brain', `${b.title} ${b.name} · ${b.symbolName}`],
    ['Silver', <Appearance a={b.silver} />],
    [
      'Gold',
      <>
        <Appearance a={b.gold} />, then <Repeat b={b} />
      </>,
    ],
    ['Brain team', b.teamKind === 'generated' ? 'Generated from the rental sets each time' : 'Fixed (see Brains)'],
    ...f.formats.map((x): [string, ReactNode] => [
      `BP · ${FORMAT_LABEL[x.id]}`,
      <BpRuns data={data} facility={id} format={x.id} />,
    ]),
  ]
  const unit = id === 'dome' ? 'tournament' : 'set'
  return (
    <section className="bf-fac" data-layout="facility" data-facility={id} style={{ gridArea: id }} aria-label={f.name}>
      <h2 className="bf-name">{f.name}</h2>
      <p className="bf-rule">
        {f.rules}{' '}
        <span className="bf-cap">
          BP rows: completed {unit}s in the streak → BP for that {unit}.
        </span>
      </p>
      <Kv rows={rows} layout="facility-facts" />
    </section>
  )
}

const CLERKS: [ShopClerk, string, string][] = [
  ['decor-1', 'd1', 'Dolls and cushions'],
  ['decor-2', 'd2', 'Large dolls'],
  ['vitamins', 'vit', 'Vitamins'],
  ['hold-items', 'hold', 'Hold items'],
]

function SharedSection({ data }: { data: FrontierData }) {
  const facilityName = (id: FacilityId) => data.facilities().find((f) => f.id === id)?.name ?? id
  const brains = new Map(data.brains().map((b) => [b.facility, b]))
  const open = data.trainerPoolForStreak({ facility: 'tower', levelMode: 'open', streak: 0 }).level
  const factoryOpen = data.trainerPoolForStreak({ facility: 'factory', levelMode: 'open', streak: 0 }).level
  const openMin = open.mode === 'open' ? open.min : 0
  const factoryMin = factoryOpen.mode === 'open' ? factoryOpen.min : 0
  const openOnly = data.sets().filter((s) => s.openOnly)
  const banned = data.bannedSpecies()
  const brainBonus = data.bpAward({ facility: 'tower', format: 'singles', completedSets: 1, brain: true })?.brainBonus ?? 0
  const shop = data.bpShop()

  return (
    <section className="bf-shared" data-layout="frontier-shared" aria-label="Across the Frontier">
      <h2 className="bf-name" style={{ gridArea: 'title' }}>
        Across the Frontier
      </h2>
      <div style={{ gridArea: 'symbols' }} data-layout="frontier-symbols">
        <p className="bf-sec">Symbols</p>
        <div className="bf-tw">
          <table className="bf-t">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Symbol</th>
                <th>Silver</th>
                <th>Gold</th>
              </tr>
            </thead>
            <tbody>
              {FACILITY_ORDER.map((id) => {
                const b = brains.get(id)
                if (!b) return null
                return (
                  <tr key={id}>
                    <td>{facilityName(id)}</td>
                    <td>{b.symbolName}</td>
                    <td>
                      <Appearance a={b.silver} />
                    </td>
                    <td>
                      <Appearance a={b.gold} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ gridArea: 'levels' }} data-layout="frontier-levels">
        <p className="bf-sec">Level 50 and Open Level</p>
        <Kv
          rows={[
            [
              'Level 50',
              `Opponents are level 50. The ${openOnly.length} sets from #${openOnly[0]?.index} to #${openOnly.at(-1)?.index} are never drawn.`,
            ],
            [
              'Open Level',
              `Opponents match your highest-level Pokémon, at least ${openMin}. Battle Factory: always ${factoryMin}, because the rentals are level ${factoryMin}.`,
            ],
          ]}
        />
      </div>
      <div style={{ gridArea: 'banned' }} data-layout="frontier-banned">
        <p className="bf-sec">Banned species ({banned.length})</p>
        <p className="bf-banned">
          {banned.map((id) => (
            <SpeciesLink key={id} id={id} />
          ))}
        </p>
      </div>
      <div style={{ gridArea: 'bprules' }} data-layout="frontier-bp-rules">
        <p className="bf-sec">Battle Points</p>
        <Kv
          rows={[
            ['Brain win', `+${brainBonus} on top of the set’s award`],
            [
              'Balance cap',
              <>
                <Num n={data.addBattlePoints(9999, 1)} /> BP
              </>,
            ],
          ]}
        />
      </div>
      <div className="bf-shop" data-layout="frontier-bp-shop">
        {CLERKS.map(([clerk, area, title]) => {
          const entries = shop.filter((e) => e.clerk === clerk)
          return (
            <div key={clerk} style={{ gridArea: area }} data-layout="bp-shop-clerk" data-clerk={clerk}>
              <p className="bf-sec">
                {title} ({entries.length})
              </p>
              <table className="bf-t">
                <tbody>
                  {entries.map((e) => (
                    <tr key={`${e.name}-${e.price}`}>
                      <td>{e.name}</td>
                      <td className="bf-r bf-nw">
                        <Num n={e.price} /> <Muted>BP</Muted>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </section>
  )
}
