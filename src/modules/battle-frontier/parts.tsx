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
import { speciesName } from './names'
import { useFrontierData } from './useFrontierData'

/* ------------------------------------------------------------------ the shell */

/**
 * Every Frontier screen: a page head and its body inside the module's ScrollArea
 * (nothing clips). Outside Gen 3 the body is the one notice and nothing loads.
 * Region names are the mockups' (`?layout=1`).
 */
export function FrontierShell({
  page,
  title,
  children,
}: {
  /** The mockup's page region: frontier-facilities, frontier-brains, frontier-sets. */
  page: 'facilities' | 'brains' | 'sets'
  title: string
  children: (data: FrontierData) => ReactNode
}) {
  const load = useFrontierData()
  return (
    <div className="bf" data-testid={`frontier-${page}`} data-status={load.status}>
      <div className="bf-scroll" data-layout="frontier-scroll">
        <ScrollArea className="bf-scroll-area" testId="frontier-scroll-area" memoryKey={scrollKey('frontier', page)}>
          <div className="bf-page" data-layout={`frontier-${page}`}>
            <header className="bf-head" data-layout="page-head">
              <h1 className="bf-title">{title}</h1>
              {load.status !== 'other-generation' && <span className="bf-scope">Emerald · Gen 3</span>}
            </header>
            {load.status === 'other-generation' && (
              <p className="bf-notice" data-layout="frontier-notice" data-testid="frontier-notice">
                Battle Frontier data covers Emerald (Gen 3).
              </p>
            )}
            {load.status === 'loading' && <p className="bf-notice">Loading the Battle Frontier…</p>}
            {load.status === 'error' && (
              <p className="bf-notice" role="alert">
                Could not load the Battle Frontier data: {load.message}.{' '}
                <button type="button" className="bf-link" onClick={load.retry}>
                  Try again
                </button>
              </p>
            )}
            {load.status === 'ready' && children(load.data)}
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
export function SpeciesLink({ id }: { id: number | null | undefined }) {
  const nav = useNav()
  if (id == null) return <span className="bf-muted">Unknown</span>
  const name = speciesName(id)
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
 * animated artwork as the fallback.
 */
export function MonSprite({ speciesId, pokemonId }: { speciesId: number | undefined; pokemonId?: number }) {
  if (speciesId == null) return <span className="bf-sprite" aria-hidden />
  const species = getSpecies(speciesId)
  const variety =
    species?.varieties.find((v) => v.pokemon_id === pokemonId) ?? species?.varieties.find((v) => v.is_default)
  const slots = variety ? slotsFor(variety, FRONTIER_VERSION_GROUP) : []
  const slot = slots.includes('front_transparent')
    ? 'front_transparent'
    : slots.includes('front_default')
      ? 'front_default'
      : null
  const url = slot ? versionSpriteUrl(pokemonId ?? speciesId, FRONTIER_VERSION_GROUP, slot) : getSpriteUrl(speciesId)
  return url ? (
    <img className="bf-sprite" src={url} alt="" width={32} height={32} loading="lazy" />
  ) : (
    <span className="bf-sprite" aria-hidden />
  )
}

/** The Pokémon cell: sprite, then the linked name. */
export function MonCell({ speciesId, pokemonId }: { speciesId: number | undefined; pokemonId?: number }) {
  return (
    <span className="bf-mon">
      <MonSprite speciesId={speciesId} pokemonId={pokemonId} />
      <SpeciesLink id={speciesId} />
    </span>
  )
}
