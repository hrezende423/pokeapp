import { Fragment, type ReactNode } from 'react'
import { ScrollArea } from '../../components/ScrollArea'
import { scrollKey } from '../../components/scrollMemory'
import { getSpecies, getSpriteUrl, slotsFor, versionSpriteUrl } from '../../data'
import type { StatSpread } from '../../data/trainers'
import { deepLink } from '../../lib/entities'
import { followLink } from '../../lib/entities/appContext'
import { useNav } from '../nav/navContext'
import { FRONTIER_VERSION_GROUP, type BrainAppearance, type FrontierBrain, type FrontierData } from './data'
import { fmt, STATS } from './format'
import { speciesName, speciesNameIn } from './names'
import { GameRow } from '../version-group/GameRow'
import type { GameInGeneration } from '../version-group/gameInGeneration'
import { GAME_SCOPE, gameNotice, generationNotice, isFrontierGame, type FrontierGame } from './reference/games'
import { useFrontierGame } from './useFrontierGame'
import { useFrontierData, type FrontierLoad } from './useFrontierData'

/* ------------------------------------------------------------------ the shell */

/** The game row, in its own region; nothing at all when there is no choice to make. */
export function FrontierGameRow({ scope, outside = false }: { scope: GameInGeneration; outside?: boolean }) {
  if (scope.games.length < 2) return null
  return (
    <div className={outside ? 'bf-game bf-game-out' : 'bf-game'} data-layout="frontier-game">
      <GameRow scope={scope} testId="frontier-game-row" />
    </div>
  )
}

export type ShellStatus = FrontierLoad['status'] | 'not-in-game'

/**
 * The notice for a page with nothing to show: the generation's ("No Battle
 * Frontier in Gen 2") or the game's ("FireRed and LeafGreen have no Battle
 * Frontier, so no Brains"). Never a blank page.
 */
export function FrontierNotice({
  game,
  generation,
  screen,
  gameText,
}: {
  game: string | null
  generation: number | null
  screen: string
  /** A screen's own wording for a game it has nothing for; default `gameNotice`. */
  gameText?: (game: string) => string
}) {
  return (
    <p className="bf-notice" data-layout="frontier-notice" data-testid="frontier-notice">
      {game ? (gameText ? gameText(game) : gameNotice(game, screen)) : generationNotice(generation)}
    </p>
  )
}

/**
 * Every Frontier screen: a page head, the game row, and the body inside the
 * module's ScrollArea (nothing clips). Emerald's body is `children` (the
 * Frontier loader, which loads only then); another game's is `other`, and a
 * game `other` has nothing for gets the notice. Region names are the mockups'
 * (`?layout=1`).
 */
export function FrontierShell({
  page,
  title,
  children,
  other,
  anyGame,
  gameText,
}: {
  /** The mockup's page region: frontier-facilities, frontier-brains, frontier-sets; frontier-speed (Trainer Hill & Tower). */
  page: 'facilities' | 'brains' | 'sets' | 'speed'
  title: string
  children?: (data: FrontierData) => ReactNode
  /** A non-Emerald game's body; null (or absent) = the "not in this game" notice. */
  other?: (game: FrontierGame) => ReactNode
  /**
   * A body for EVERY game, Emerald included, that never needs the Frontier
   * loader (Trainer Hill & Tower). Given, it stands in for `children` and
   * `other`, and the loader is never called; null = the notice.
   */
  anyGame?: (game: FrontierGame) => ReactNode
  /** The notice's wording for a game with nothing here (FrontierNotice). */
  gameText?: (game: string) => string
}) {
  const { scope, game, generation } = useFrontierGame()
  /* The Emerald loader's branch: never on a page that draws every game itself. */
  const emerald = game === 'emerald' && !anyGame
  const load = useFrontierData(emerald)
  const body = anyGame ?? (game !== 'emerald' ? other : undefined)
  const otherBody = !emerald && isFrontierGame(game) && body ? body(game) : null
  const status: ShellStatus =
    game == null ? 'other-generation' : emerald ? load.status : otherBody != null ? 'ready' : 'not-in-game'
  const scopeTag = status === 'other-generation' || status === 'not-in-game' || !isFrontierGame(game) ? null : GAME_SCOPE[game]
  return (
    <div className="bf" data-testid={`frontier-${page}`} data-status={status} data-game={game ?? undefined}>
      <div className="bf-scroll" data-layout="frontier-scroll">
        <ScrollArea className="bf-scroll-area" testId="frontier-scroll-area" memoryKey={scrollKey('frontier', page)}>
          <div className="bf-page" data-layout={`frontier-${page}`}>
            <FrontierGameRow scope={scope} />
            <header className="bf-head" data-layout="page-head">
              <h1 className="bf-title">{title}</h1>
              {scopeTag && <span className="bf-scope">{scopeTag}</span>}
            </header>
            {(status === 'other-generation' || status === 'not-in-game') && (
              <FrontierNotice game={game} generation={generation} screen={title} gameText={gameText} />
            )}
            {!emerald && otherBody}
            {emerald && load.status === 'loading' && <p className="bf-notice">Loading the Battle Frontier…</p>}
            {emerald && load.status === 'error' && (
              <p className="bf-notice" role="alert">
                Could not load the Battle Frontier data: {load.message}.{' '}
                <button type="button" className="bf-link" onClick={load.retry}>
                  Try again
                </button>
              </p>
            )}
            {emerald && load.status === 'ready' && children?.(load.data)}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ text parts */

/** A number as the mockups print it: mono, en-US grouping. */
export const Num = ({ n }: { n: number }) => <span className="bf-mono">{fmt(n)}</span>

/** "140–199", or "#267–#371" with the hash. */
export const Range = ({ from, to, hash = '' }: { from: number; to: number; hash?: string }) => (
  <span className="bf-nw">
    {hash}
    <Num n={from} />–{hash}
    <Num n={to} />
  </span>
)

export const Muted = ({ children }: { children: ReactNode }) => <span className="bf-muted">{children}</span>

/** Children joined by a separator (a node, so a muted middot can be one). */
export function Joined({ items, sep }: { items: ReactNode[]; sep: ReactNode }) {
  return (
    <>
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && sep}
          {item}
        </Fragment>
      ))}
    </>
  )
}

