import { IconArrowLeft } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import {
  getItem,
  getMove,
  getNature,
  getSpecies,
  getType,
  DEFAULT_ARTWORK_VIEW,
  resolveAbilitiesForGeneration,
  resolveArtworkUrl,
  resolveTypesForGeneration,
  slotsFor,
  versionSpriteUrl,
  getSpriteUrl,
  type Species,
  type Variety,
} from '../../data'
import { moveForGeneration } from '../../data/moveEra'
import { usePageCredit } from '../../components/pageCredit'
import { GenderSign } from '../../components/GenderSign'
import type {
  FacilityPokemon,
  FacilitySet,
  StatSpread,
  TrainerPartition,
  TrainerPokemon,
} from '../../data/trainers'
import { TypeAbbr, TypeLabel } from '../../components/ds/TypeLabel'
import { useDexSelection, useNav } from '../nav/navContext'
import { BrainToolLink } from '../tools/BrainToolLink'
import { hasBrainTool } from '../tools/brainTools'
import { useVersionGroup } from '../version-group/context'
import { GameRow } from '../version-group/GameRow'
import { DataTable, ProseCell, type Column } from '../../components/DataTable'
import { DexPageShell } from './DexPageShell'
import { SplitColumns } from './EntityDetailPage'
import {
  TRAINER_KIND_LABEL,
  trainerEntries,
  useTrainerdexGame,
  useTrainerPartition,
  type TrainerEntry,
} from './trainerEntries'
import './trainerdex.css'

/**
 * Trainer Dex: every trainer in the selected game -- the ones on the way through,
 * their rematches, the battle-facility opponents and the Frontier Brains -- and
 * what each one brings.
 *
 * THE DATA IS scripts/build-trainers.mjs's bundle (data/trainers.ts): parties
 * from the pret disassemblies, placement from Bulbapedia's walkthroughs and
 * location pages. The list defaults to walkthrough order, so it reads as the
 * game plays.
 *
 * PER GAME, NOT PER GENERATION. Under "All" there is no one game to show, so the
 * page asks for one -- the same answer the learnset and encounter views give.
 *
 * WHAT IS DERIVED, SAID SO. A move list the game fills from the level-up table
 * is marked as such; a nature, ability slot and gender come from the game's own
 * personality rule (see scripts/trainers/mechanics.mjs); an ability is resolved
 * for the game's generation by era.ts, never stored.
 */

const SPRITE_GAME: Record<string, string> = { 'gold-silver': 'gold' }

function spriteFor(pokemonId: number, speciesId: number, variety: Variety | undefined, vg: string) {
  const game = SPRITE_GAME[vg] ?? vg
  if (variety) {
    const slots = slotsFor(variety, game)
    const slot = slots.includes('front_transparent')
      ? 'front_transparent'
      : slots.includes('front_default')
        ? 'front_default'
        : null
    if (slot) return versionSpriteUrl(pokemonId, game, slot)
  }
  return getSpriteUrl(speciesId)
}

const varietyOf = (
  speciesId: number | undefined,
  pokemonId: number | undefined,
): Variety | undefined => {
  const sp = speciesId != null ? getSpecies(speciesId) : undefined
  return (
    sp?.varieties.find((v) => v.pokemon_id === pokemonId) ?? sp?.varieties.find((v) => v.is_default)
  )
}

// en-US grouping, as the Itemdex prints it: the browser's locale gave "₽1.200".
const money = (n: number | null) => (n == null ? '—' : `₽${n.toLocaleString('en-US')}`)

