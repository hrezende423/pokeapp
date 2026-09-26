import { IconArrowLeft } from '@tabler/icons-react'
import { useMemo } from 'react'
import {
  getItem,
  getMove,
  getNature,
  getSpecies,
  getType,
  resolveAbilitiesForGeneration,
  resolveTypesForGeneration,
  slotsFor,
  versionSpriteUrl,
  getSpriteUrl,
  type Variety,
} from '../../data'
import { resolveMoveTypeNameForGeneration } from '../../data/moveEra'
import type {
  FacilityPokemon,
  FacilitySet,
  StatSpread,
  TrainerPartition,
  TrainerPokemon,
} from '../../data/trainers'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { useDexSelection, useNav } from '../nav/navContext'
import { useVersionGroup } from '../version-group/context'
import { DexPageShell, LedgerList } from './DexPageShell'
import {
  TRAINER_KIND_LABEL,
  trainerEntries,
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

const money = (n: number | null) => (n == null ? '—' : `₽${n.toLocaleString()}`)

const AI_LABEL = (flag: string) => flag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function Trainerdex() {
  const { versionGroup, isAll } = useVersionGroup()
  const vgName = versionGroup?.name ?? null
  const { state, retry } = useTrainerPartition(vgName)
  const partition = state.status === 'ready' ? state.partition : null
  const entries = useMemo(() => (partition ? trainerEntries(partition) : []), [partition])

  if (isAll || state.status === 'idle') {
    return (
      <div className="pokedex" data-testid="dex-trainerdex">
        <p className="subtitle" data-testid="trainerdex-empty">
          Trainers belong to one game. Choose a game to see its trainers.
        </p>
      </div>
    )
  }
  if (state.status === 'unavailable') {
    return (
      <div className="pokedex" data-testid="dex-trainerdex">
        <p className="subtitle" data-testid="trainerdex-empty">
          No trainer data for this game: it has no disassembly to build from.
        </p>
      </div>
    )
  }
  if (state.status === 'loading') {
    return (
      <div className="pokedex" data-testid="dex-trainerdex">
        <p className="subtitle" data-testid="trainerdex-loading">
          Loading trainers…
        </p>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="pokedex" data-testid="dex-trainerdex">
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
      list={({ entries: visible, onSelect }) => (
        <LedgerList
          testId="trainerdex-rows"
          rows={visible.map((e) => ({
            id: e.id,
            label: e.label,
            sub: <RowSub entry={e} />,
            meta: <PartyStrip entry={e} vg={vg} />,
          }))}
          onSelect={onSelect}
          emptyNote="No trainer matches those filters."
        />
      )}
      detail={({ entry, onBack }) => (
        <TrainerDetail key={entry.id} entry={entry} partition={state.partition} onBack={onBack} />
      )}
    />
  )
}

function RowSub({ entry: e }: { entry: TrainerEntry }) {
  const parts: string[] = []
  if (e.location) parts.push(e.area ? `${e.location} · ${e.area}` : e.location)
  else if (e.kind !== 'facility') parts.push('Location not found')
  if (e.variant) parts.push(e.variant)
  else if (e.kind !== 'story') parts.push(TRAINER_KIND_LABEL[e.kind])
  if (e.levels)
    parts.push(
      e.levels[0] === e.levels[1] ? `Lv ${e.levels[0]}` : `Lv ${e.levels[0]}–${e.levels[1]}`,
    )
  if (e.prize != null) parts.push(money(e.prize))
  return (
    <span data-testid={`trainerdex-row-sub-${e.id}`}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="row-sub-sep">·</span>}
          {p}
        </span>
      ))}
    </span>
  )
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