/** EVs in game order: mono digits, muted stat labels. */
export function Evs({ evs }: { evs: StatSpread | null | undefined }) {
  const parts = STATS.filter(([k]) => evs?.[k])
  if (!parts.length) return <>—</>
  return (
    <Joined
      sep=" / "
      items={parts.map(([k, l]) => (
        <span key={k} className="bf-nw">
          <Num n={evs?.[k] ?? 0} /> <Muted>{l}</Muted>
        </span>
      ))}
    />
  )
}

/** Where a Brain appears, as the facility counts it. */
export function Appearance({ a }: { a: BrainAppearance }) {
  if (a.unit === 'tournament')
    return (
      <>
        tournament <Num n={a.unitNumber} /> final (battle <Num n={a.battle} />)
      </>
    )
  if (a.unit === 'room')
    return (
      <>
        room <Num n={a.battle} />
      </>
    )
  if (a.unit === 'floor')
    return (
      <>
        the top, after floor <Num n={a.battle} />
      </>
    )
  return (
    <>
      battle <Num n={a.battle} />
    </>
  )
}

export function Repeat({ b }: { b: FrontierBrain }) {
  return b.silver.unit === 'tournament' ? (
    <>
      every <Num n={b.streak.repeat} /> tournaments after
    </>
  ) : (
    <>
      every <Num n={b.streak.repeat} /> {b.silver.unit}s after
    </>
  )
}

/** Key-value rows: the hairline is the row's, no row gap (hairline-band rule). */
export function Kv({ rows, layout }: { rows: [string, ReactNode][]; layout?: string }) {
  return (
    <dl className="bf-kv" data-layout={layout}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ------------------------------------------------------------------ species */

/**
 * A species name that opens its page in the Pokédex, through the entity-link
 * engine (deepLink + followLink). A label you can click, not a button shape: no
 * line at rest, a hairline on hover.
 */
export function SpeciesLink({ id, generation }: { id: number | null | undefined; generation?: number }) {
  const nav = useNav()
  if (id == null) return <span className="bf-muted">Unknown</span>
  const name = generation == null ? speciesName(id) : speciesNameIn(id, generation)
  const target = deepLink({ kind: 'species', id })
  return (
    <button
      type="button"
      className="bf-link"
      title={`Opens ${name} in the Pokédex`}
      data-species-id={id}
      onClick={() => target && followLink(target, nav)}
    >
      {name}
    </button>
  )
}

/**
 * The Emerald sprite, 32px, the way the Trainer Dex draws a party: the game's own
 * front sprite from the sprites repo (runtime-cached, never precached), the
 * animated artwork as the fallback. `versionGroup` draws another game's sprite
 * (FireRed/LeafGreen's Trainer Tower); default Emerald.
 */
export function MonSprite({
  speciesId,
  pokemonId,
  versionGroup = FRONTIER_VERSION_GROUP,
}: {
  speciesId: number | undefined
  pokemonId?: number
  versionGroup?: string
}) {
  if (speciesId == null) return <span className="bf-sprite" aria-hidden />
  const species = getSpecies(speciesId)
  const variety =
    species?.varieties.find((v) => v.pokemon_id === pokemonId) ?? species?.varieties.find((v) => v.is_default)
  const slots = variety ? slotsFor(variety, versionGroup) : []
  const slot = slots.includes('front_transparent')
    ? 'front_transparent'
    : slots.includes('front_default')
      ? 'front_default'
      : null
  const url = slot ? versionSpriteUrl(pokemonId ?? speciesId, versionGroup, slot) : getSpriteUrl(speciesId)
  return url ? (
    <img className="bf-sprite" src={url} alt="" width={32} height={32} loading="lazy" />
  ) : (
    <span className="bf-sprite" aria-hidden />
  )
}

/** The Pokémon cell: sprite, then the linked name. */
export function MonCell({
  speciesId,
  pokemonId,
  versionGroup,
}: {
  speciesId: number | undefined
  pokemonId?: number
  versionGroup?: string
}) {
  return (
    <span className="bf-mon">
      <MonSprite speciesId={speciesId} pokemonId={pokemonId} versionGroup={versionGroup} />
      <SpeciesLink id={speciesId} />
    </span>
  )
}
