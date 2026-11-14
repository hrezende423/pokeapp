import type { FacilityPokemon } from '../../data/trainers'
import type { FacilityId, FrontierBrain, FrontierData } from './data'
import { FACILITY_ORDER } from './format'
import { itemName, moveNames, natureName } from './names'
import { Appearance, Evs, MonCell, Num, Repeat } from './parts'

/**
 * Brains: the seven Frontier Brains, their Silver and Gold teams (sprites as the
 * Trainer Dex draws a party), or for Noland the rule that generates his team.
 * The wording is the approved mockup's (frontier-brains.html).
 */
export function Brains({ data }: { data: FrontierData }) {
  const brains = new Map(data.brains().map((b) => [b.facility, b]))
  return (
    <div className="bf-brain-list" data-layout="brain-list">
      {FACILITY_ORDER.map((id) => {
        const b = brains.get(id)
        return b ? <BrainSection key={id} b={b} data={data} /> : null
      })}
    </div>
  )
}

function TeamTable({ label, team, iv }: { label: 'Silver' | 'Gold'; team: FacilityPokemon[]; iv: number }) {
  return (
    <div data-layout="brain-team" data-symbol={label.toLowerCase()} style={{ gridArea: label.toLowerCase() }}>
      <p className="bf-sec">
        {label} Symbol team · IVs {iv} in every stat
      </p>
      <div className="bf-tw">
        <table className="bf-t bf-team">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '34%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Pokémon</th>
              <th>Item</th>
              <th>Nature</th>
              <th>EVs</th>
              <th>Moves</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m, i) => (
              <tr key={i} data-species-id={m.species_id}>
                <td className="bf-nw">
                  <MonCell speciesId={m.species_id} pokemonId={m.pokemon_id} />
                </td>
                <td className="bf-nw">{itemName(m.item_id)}</td>
                <td>{natureName(m.nature_id)}</td>
                <td>
                  <Evs evs={m.evs} />
                </td>
                <td>{moveNames(m.moves)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Noland: no fixed team. The rental range he draws from, per set, at both level modes. */
function GeneratedTeam({ b, data }: { b: FrontierBrain; data: FrontierData }) {
  const rows = Array.from({ length: 8 }, (_, c) => {
    const lv = data.trainerPoolForStreak({ facility: 'factory', levelMode: 'lv50', streak: c * 7 }).factorySetRange
    const op = data.trainerPoolForStreak({ facility: 'factory', levelMode: 'open', streak: c * 7 }).factorySetRange
    return { c, lv, op, span: c < 7 ? `${c * 7 + 1}–${c * 7 + 7}` : `${c * 7 + 1} on` }
  })
  return (
    <div className="bf-stack bf-generated" style={{ gridArea: 'silver' }} data-layout="brain-generated">
      <p style={{ gridArea: 'rule' }}>
        No fixed team. Each time, Noland draws three sets from the rental range of your current set, exactly as a
        regular Factory opponent does (no Unown, no repeated species or held item). IVs: <Num n={b.ivs.silver} /> in
        every stat at battle <Num n={b.silver.battle} />, <Num n={b.ivs.gold} /> at battle <Num n={b.gold.battle} />{' '}
        and after.
      </p>
      <p className="bf-cap" style={{ gridArea: 'note' }}>
        The table team listed for him in the game data (Metang, Skarmory, Aggron) is Steven’s multi-battle team and is
        never used here.
      </p>
      <div className="bf-tw" style={{ gridArea: 'ranges' }}>
        <table className="bf-t">
          <thead>
            <tr>
              <th>Battles</th>
              <th className="bf-r">Lv50 sets</th>
              <th className="bf-r">Count</th>
              <th className="bf-r">Open Level sets</th>
              <th className="bf-r">Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, lv, op, span }) => (
              <tr key={c}>
                <td className="bf-mono">{span}</td>
                <td className="bf-r bf-mono">{lv && `#${lv.from}–#${lv.to}`}</td>
                <td className="bf-r bf-mono">{lv && lv.to - lv.from + 1}</td>
                <td className="bf-r bf-mono">{op && `#${op.from}–#${op.to}`}</td>
                <td className="bf-r bf-mono">{op && op.to - op.from + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BrainSection({ b, data }: { b: FrontierBrain; data: FrontierData }) {
  const facilityName = (id: FacilityId) => data.facilities().find((f) => f.id === id)?.name ?? id
  return (
    <section className="bf-brain" data-layout="brain" data-facility={b.facility} aria-label={b.name}>
      <header className="bf-brain-head" data-layout="brain-head">
        <h2 className="bf-name">
          {b.title} {b.name}
        </h2>
        <span className="bf-meta bf-muted">
          {facilityName(b.facility)} · {b.symbolName}
        </span>
      </header>
      <p style={{ gridArea: 'when' }} data-layout="brain-appearances">
        Silver at <Appearance a={b.silver} />. Gold at <Appearance a={b.gold} />, then <Repeat b={b} />. Singles only.
      </p>
      {b.teamKind === 'fixed' && b.teams ? (
        <>
          <TeamTable label="Silver" team={b.teams.silver} iv={b.ivs.silver} />
          <TeamTable label="Gold" team={b.teams.gold} iv={b.ivs.gold} />
        </>
      ) : (
        <GeneratedTeam b={b} data={data} />
      )}
    </section>
  )
}