const AI_LABEL = (flag: string) => flag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function Trainerdex() {
  const { isAll } = useVersionGroup()
  /* Trainers belong to one GAME and the app picks a generation: the page has its
     own game row, offering only the generation's games with trainer data. */
  const game = useTrainerdexGame()
  const vgName = game.versionGroup?.name ?? null
  const { state, retry } = useTrainerPartition(vgName)
  const partition = state.status === 'ready' ? state.partition : null
  const entries = useMemo(() => (partition ? trainerEntries(partition) : []), [partition])
  /* The Movedex's mini navbar, right-aligned over the list (owner, 2026-10-11). */
  const row = <GameRow scope={game} testId="trainerdex-game" variant="nav" />
  /* The source credit lives behind the app's "i" now, not on the page (owner,
     2026-10-11). Bulbapedia's content is CC BY-NC-SA; the attribution is theirs. */
  usePageCredit(
    partition ? (
      <>
        Parties from the pret disassembly ({partition.sources.disassembly}). Locations and order
        from{' '}
        <a href="https://bulbapedia.bulbagarden.net/" target="_blank" rel="noreferrer">
          Bulbapedia
        </a>{' '}
        (CC BY-NC-SA).
      </>
    ) : null,
    partition ? partition.sources.disassembly : null,
  )

  if (isAll) {
    return (
      <div className="pokedex" data-testid="dex-trainerdex">
        <p className="subtitle" data-testid="trainerdex-empty">
          Trainers belong to one game. Choose a generation to see its trainers.
        </p>
      </div>
    )
  }
  if (state.status === 'idle' || state.status === 'unavailable') {
    return (
      <div className="pokedex" data-testid="dex-trainerdex">
        <p className="subtitle" data-testid="trainerdex-empty">
          No trainer data for this generation: trainers come from the Gen 1-4 disassemblies.
        </p>
      </div>
    )
  }
  if (state.status === 'loading') {
    return (
      <div className="pokedex" data-testid="dex-trainerdex">
        {row}
        <p className="subtitle" data-testid="trainerdex-loading">
          Loading trainers…
        </p>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="pokedex" data-testid="dex-trainerdex">
        {row}
        <p className="subtitle" data-testid="trainerdex-error">
          The trainers did not load ({state.message}).{' '}
          <button type="button" className="ghost-button" onClick={retry}>
            Retry
          </button>
        </p>
      </div>
    )
  }

  const vg = state.partition.version_group
  return (
    <DexPageShell
      dexId="trainerdex"
      entries={entries}
      entryId={(e) => e.id}
      /* The game navbar heads the TABLE's column rather than the shell's
         controls row, so its right edge is the table's (owner, 2026-10-11);
         sticky, so it stays while the list scrolls. */
      list={({ entries: visible, onSelect }) => (
        <div className="trainer-list">
          <div className="trainer-list-nav">{row}</div>
          <DataTable
            rows={visible}
            columns={trainerColumns(vg)}
            rowKey={(e) => e.id}
            onRowClick={(e) => onSelect(e.id)}
            testId="trainerdex-rows"
            emptyNote="No trainer matches those filters."
            plain
          />
        </div>
      )}
      detailScrolls
      detail={({ entry, onBack, scrollKey }) => (
        <TrainerDetail
          key={entry.id}
          entry={entry}
          partition={state.partition}
          onBack={onBack}
          scrollKey={scrollKey}
        />
      )}
    />
  )
}

/**
 * THE TRAINER DEX AS A TABLE WITH SORTABLE HEADERS (owner, 2026-10-10). What
 * was one middot-joined sub-line -- location, variant, levels, prize -- is a
 * column each, so each can be sorted. Initial order stays the walkthrough order
 * the list had, which is the order the entries arrive in.
 */
