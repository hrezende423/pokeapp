import { useMemo } from 'react'
import { SPRITE_GAMES, getSpriteUrl, spriteTiles } from '../../data'
import type { Species, SpriteTile, Variety } from '../../data'

/**
 * The Sprites tab: every static image PokeAPI has for this species, labelled, plus
 * the animated artwork from pokeapp-sprites.
 *
 * THE PER-GAME TILES COME FROM THE BITMASK added in e15b347 -- `spriteTiles`
 * decodes `version_sprite_slots` and builds the URLs from the transcribed path
 * table. That is what makes this tab possible without a 16,204-URL manifest, and
 * why the mask is precached eagerly rather than lazily fetched: an offline visit
 * has to be able to open this tab.
 *
 * EVERY CARD IS LABELLED, which is the whole brief for this tab. An unlabelled
 * wall of thumbnails is unreadable precisely because the interesting thing about a
 * Gen 1 gray Charmander is WHICH rendering it is. Each card names the slot (Front ·
 * Shiny, Back · Transparent, ...) and each group names the game.
 *
 * THREE SOURCES, IN DECREASING FAMILIARITY:
 *
 *   Artwork    the official Sugimori artwork, regular and shiny. Not gendered --
 *              audited across all 508 varieties, `official-artwork` exposes only
 *              front_default and front_shiny.
 *   Animated   the pokeapp-sprites release assets. Gendered for the 94 species
 *              that have a gender difference, including Murkrow's naming exception,
 *              which getSpriteUrl already handles.
 *   In-game    the per-game tiles, newest game first.
 *
 * IMAGES ARE lazy AND decoding=async. A fully-evolved Gen 1 species has around
 * fifty tiles here and they are all off-screen on open; loading them eagerly would
 * make opening the tab a fifty-request burst.
 */

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

export function SpeciesSpritesTab({ species, variety }: { species: Species; variety: Variety }) {
  const tiles = useMemo(() => spriteTiles(species), [species])
  const gameGroups = useMemo(() => groupByGame(tiles), [tiles])

  const artwork = [
    { url: variety.sprites.official_artwork, label: 'Regular' },
    { url: variety.sprites.official_artwork_shiny, label: 'Shiny' },
  ].filter((a): a is { url: string; label: string } => a.url != null)

  /*
    The animated set: two colours, times the genders that actually have a file.
    availableSpriteGenders would give the gender list, but getSpriteUrl already
    encodes the whole rule (including Murkrow), so the axes are built here and the
    URL builder stays the single source of truth for what exists.
  */
  const animated: { url: string; primary: string; secondary: string }[] = []
  for (const shiny of [false, true]) {
    const genders: ('male' | 'female')[] = species.has_gender_differences
      ? ['male', 'female']
      : ['male']
    for (const gender of genders) {
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
      })
    }
  }

  const gamesWithNone = SPRITE_GAMES.filter(
    (g) => g.generation <= 4 && !gameGroups.some((group) => group.game === g.game),
  )

  return (
    <div className="species-sprites" data-testid="species-sprites" data-tiles={tiles.length}>
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
              testId={`sprite-animated-${a.primary.toLowerCase()}-${a.secondary.includes('Female') ? 'female' : 'male'}`}
            />
          ))}
        </ul>
      </section>

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

      {/* Named rather than silently absent: a Gen 4 species genuinely has no Gen 1
          sprite, and saying which games have none is the honest version of an
          empty section. */}
      {gamesWithNone.length > 0 && (
        <p className="species-info-caption" data-testid="sprites-missing-games">
          No sprites in {gamesWithNone.map((g) => g.label).join(', ')}.
        </p>
      )}
    </div>
  )
}