function TrainerDetail({
  entry,
  partition,
  onBack,
}: {
  entry: TrainerEntry
  partition: TrainerPartition
  onBack: () => void
}) {
  const gen = partition.generation
  const vg = partition.version_group
  const t = entry.trainer
  const ft = entry.facilityTrainer
  const f = entry.facility
  const first = t?.appearances[0]
  const byId = useMemo(() => new Map(partition.trainers.map((x) => [x.id, x])), [partition])

  return (
    <div
      className="entity-detail trainer-detail"
      data-testid="trainerdex-detail"
      data-entry-id={entry.id}
    >
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
            {first?.variant && <Fact label="Variant">{first.variant}</Fact>}
            {first?.note && <Fact label="Note">{first.note}</Fact>}
            <Fact label="Battle" testId="trainerdex-battle">
              {t.battle === 'double'
                ? 'Double battle'
                : t.battle === 'tag'
                  ? 'Tag battle'
                  : 'Single battle'}
            </Fact>
            <Fact label="Prize" testId="trainerdex-prize">
              <span className="num">{money(t.prize)}</span>
            </Fact>
            {t.items.length > 0 && (
              <Fact label="Bag items" testId="trainerdex-items">
                {t.items.map((id) => getItem(id)?.display_name ?? `#${id}`).join(', ')}
              </Fact>
            )}
            {t.ai.length > 0 && (
              <Fact label="AI" testId="trainerdex-ai">
                {t.ai.map(AI_LABEL).join(', ')}
              </Fact>
            )}
            {t.versions && (
              <Fact label="Only in">
                {t.versions.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(', ')}
              </Fact>
            )}
            {t.rematch_of && (
              <Fact label="Rematch of">
                {(() => {
                  const base = byId.get(t.rematch_of)
                  return base
                    ? `${partition.classes[base.class_id]?.name ?? ''} ${base.name ?? ''}`.trim()
                    : t.rematch_of
                })()}
              </Fact>
            )}
            {t.unused && <Fact label="Status">In the game data, never fought</Fact>}
            <Fact label="Source" testId="trainerdex-source">
              <span className="trainer-source">{t.id}</span>
            </Fact>
          </>
        )}
        {ft && f && (
          <>
            <Fact label="Facility" testId="trainerdex-facility">
              {f.name}
            </Fact>
            {ft.group && <Fact label="Where">{ft.group}</Fact>}
            {ft.note && <Fact label="Note">{ft.note}</Fact>}
            {ft.source === 'bulbapedia' && (
              <Fact label="Source">Bulbapedia (the game keeps this team in code)</Fact>
            )}
            {f.source_note && <Fact label="Data">{f.source_note}</Fact>}
          </>
        )}
      </ul>

      {f && (
        <p className="entity-detail-desc trainer-rules" data-testid="trainerdex-rules">
          {f.rules}
        </p>
      )}

      {t && t.party.length > 0 && (
        <section className="entity-detail-section" data-testid="trainerdex-party">
          <h3 className="entity-detail-section-label">
            Party <span className="entity-detail-section-count">{t.party.length}</span>
          </h3>
          <div className="trainer-party">
            {t.party.map((m, i) => (
              <MonCard key={i} mon={m} gen={gen} vg={vg} index={i} />
            ))}
          </div>
        </section>
      )}

      {ft?.party && ft.party.length > 0 && (
        <section className="entity-detail-section" data-testid="trainerdex-party">
          <h3 className="entity-detail-section-label">
            Team <span className="entity-detail-section-count">{ft.party.length}</span>
          </h3>
          <div className="trainer-party">
            {ft.party.map((m, i) => (
              <MonCard key={i} mon={m} gen={gen} vg={vg} index={i} />
            ))}
          </div>
        </section>
      )}

      {f && ft && !ft.party && (
        <SetPool facility={f} keys={ft.set_keys ?? f.sets.map((s) => s.key)} gen={gen} vg={vg} />
      )}

      {/* Bulbapedia's content is CC BY-NC-SA; the placement is theirs. */}
      <p className="trainer-credit" data-testid="trainerdex-credit">
        Parties from the pret disassembly ({partition.sources.disassembly}). Locations and order
        from{' '}
        <a href="https://bulbapedia.bulbagarden.net/" target="_blank" rel="noreferrer">
          Bulbapedia
        </a>{' '}
        (CC BY-NC-SA).
      </p>
    </div>
  )
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

