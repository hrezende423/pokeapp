import { useMemo } from 'react'
import { SPRITE_GAMES, getSpriteUrl, spriteTiles } from '../../data'
import type { Species, SpriteTile, Variety } from '../../data'

/**
 * The Sprites tab: every image the app has for this species, in one sequence.
 *
 * NO CONTROL, AND THAT IS THE CHANGE. The four-axis artwork picker
 * (source / colour / motion / gender) is gone, along with the fifth switch that
 * turned it into a filter over this grid. A picker resolves ONE image and explains
 * why the other combinations are unavailable; a catalogue shows all of them, and
 * the two answers to "what does this species look like" do not both need to be on
 * the same tab. Artwork.tsx is deleted rather than left unreferenced.
 *
 * WHAT THE PICKER'S AVAILABILITY RULES BECAME. Those rules were real facts about
 * the data, not UI behaviour, and they survive as the grid's own shape:
 *
 *   in-game gendered   94/493 species have front_female / front_shiny_female, so
 *                      those tiles exist for 94 species and not for the other 399.
 *                      Driven by the same bitmask, so no separate rule is applied
 *                      here at all -- an absent bit is an absent card.
 *   artwork gendered   0/493. official-artwork exposes only front_default and
 *                      front_shiny, so the artwork section is always two cards.
 *   animated           94/493 ship a gendered file; getSpriteUrl still owns the
 *                      whole rule including Murkrow's unsuffixed male file.
 *
 * ANIMATED SPRITES, VERIFIED RATHER THAN ASSUMED. Audited across all 493 in-scope
 * records in the api-data snapshot: PokeAPI carries an `animated` object for
 * exactly one game, generation-v/black-white, which is out of scope. Emerald and
 * Crystal animated in-game and have NO animated sprites upstream -- only static
 * slots. The one other animated source api-data exposes is
 * `sprites.other.showdown` (493 species, front/back x regular/shiny), which is
 * Pokemon Showdown's art in a single modern style rather than per-game, and is not
 * a sanctioned source in CLAUDE.md. So the animated WebPs in pokeapp-sprites
 * remain the only animated content in scope, and the section below is theirs.
 *
 * EVERY CARD IS LABELLED, which is the brief for the tab and the reason the
 * sequence keeps its per-game headings instead of collapsing into one unlabelled
 * wall: the interesting thing about a Gen 1 gray Charmander is WHICH rendering it
 * is. Each card names its slot (Front, Front - Shiny, Back - Transparent) and each
 * group names the game.
 *
 * THE PER-GAME TILES COME FROM THE BITMASK -- `spriteTiles` decodes
 * `version_sprite_slots` and builds URLs from the transcribed path table. That is
 * why the mask is precached eagerly rather than lazily fetched: an offline visit
 * has to be able to open this tab.
 *
 * IMAGES ARE lazy AND decoding=async. A fully-evolved Gen 1 species has around
 * fifty tiles here and they are all off-screen on open.
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
    getSpriteUrl encodes the whole rule (including Murkrow's unsuffixed male file),
    so the axes are enumerated here and the URL builder stays the single source of
    truth for what exists -- a null return drops the card.
  */
  const animated: { url: string; primary: string; secondary: string; testId: string }[] = []
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
        testId: `sprite-animated-${shiny ? 'shiny' : 'regular'}-${gender}`,
      })
    }
  }

  const gamesWithNone = SPRITE_GAMES.filter(
    (g) => g.generation <= 4 && !tiles.some((t) => t.game === g.game),
  )
  const totalCards = tiles.length + artwork.length + animated.length

  return (
    <div
      className="species-sprites"
      data-testid="species-sprites"
      data-tiles={tiles.length}
      data-cards={totalCards}
    >
      <p className="species-info-caption" data-testid="sprites-total">
        <span className="num">{totalCards}</span> images:{' '}
        <span className="num">{artwork.length}</span> official artwork,{' '}
        <span className="num">{animated.length}</span> animated,{' '}
        <span className="num">{tiles.length}</span> in-game across{' '}
        <span className="num">{gameGroups.length}</span> games.
      </p>

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
