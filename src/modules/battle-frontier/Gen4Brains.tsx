import type { Facility, FacilitySet } from '../../data/trainers'
import { gen4BrainTeams } from './reference/gen4Brains'
import { itemName, moveNames, natureName } from './names'
import { Evs, MonCell, Muted, Num } from './parts'
import { GEN4_FACILITIES, HGSS_FLAG, type Gen4Facility, type Gen4Game } from './reference/gen4'
import { useTrainerPartition } from './reference/useTrainerPartition'

/**
 * Brains for Platinum and HeartGold/SoulSilver: the five Frontier Brains, when
 * each is met (reference/gen4.ts), and their teams.
 *
 * THE TEAMS ARE THE DISASSEMBLY'S. pokeplatinum's frontier trainer data gives each
 * Brain two trainers, Silver Print then Gold Print (the Trainer Dex's T306-T315,
 * by class), each drawing from its own sets: Palmer and Dahlia three, Darach six
 * (two per Pokémon; reference/gen4Brains.ts). Thorton and Argenta have none:
 * Thorton draws rentals, Argenta a Pokémon matched to yours. The Trainer Dex's
 * Bulbapedia teams (brain-palmer-1 etc.) hold exactly these sets;
 * verify:frontier-reference asserts it.
 *
 * HeartGold/SoulSilver read the same partition data (Platinum's pool, flagged).
 */

function Gen4TeamTable({ label, team, game }: { label: string; team: FacilitySet[]; game: Gen4Game }) {
  return (
    <div data-layout="brain-team">
      <p className="bf-sec">{label}</p>
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
            {team.map((m) => (
              <tr key={m.key} data-species-id={m.species_id}>
                <td className="bf-nw">
                  <MonCell speciesId={m.species_id} pokemonId={m.pokemon_id} versionGroup={game} />
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

function PrintTeams({ print, sets, game }: { print: 'Silver' | 'Gold'; sets: FacilitySet[]; game: Gen4Game }) {
  const label =
    sets.length === 3 ? `${print} Print team` : `${print} Print: three of these ${sets.length} sets, two per Pokémon`
  return (
    <div className="bf-stack" style={{ gridArea: print.toLowerCase() }} data-layout="brain-print" data-print={print.toLowerCase()}>
      <Gen4TeamTable label={label} team={sets} game={game} />
    </div>
  )
}

function Gen4BrainSection({ f, facility, game }: { f: Gen4Facility; facility: Facility | undefined; game: Gen4Game }) {
  const teams = facility ? gen4BrainTeams(facility, f.id) : { silver: [], gold: [] }
  const fixed = teams.silver.length > 0 || teams.gold.length > 0
  return (
    <section className="bf-brain" data-layout="brain" data-facility={f.id} aria-label={f.brain.name}>
      <header className="bf-brain-head" data-layout="brain-head">
        <h2 className="bf-name">
          {f.brain.title} {f.brain.name}
        </h2>
        <span className="bf-meta bf-muted">{f.name} · Silver and Gold Prints</span>
      </header>
      <p style={{ gridArea: 'when' }} data-layout="brain-appearances">
        Silver Print at battle <Num n={f.silver} />. Gold Print at battle <Num n={f.gold} />.
        {f.brainWhen ? ` ${f.brainWhen}.` : ''}
      </p>
      {fixed ? (
        <>
          <PrintTeams print="Silver" sets={teams.silver} game={game} />
          <PrintTeams print="Gold" sets={teams.gold} game={game} />
        </>
      ) : (
        <p style={{ gridArea: 'silver' }} data-layout="brain-generated">
          {f.brainTeam}.
        </p>
      )}
    </section>
  )
}

export function Gen4Brains({ game }: { game: Gen4Game }) {
  const load = useTrainerPartition(game)
  if (load.status === 'loading') return <p className="bf-notice">Loading the Trainer Dex…</p>
  if (load.status === 'error')
    return (
      <p className="bf-notice" role="alert">
        Could not load the Trainer Dex: {load.message}.{' '}
        <button type="button" className="bf-link" onClick={load.retry}>
          Try again
        </button>
      </p>
    )
  const facility = load.partition.facilities.find((x) => x.id === 'battle-frontier')
  return (
    <div className="bf-brain-list" data-layout="brain-list" data-game={game}>
      {game === 'heartgold-soulsilver' && (
        <p className="bf-flag" data-layout="frontier-flag" data-testid="frontier-hgss-flag">
          {HGSS_FLAG} <Muted>The teams below are Platinum’s.</Muted>
        </p>
      )}
      {GEN4_FACILITIES.map((f) => (
        <Gen4BrainSection key={f.id} f={f} facility={facility} game={game} />
      ))}
    </div>
  )
}
