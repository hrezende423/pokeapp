import { useMemo } from 'react'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import { SPRITE_GAMES, artworkMode, getSpriteUrl, spriteTiles } from '../../data'
import type { ArtworkView, Species, SpriteTile, Variety } from '../../data'
import { Artwork } from './Artwork'

/**
 * The Sprites tab: every image the app has for this species, plus the four-axis
 * artwork control that used to live on the old detail page.
 *
 * WHY THE CONTROL IS HERE. The old page's left panel resolved ONE image from four
 * axes (source, colour, motion, gender), each checked against what actually exists
 * for that species. This tab is the catalogue of all of them. Folding the control
 * in rather than dropping it keeps the thing it was uniquely good at -- seeing one
 * exact combination large, with the unavailable combinations explained rather than
 * silently substituted -- and gives the catalogue a filter. Artwork.tsx is reused
 * unchanged, so the availability logic and its four switches are the same code
 * that was verified before, not a reimplementation.
 *
 * THE FILTER IS OPT-IN, and that is the load-bearing detail. Applying the four
 * axes to the grid unconditionally would mean the default view (artwork, regular,
 * static, male) hides every in-game sprite -- the tab would open on two cards. So
 * the axes narrow the grid only while the fifth switch is on, and off is the
 * default: the tab opens as the full catalogue and becomes a filter when asked.
 *
 * All four axes narrow, not two, so the switch means one thing:
 *   source in-game       -> the per-game sections only
 *   source artwork       -> the official artwork or the animated set, per motion
 *   colour, gender       -> within whatever is left
 *
 * THE COLOUR AXIS ALSO DRIVES THE EVOLUTION CHART on the Info tab, which is why
 * the view state is owned by SpeciesDetailPage rather than by this tab: a shiny
 * selection here shows a shiny chain there, exactly as it did on the old page.
 *
 * THE PER-GAME TILES COME FROM THE BITMASK added in e15b347 -- `spriteTiles`
 * decodes `version_sprite_slots` and builds the URLs from the transcribed path
 * table. That is what makes this tab possible without a 16,204-URL manifest, and
 * why the mask is precached eagerly rather than lazily fetched: an offline visit
 * has to be able to open this tab.
 *
 * EVERY CARD IS LABELLED, which is the whole brief for the tab. An unlabelled wall
 * of thumbnails is unreadable precisely because the interesting thing about a Gen
 * 1 gray Charmander is WHICH rendering it is. Each card names the slot (Front ·
 * Shiny, Back · Transparent, ...) and each group names the game.
 *
 * IMAGES ARE lazy AND decoding=async. A fully-evolved Gen 1 species has around
 * fifty tiles here and they are all off-screen on open; loading them eagerly would
 * make opening the tab a fifty-request burst.
 */

const FILTER_HINT = 'Narrow the grid below to the source, colour, motion and gender selected above.'

/** What a card is, for the filter. The three sources are mutually exclusive. */
type CardKind = 'game' | 'artwork' | 'animated'

interface CardFacts {
  kind: CardKind
  shiny: boolean
  female: boolean
}

/**
 * Whether a card survives the current filter.
 *
 * Gray and transparent game tiles are neither shiny nor gendered, so they count as
 * regular/male -- which is right: they are alternate RENDERINGS of the regular
 * sprite, not a fourth colour.
 */
function matchesView(view: ArtworkView, facts: CardFacts): boolean {
  const mode = artworkMode(view)
  const wantKind: CardKind =
    mode === 'in-game-static' ? 'game' : mode === 'artwork-animated' ? 'animated' : 'artwork'
  if (facts.kind !== wantKind) return false
  if (facts.shiny !== view.shiny) return false
  return facts.female === (view.gender === 'female')
}

interface SpriteCardProps {
  url: string
  primary: string
  secondary: string
  alt: string
  testId: string
  /** Pixel art is nearest-neighbour; the artwork and animations are not. */
  pixelated?: boolean
}