function trainerColumns(vg: string): Column<TrainerEntry>[] {
  return [
    { key: 'name', label: 'Trainer', width: '13rem', sortValue: (e) => e.label },
    {
      key: 'location',
      label: 'Location',
      width: '15rem',
      sortValue: (e) => e.location,
      // ProseCell: the plain table's hover weight must not re-wrap a location.
      render: (e) => (
        <ProseCell
          text={
            e.location
              ? e.area
                ? `${e.location} · ${e.area}`
                : e.location
              : e.kind !== 'facility'
                ? 'Location not found'
                : '—'
          }
        />
      ),
    },
    {
      key: 'note',
      label: 'Note',
      width: '12rem',
      sortValue: (e) => e.variant ?? (e.kind !== 'story' ? TRAINER_KIND_LABEL[e.kind] : null),
      render: (e) => (
        <ProseCell text={e.variant ?? (e.kind !== 'story' ? TRAINER_KIND_LABEL[e.kind] : '—')} />
      ),
    },
    {
      key: 'level',
      label: 'Level',
      width: '5rem',
      numeric: true,
      sortValue: (e) => e.levels?.[1] ?? null,
      render: (e) => (
        <span className="num">
          {e.levels
            ? e.levels[0] === e.levels[1]
              ? e.levels[0]
              : `${e.levels[0]}–${e.levels[1]}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'prize',
      label: 'Prize',
      width: '5.5rem',
      numeric: true,
      sortValue: (e) => e.prize,
      render: (e) => <span className="num">{money(e.prize)}</span>,
    },
    {
      key: 'party',
      label: 'Party',
      width: '13rem',
      render: (e) => <PartyStrip entry={e} vg={vg} />,
    },
  ]
}

/** The party as small sprites; a set-drawing facility trainer shows its pool size. */
function PartyStrip({ entry: e, vg }: { entry: TrainerEntry; vg: string }) {
  const mons = e.trainer?.party ?? e.facilityTrainer?.party
  if (!mons) {
    const n = e.facilityTrainer?.set_keys?.length ?? 0
    return <span className="row-count">{n ? `${n} sets` : ''}</span>
  }
  return (
    <span className="trainer-strip" aria-hidden>
      {mons.slice(0, 6).map((m, i) => {
        const url =
          m.species_id != null
            ? spriteFor(
                m.pokemon_id ?? m.species_id,
                m.species_id,
                varietyOf(m.species_id, m.pokemon_id),
                vg,
              )
            : null
        return url ? <img key={i} src={url} alt="" width={32} height={32} loading="lazy" /> : null
      })}
    </span>
  )
}

/**
 * A trainer's page, in the Movedex's two columns (owner, 2026-10-11): who they
 * are on the left, scrolling on its own, and their party on the right as a grid
 * of three cards a row.
 *
 * EVERY TEAM ON ONE PAGE. The list has one row per trainer now, so a trainer with
 * rematches or a team per starter offers them as a mini navbar over the party --
 * the Movedex's game navbar, the same buttons. The left column follows the team:
 * its prize, its bag items and where it is fought belong to that team.
 */
function TrainerDetail({
  entry,
  partition,
  onBack,
  scrollKey,
}: {
  entry: TrainerEntry
  partition: TrainerPartition
  onBack: () => void
  scrollKey: (part: string) => string
}) {
  const gen = partition.generation
  const vg = partition.version_group
  const teams = entry.teams ?? []
  const [teamIndex, setTeamIndex] = useState(0)
  const team = teams[Math.min(teamIndex, teams.length - 1)]
  const t = team?.trainer
  const ft = entry.facilityTrainer
  const f = entry.facility
  const first = t?.appearances[0]

  const info = (
    <>
      <div className="pokedex-back-row">
        <button type="button" className="pokedex-back" data-testid="entity-back" onClick={onBack}>
          <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
          All trainers
        </button>
      </div>

      <h2 className="entity-detail-name" data-testid="trainerdex-name">
        {entry.label}
      </h2>
      <p className="entity-detail-meta" data-testid="trainerdex-meta">
        {TRAINER_KIND_LABEL[entry.kind]}
        {entry.location && ` · ${entry.location}${entry.area ? ` · ${entry.area}` : ''}`}
      </p>

      <ul className="fact-rows" data-testid="trainerdex-facts">
        {t && (
          <>
            <Fact label="Location" testId="trainerdex-location">
              {first ? (
                <>
                  {first.location ?? '—'}
                  {first.area && <span className="fact-note"> · {first.area}</span>}
                </>
              ) : (
                'Not found in the walkthrough or on any location page'
              )}
            </Fact>
            {first?.source === 'walkthrough' && first.part != null && (
              <Fact label="Walkthrough" testId="trainerdex-part">
                Part {first.part}
              </Fact>
            )}
            {t.appearances.length > 1 && (
              <Fact label="Also met" testId="trainerdex-also">
                {t.appearances
                  .slice(1)
                  .map((a) => [a.location, a.area].filter(Boolean).join(' · '))
                  .filter(Boolean)
                  .join('; ')}
              </Fact>
            )}
            {first?.note && <Fact label="Note">{first.note}</Fact>}
            <Fact label="Battle" testId="trainerdex-battle">
              {t.battle === 'double'
                ? 'Double battle'
                : t.battle === 'tag'
                  ? 'Tag battle'
                  : 'Single battle'}
            </Fact>
            {/* The TEAM's prize. A rematch's is derived (trainerEntries.ts),
                and says so to a pointer and to the suites. */}
            <Fact label="Prize" testId="trainerdex-prize">
              <span
                className="num"
                data-derived={t.prize == null && team.prize != null ? 'true' : undefined}
                title={
                  t.prize == null && team.prize != null
                    ? "The class's base payout × the last Pokémon's level, the games' own rule"
                    : undefined
                }
              >
                {money(team.prize)}
              </span>
            </Fact>
            {t.items.length > 0 && (
              <Fact label="Bag items" testId="trainerdex-items">
                {countedItems(t.items)}
              </Fact>
            )}
            {t.ai.length > 0 && (
              <Fact label="AI" testId="trainerdex-ai">
                {t.ai.map(AI_LABEL).join(', ')}
              </Fact>
            )}
            {hasBrainTool(t.class_id) && (
              <Fact label="Tool" testId="trainerdex-tool">
                <BrainToolLink classId={t.class_id} />
              </Fact>
            )}
            {t.versions && (
              <Fact label="Only in">
                {t.versions.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(', ')}
              </Fact>
            )}
            {t.unused && <Fact label="Status">In the game data, never fought</Fact>}
          </>
        )}
        {ft && f && (
          <>
            <Fact label="Facility" testId="trainerdex-facility">
              {f.name}
            </Fact>
            {ft.group && <Fact label="Where">{ft.group}</Fact>}
            {ft.note && <Fact label="Note">{ft.note}</Fact>}
            {f.source_note && <Fact label="Data">{f.source_note}</Fact>}
          </>
        )}
      </ul>

      {f && (
        <p className="entity-detail-desc trainer-rules" data-testid="trainerdex-rules">
          {f.rules}
        </p>
      )}
    </>
  )

  const party = (
    <>
      {teams.length > 1 && (
        <div className="game-nav trainer-team-nav" data-testid="trainerdex-teams">
          <div className="game-nav-items" role="group" aria-label="Team">
            {teams.map((tm, i) => (
              <button
                key={tm.trainer.id}
                type="button"
                className={i === teamIndex ? 'nav-trigger nav-trigger-active' : 'nav-trigger'}
                data-testid={`trainerdex-team-${i}`}
                aria-pressed={i === teamIndex}
                onClick={() => setTeamIndex(i)}
              >
                {tm.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {t && t.party.length > 0 && (
        /* No "Party" label (owner, 2026-10-11): the navbar above says whose
           team it is, and the label cost the second row its place on screen. */
        <section className="entity-detail-section" data-testid="trainerdex-party">
          <ul className="trainer-party">
            {t.party.map((m, i) => (
              <li key={`${t.id}-${i}`}>
                <MonCard mon={m} gen={gen} index={i} />
              </li>
            ))}
            <PartySizer parties={teams.map((tm) => tm.trainer.party)} gen={gen} />
          </ul>
        </section>
      )}

      {ft?.party && ft.party.length > 0 && (
        <section className="entity-detail-section" data-testid="trainerdex-party">
          <ul className="trainer-party">
            {ft.party.map((m, i) => (
              <li key={i}>
                <MonCard mon={m} gen={gen} index={i} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {f && ft && !ft.party && (
        <SetPool facility={f} keys={ft.set_keys ?? f.sets.map((s) => s.key)} gen={gen} />
      )}
    </>
  )

  return (
    <SplitColumns
      testId="trainerdex-detail"
      className="trainer-detail"
      entryId={entry.id}
      infoTestId="trainerdex-detail-scroll"
      scrollKey={(part) => `${scrollKey(part)}|${vg}|${teamIndex}`}
      info={info}
      grid={party}
    />
  )
}

/** "4× Full Restore, Potion": one name per item, with its count. */
function countedItems(ids: number[]): string {
  const counts = new Map<number, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts]
    .map(([id, n]) => {
      const name = getItem(id)?.display_name ?? `#${id}`
      return n > 1 ? `${n}× ${name}` : name
    })
    .join(', ')
}

function Fact({
  label,
  children,
  testId,
}: {
  label: string
  children: React.ReactNode
  testId?: string
}) {
  return (
    <li>
      <span className="fact-label">{label}</span>
      <span className="fact-value" data-testid={testId}>
        {children}
      </span>
    </li>
  )
}

type AnyMon = TrainerPokemon | FacilityPokemon | FacilitySet

/* The Build Form's spelling of a move's category (owner, 2026-10-12). */
const CATEGORY_ABBR: Record<string, string> = {
  physical: 'Phy',
  special: 'Spe',
  status: 'Sta',
}

const CATEGORY_LABEL: Record<string, string> = {
  physical: 'Physical',
  special: 'Special',
  status: 'Status',
}

const SPREAD_ORDER: [keyof StatSpread, string][] = [
  ['hp', 'HP'],
  ['attack', 'Atk'],
  ['defense', 'Def'],
  ['special-attack', 'SpA'],
  ['special-defense', 'SpD'],
  ['speed', 'Spe'],
]

/** "133Atk/125SpD/252Spe", the Team Display's spelling; null when all zero. */
function spread(s: StatSpread): string | null {
  const parts = SPREAD_ORDER.filter(([k]) => s[k] != null && s[k] !== 0).map(
    ([k, l]) => `${s[k]}${l}`,
  )
  return parts.length ? parts.join('/') : null
}

/**
 * The stat line, only what applies (owner, 2026-10-11: "no EV spread mention if
 * it doesn't apply"). EVs as the Team Display spells them; IVs after, suffixed so
 * a lone "0" cannot be read as an EV. Gen 1-2 DVs in their four-stat order.
 */
function statLine(mon: AnyMon): string | null {
  const parts: string[] = []
  const evs = 'evs' in mon && mon.evs ? spread(mon.evs) : null
  if (evs) parts.push(evs)
  if ('dvs' in mon && mon.dvs) {
    const d = mon.dvs
    parts.push(`${d.attack}Atk/${d.defense}Def/${d.speed}Spe/${d.special}Spc DV`)
  } else if ('iv' in mon && mon.iv != null) {
    parts.push(`${mon.iv} IV`)
  } else if ('iv_random' in mon && mon.iv_random) {
    parts.push('random IV')
  } else if ('ivs' in mon && mon.ivs) {
    const values = SPREAD_ORDER.map(([k]) => mon.ivs?.[k] ?? 0)
    parts.push(
      values.every((v) => v === values[0]) ? `${values[0]} IV` : `${spread(mon.ivs) ?? '0'} IV`,
    )
  }
  return parts.length ? parts.join(' · ') : null
}

/**
 * One Pokemon of a trainer's party, as a Pokédex card made battle-ready (owner,
 * 2026-10-11): the grid card's watermark number, katakana and OFFICIAL ARTWORK,
 * then the battle lines in the owner's order --
 *
 *   Pikachu ♂ @Light Ball Lv.88
 *   ELECTRIC
 *   Bashful · Static
 *   30 IV
 *   ~ the four moves, then type and category abbreviated: "ELE Spe"
 *
 * No labels ("Item", "Ability"), no held-item sprite, no outline, and no "moves
 * from the level-up table" note. Its own component rather than the Team
 * Display's MemberCard, which is a signed-off screen.
 */
function MonCard({ mon, gen, index }: { mon: AnyMon; gen: number; index: number }) {
  const [, selectSpecies] = useDexSelection('pokedex')
  const nav = useNav()
  const species = mon.species_id != null ? getSpecies(mon.species_id) : undefined
  const variety = varietyOf(mon.species_id, mon.pokemon_id)
  if (!species || !variety) return null
  /* Whether the game sets the moves or fills them from the level-up table is
     no longer drawn (owner, 2026-10-11); it stays on the card for the suites. */
  const explicit = 'moves_explicit' in mon ? mon.moves_explicit : true
  const art = resolveArtworkUrl(species, variety, DEFAULT_ARTWORK_VIEW)

  return (
    <div
      className="species-card trainer-card"
      data-testid={`trainerdex-mon-${index}`}
      data-moves-explicit={explicit}
      data-species-id={species.id}
    >
      <button
        type="button"
        className="species-card-hit"
        aria-label={monName(species, variety)}
        onClick={() => {
          selectSpecies(species.id)
          nav.setModule('pokedex')
        }}
      />
      <span className="species-card-ghost" aria-hidden>
        {String(species.id).padStart(3, '0')}
      </span>
      {species.name_ja && (
        <span className="species-card-ghost-ja" aria-hidden>
          {species.name_ja}
        </span>
      )}
      {art && <img className="species-card-art" src={art} alt="" loading="lazy" />}
      <MonText mon={mon} gen={gen} index={index} />
    </div>
  )
}

function monName(species: Species, variety: Variety): string {
  return variety.is_default
    ? species.display_name
    : `${species.display_name} (${variety.name.slice(species.name.length + 1).replace(/-/g, ' ')})`
}

/**
 * The card's battle lines. Also drawn, without test ids, by PartySizer -- the
 * cards' width is the widest of these lines across every team the trainer has.
 */
function MonText({
  mon,
  gen,
  index,
  sizer = false,
}: {
  mon: AnyMon
  gen: number
  index: number
  sizer?: boolean
}) {
  const species = mon.species_id != null ? getSpecies(mon.species_id) : undefined
  const variety = varietyOf(mon.species_id, mon.pokemon_id)
  if (!species || !variety) return null
  const types = resolveTypesForGeneration(variety, gen).map((x) => getType(x.type_id)?.name ?? '')
  const level = 'level' in mon ? mon.level : undefined
  const slot = 'ability_slot' in mon ? mon.ability_slot : undefined
  const abilities =
    gen >= 3 ? resolveAbilitiesForGeneration(variety, gen).filter((a) => !a.is_hidden) : []
  const ability =
    slot != null && abilities.length ? (abilities[slot] ?? abilities[0]).ability : undefined
  const nature = 'nature_id' in mon && mon.nature_id ? getNature(mon.nature_id) : undefined
  const itemName =
    ('item_name' in mon && mon.item_name) ||
    (mon.item_id ? getItem(mon.item_id)?.display_name : null)
  const gender = 'gender' in mon ? mon.gender : null
  const meta = [nature?.display_name, ability?.display_name].filter((x): x is string => !!x)
  const stats = statLine(mon)

  return (
    <span className="trainer-card-text">
      <span className="trainer-card-head">
        <span className="species-name">{monName(species, variety)}</span>
        {gender && (
          <span className="trainer-card-gender">
            <GenderSign sign={gender === 'M' ? '♂' : '♀'} />
          </span>
        )}
        {/* The held item, Showdown-style: "@" is the convention, not a label. */}
        {itemName && (
          <span
            className="trainer-card-item"
            data-testid={sizer ? undefined : `trainerdex-held-item-${index}`}
          >
            @{itemName}
          </span>
        )}
        <span className="trainer-card-level num">
          {level != null ? `Lv.${level}` : 'Lv varies'}
        </span>
      </span>
      <span className="trainer-card-types">
        {types.map((ty, i) => (
          <span key={ty}>
            {i > 0 && <span className="trainer-card-dot"> · </span>}
            <TypeLabel type={ty} small />
          </span>
        ))}
      </span>
      {meta.length > 0 && <span className="trainer-card-meta">{meta.join(' · ')}</span>}
      {stats && <span className="trainer-card-stats num">{stats}</span>}
      <span className="trainer-card-moves">
        {mon.moves.map((id) => {
          const raw = getMove(id)
          if (!raw) return null
          const mv = moveForGeneration(raw, gen)
          const type = mv.type_id != null ? (getType(mv.type_id)?.name ?? '') : ''
          return (
            <span key={id} className="trainer-card-move">
              <span className="trainer-card-move-name">~ {mv.display_name}</span>
              {type ? <TypeAbbr type={type} /> : <span />}
              <span
                className="trainer-card-move-cat"
                title={CATEGORY_LABEL[mv.damage_class ?? '']}
              >
                {CATEGORY_ABBR[mv.damage_class ?? ''] ?? '—'}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}

/**
 * THE CARDS FIT THEIR WIDEST LINE (owner, 2026-10-12: "reduce the card width to
 * fit + comfortable margin") -- across EVERY team of the trainer, not just the
 * one on screen, so switching teams never resizes the cards or moves the
 * navbar. A fixed width cannot do it: the head line runs from ~110px for most
 * parties to 233px (Misdreavus @Bright Powder), so one number either truncates
 * the held items or barely narrows anything.
 *
 * This is an invisible, zero-height grid item holding every team's text lines.
 * The party grid's columns are equal fractions of a max-content grid, so each
 * resolves to the widest item in any column -- the sizer included.
 */
function PartySizer({ parties, gen }: { parties: AnyMon[][]; gen: number }) {
  if (parties.length < 2) return null
  return (
    <li className="trainer-party-sizer" aria-hidden>
      {parties.flat().map((m, i) => (
        <MonText key={i} mon={m} gen={gen} index={i} sizer />
      ))}
    </li>
  )
}

/** A facility trainer's pool: every set it can draw from. */
function SetPool({
  facility,
  keys,
  gen,
}: {
  facility: TrainerPartition['facilities'][number]
  keys: string[]
  gen: number
}) {
  const byKey = useMemo(() => new Map(facility.sets.map((s) => [s.key, s])), [facility])
  const sets = keys.map((k) => byKey.get(k)).filter((s): s is FacilitySet => s != null)
  return (
    <section className="entity-detail-section" data-testid="trainerdex-sets">
      <h3 className="entity-detail-section-label">Possible Pokémon</h3>
      <ul className="trainer-party">
        {sets.map((s, i) => (
          <li key={s.key}>
            <MonCard mon={s} gen={gen} index={i} />
          </li>
        ))}
      </ul>
    </section>
  )
}