function MonCard({ mon, gen, vg, index }: { mon: AnyMon; gen: number; vg: string; index: number }) {
  const [, selectSpecies] = useDexSelection('pokedex')
  const nav = useNav()
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
  const explicit = 'moves_explicit' in mon ? mon.moves_explicit : true
  const url = spriteFor(variety.pokemon_id, species.id, variety, vg)
  const name = variety.is_default
    ? species.display_name
    : `${species.display_name} (${variety.name.slice(species.name.length + 1).replace(/-/g, ' ')})`

  return (
    <div className="trainer-mon" data-testid={`trainerdex-mon-${index}`}>
      <div className="trainer-mon-head">
        {url && <img src={url} alt="" width={64} height={64} loading="lazy" />}
        <div className="trainer-mon-title">
          <button
            type="button"
            className="ghost-button trainer-mon-name"
            onClick={() => {
              selectSpecies(species.id)
              nav.setModule('pokedex')
            }}
          >
            {name}
            {gender && <span className="trainer-mon-gender">{gender === 'M' ? ' ♂' : ' ♀'}</span>}
          </button>
          <span className="trainer-mon-level num">
            {level != null ? `Lv ${level}` : 'Lv varies'}
          </span>
          <span className="trainer-mon-types">
            {types.map((ty) => (
              <TypeLabel key={ty} type={ty} small />
            ))}
          </span>
        </div>
      </div>
      <ul className="trainer-mon-facts">
        {itemName && (
          <li>
            <span>Item</span>
            {itemName}
          </li>
        )}
        {ability && (
          <li>
            <span>Ability</span>
            {ability.display_name}
          </li>
        )}
        {nature && (
          <li>
            <span>Nature</span>
            {nature.display_name}
          </li>
        )}
        {'iv' in mon && mon.iv != null && (
          <li>
            <span>IVs</span>
            <span className="num">{mon.iv} all</span>
          </li>
        )}
        {'iv_random' in mon && mon.iv_random && (
          <li>
            <span>IVs</span>
            <span>Random (the data overflows)</span>
          </li>
        )}
        {'dvs' in mon && mon.dvs && (
          <li>
            <span>DVs</span>
            <span className="num">
              {mon.dvs.attack}/{mon.dvs.defense}/{mon.dvs.speed}/{mon.dvs.special}
            </span>
          </li>
        )}
        {'ivs' in mon && mon.ivs && (
          <li>
            <span>IVs</span>
            <span className="num">{spread(mon.ivs)}</span>
          </li>
        )}
        {'evs' in mon && mon.evs && (
          <li>
            <span>EVs</span>
            <span className="num">{spread(mon.evs)}</span>
          </li>
        )}
      </ul>
      <ul className="trainer-mon-moves">
        {mon.moves.map((id) => {
          const mv = getMove(id)
          if (!mv) return null
          return (
            <li key={id}>
              <TypeLabel type={resolveMoveTypeNameForGeneration(mv, gen) ?? ''} small />
              <span>{mv.display_name}</span>
            </li>
          )
        })}
      </ul>
      {!explicit && <p className="trainer-mon-note">Moves from the level-up table</p>}
    </div>
  )
}

const SPREAD_ORDER: [keyof StatSpread, string][] = [
  ['hp', 'HP'],
  ['attack', 'Atk'],
  ['defense', 'Def'],
  ['special-attack', 'SpA'],
  ['special-defense', 'SpD'],
  ['speed', 'Spe'],
]

function spread(s: StatSpread) {
  const parts = SPREAD_ORDER.filter(([k]) => s[k] != null && s[k] !== 0).map(
    ([k, l]) => `${s[k]} ${l}`,
  )
  return parts.length ? parts.join(' · ') : '0'
}

/** A facility trainer's pool: every set it can draw from. */
function SetPool({
  facility,
  keys,
  gen,
  vg,
}: {
  facility: TrainerPartition['facilities'][number]
  keys: string[]
  gen: number
  vg: string
}) {
  const byKey = useMemo(() => new Map(facility.sets.map((s) => [s.key, s])), [facility])
  const sets = keys.map((k) => byKey.get(k)).filter((s): s is FacilitySet => s != null)
  return (
    <section className="entity-detail-section" data-testid="trainerdex-sets">
      <h3 className="entity-detail-section-label">
        Possible Pokémon <span className="entity-detail-section-count">{sets.length}</span>
      </h3>
      <div className="trainer-party">
        {sets.map((s, i) => (
          <MonCard key={s.key} mon={s} gen={gen} vg={vg} index={i} />
        ))}
      </div>
    </section>
  )
}