function SpriteCard({ url, primary, secondary, alt, testId, pixelated }: SpriteCardProps) {
  return (
    <li className="sprite-card" data-testid={testId}>
      <span className="sprite-card-frame">
        <img
          className={pixelated ? 'sprite-card-img is-pixelated' : 'sprite-card-img'}
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
        />
      </span>
      <span className="sprite-card-primary">{primary}</span>
      <span className="sprite-card-secondary">{secondary}</span>
    </li>
  )
}

/** Tiles grouped by game, keeping spriteTiles' newest-first game order. */
function groupByGame(tiles: SpriteTile[]) {
  const groups: { game: string; gameLabel: string; generation: number; tiles: SpriteTile[] }[] = []
  for (const tile of tiles) {
    const last = groups[groups.length - 1]
    if (last && last.game === tile.game) last.tiles.push(tile)
    else
      groups.push({
        game: tile.game,
        gameLabel: tile.gameLabel,
        generation: tile.generation,
        tiles: [tile],
      })
  }
  return groups
}

export function SpeciesSpritesTab({
  species,
  variety,
  view,
  onViewChange,
  matchGrid,
  onMatchGridChange,
}: {
  species: Species
  variety: Variety
  /** Owned by the page: the colour axis also drives the Info tab's chain. */
  view: ArtworkView
  onViewChange: (next: ArtworkView) => void
  /** Whether the four axes are narrowing the grid. */
  matchGrid: boolean
  onMatchGridChange: (next: boolean) => void
}) {
  const allTiles = useMemo(() => spriteTiles(species), [species])

  const tiles = matchGrid
    ? allTiles.filter((t) =>
        matchesView(view, {
          kind: 'game',
          shiny: t.slot.includes('_shiny'),
          female: t.slot.endsWith('_female'),
        }),
      )
    : allTiles
  const gameGroups = useMemo(() => groupByGame(tiles), [tiles])

  const artwork = [
    { url: variety.sprites.official_artwork, label: 'Regular', shiny: false },
    { url: variety.sprites.official_artwork_shiny, label: 'Shiny', shiny: true },
  ]
    .filter((a): a is { url: string; label: string; shiny: boolean } => a.url != null)
    .filter(
      (a) => !matchGrid || matchesView(view, { kind: 'artwork', shiny: a.shiny, female: false }),
    )

  /*
    The animated set: two colours, times the genders that actually have a file.
    availableSpriteGenders would give the gender list, but getSpriteUrl already
    encodes the whole rule (including Murkrow's unsuffixed male file), so the axes
    are built here and the URL builder stays the single source of truth for what
    exists.
  */
  const animated: { url: string; primary: string; secondary: string; testId: string }[] = []
  for (const shiny of [false, true]) {
    const genders: ('male' | 'female')[] = species.has_gender_differences
      ? ['male', 'female']
      : ['male']
    for (const gender of genders) {
      if (
        matchGrid &&
        !matchesView(view, { kind: 'animated', shiny, female: gender === 'female' })
      ) {
        continue
      }
      const url = getSpriteUrl(species.id, {
        shiny,
        gender,
        hasGenderDifference: species.has_gender_differences,
      })
      if (!url) continue
      animated.push({
        url,
        primary: shiny ? 'Shiny' : 'Regular',
        secondary: species.has_gender_differences
          ? `Animated · ${gender === 'female' ? 'Female' : 'Male'}`
          : 'Animated',
        testId: `sprite-animated-${shiny ? 'shiny' : 'regular'}-${gender}`,
      })
    }
  }

  const gamesWithNone = SPRITE_GAMES.filter(
    (g) => g.generation <= 4 && !allTiles.some((t) => t.game === g.game),
  )
  const shownCards = tiles.length + artwork.length + animated.length

  return (
    <div
      className="species-sprites"
      data-testid="species-sprites"
      data-tiles={tiles.length}
      data-all-tiles={allTiles.length}
      data-filtered={matchGrid}
    >
      {/*
        THE FOLDED CONTROL. Artwork.tsx renders the resolved image and its four
        switches; the fifth switch beside them is what turns the same four axes
        into a filter over everything below.
      */}
      <section className="species-info-block" data-testid="sprites-featured">
        <h3 className="species-info-heading">Selected sprite</h3>
        <div className="sprites-featured">
          <Artwork species={species} variety={variety} view={view} onChange={onViewChange} />
          <div className="sprites-featured-filter">
            <ToggleSwitch
              id="grid-filter"
              label="Grid"
              offLabel="All sprites"
              onLabel="Match above"
              checked={matchGrid}
              onChange={onMatchGridChange}
            />
            <p className="species-info-caption">{FILTER_HINT}</p>
            {matchGrid && (
              <p className="species-info-caption" data-testid="sprites-filter-count">
                Showing <span className="num">{shownCards}</span> of{' '}
                <span className="num">{allTiles.length + 2}</span> images.
              </p>
            )}
          </div>
        </div>
      </section>

      {artwork.length > 0 && (
        <section className="species-info-block" data-testid="sprites-artwork">
          <h3 className="species-info-heading">
            Official artwork
            <span className="species-info-count num">{artwork.length}</span>
          </h3>
          <ul className="sprite-grid">
            {artwork.map((a) => (
              <SpriteCard
                key={a.label}
                url={a.url}
                primary={a.label}
                secondary="Sugimori artwork"
                alt={`${species.display_name} official artwork, ${a.label.toLowerCase()}`}
                testId={`sprite-artwork-${a.label.toLowerCase()}`}
              />
            ))}
          </ul>
        </section>
      )}

      {animated.length > 0 && (
        <section className="species-info-block" data-testid="sprites-animated">
          <h3 className="species-info-heading">
            Animated
            <span className="species-info-count num">{animated.length}</span>
          </h3>
          <ul className="sprite-grid">
            {animated.map((a) => (
              <SpriteCard
                key={a.url}
                url={a.url}
                primary={a.primary}
                secondary={a.secondary}
                alt={`${species.display_name} animated sprite, ${a.primary.toLowerCase()}`}
                testId={a.testId}
              />
            ))}
          </ul>
        </section>
      )}

      {gameGroups.map((group) => (
        <section
          key={group.game}
          className="species-info-block"
          data-testid={`sprites-game-${group.game}`}
          data-generation={group.generation}
        >
          <h3 className="species-info-heading">
            {group.gameLabel}
            <span className="species-info-count num">{group.tiles.length}</span>
          </h3>
          <ul className="sprite-grid">
            {group.tiles.map((tile) => (
              <SpriteCard
                key={tile.slot}
                url={tile.url}
                primary={tile.slotLabel}
                secondary={group.gameLabel}
                alt={`${species.display_name} in ${group.gameLabel}, ${tile.slotLabel}`}
                testId={`sprite-tile-${group.game}-${tile.slot}`}
                pixelated
              />
            ))}
          </ul>
        </section>
      ))}

      {/* A filter that matches nothing says so, rather than ending the page on the
          last section that happened to survive. */}
      {matchGrid && shownCards === 0 && (
        <p className="species-info-caption" data-testid="sprites-filter-empty">
          No image matches that combination for {species.display_name}.
        </p>
      )}

      {/* Named rather than silently absent: a Gen 4 species genuinely has no Gen 1
          sprite, and saying which games have none is the honest version of an
          empty section. Read from the unfiltered set, so it does not start listing
          games the filter removed. */}
      {gamesWithNone.length > 0 && (
        <p className="species-info-caption" data-testid="sprites-missing-games">
          No sprites in {gamesWithNone.map((g) => g.label).join(', ')}.
        </p>
      )}
    </div>
  )
}
