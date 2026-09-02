import { getRegionForSpecies } from '../../data'
import type { Species, Variety } from '../../data'

/**
 * The species page's pinned left column, laid out to the Figma DetailPage frame
 * rather than approximated from the reference screenshot.
 *
 * WHY THIS IS NOT HeroDetailCard. That component is the design system's hero card
 * and it stays exactly as it is for the DS reference page: a --radius-card surface
 * with mini badges, a type row, a stat table and an actions row, and its own DOM
 * order (name, then types, then genus, then children). The DetailPage's left
 * column is a different composition -- a bare column, no card, no surface, and the
 * name lines come AFTER the katakana rather than before it. Bending the shared
 * card into both shapes is what produced the five punch-list items; a purpose-
 * built column is what fixes them, and it removes the genus line at the root
 * rather than passing undefined to hide it.
 *
 * EVERY POSITION IS FIGMA'S, AS A PERCENTAGE. Frame 57:730 (DetailPage-Light),
 * node container-sprite 57:837, which is 737 x 1031 raw units:
 *
 *   node            id        x    y     w    h     -> % of 737 x 1031
 *   shadow-number   57:842    0    29    701  344      0      / 2.813
 *   poke-artwork    57:843    95   213   500  500      12.890 / 20.660
 *   Region          57:840    17   604   78   313      2.307  / 58.584 (rotated)
 *   Name-kata       57:841    85   717   557  146      11.533 / 69.544
 *   Name-main       57:838    85   879   284  78       11.533 / 85.257
 *   Name-roma       57:839    369  882   305  78       50.068 / 85.548
 *
 * Percentages rather than pixels so the column IS the frame at whatever size it
 * gets, instead of matching it at one width and drifting at every other.
 *
 * THE THREE NAME LINES, corrected against the frame. The order is katakana FIRST
 * and the two Latin names BELOW it, side by side on one row -- not "main, kana,
 * roma" stacked, which is what the prose spec implied and what the previous build
 * did. Name-roma's box starts at x=369, exactly where Name-main's box ends, so
 * they are one row and not two.
 *
 * TYPE SIZES ARE MEASURED, NOT READ. get_metadata carries no type properties and
 * the Figma MCP hit its call limit before get_design_context landed, so each size
 * is inverted from the node's box width through the real advance of the real
 * self-hosted face -- scripts/calibrate-detail.mjs, the same method and the same
 * 2.23 frame scale that resolved the MainPage frames. Raw sizes, all confirmed
 * against the reference screenshot:
 *
 *   watermark  389 raw   name 66 raw   kana 111 raw   roma 66 raw   region 43 raw
 *
 * They live in pokedex.css as multiples of --hu, one raw unit of this column.
 *
 * THE WATERMARK DOES NOT BLEED HERE, and that is the fix for punch-list item 1
 * rather than a smaller font size. Figma puts shadow-number at x=0 y=29 in a 737-
 * wide column: 95% of the width, 33% of the height, LEFT-aligned, and entirely
 * inside the bounds. The design-system card's watermark genuinely does bleed off
 * the top-right, so this is a second, different treatment at the same scale --
 * which is why it is a local element here rather than a third `scale` on
 * GhostWatermark.
 */
export function SpeciesHero({
  species,
  variety,
}: {
  species: Species
  variety: Variety | undefined
}) {
  const region = getRegionForSpecies(species.id)
  const artworkUrl = variety?.sprites.official_artwork ?? null

  return (
    <div className="species-hero" data-testid="species-hero" data-dex={species.id}>
      {/* Decorative: the real number is in the banner, where it is read. */}
      <span className="species-hero-ghost" data-testid="species-hero-ghost" aria-hidden>
        {String(species.id).padStart(3, '0')}
      </span>

      {artworkUrl && (
        <img
          className="species-hero-art"
          data-testid="species-hero-art"
          src={artworkUrl}
          alt={species.display_name}
        />
      )}

      <span className="species-hero-region" data-testid="species-hero-region">
        {region ? `Region: ${region}` : 'Region: —'}
      </span>

      {species.name_ja && (
        <span
          className="species-hero-kana"
          data-testid="species-page-kana"
          lang="ja"
          /* The kana is the name in Japanese, so it is the accessible name of
             nothing -- the banner already names the species. Left readable rather
             than hidden, because it IS content here. */
        >
          {species.name_ja}
        </span>
      )}

      <p className="species-hero-names">
        {/*
          data-ds="hero-name" is kept on this element deliberately. It is the hook
          verify-search reads to confirm the global search opened the right
          species, and that assertion is about the page naming the species, not
          about which component draws it.
        */}
        <span className="species-hero-name" data-ds="hero-name" data-testid="species-hero-name">
          {species.display_name}
        </span>
        {species.name_ja_romanized && (
          <span className="species-hero-roma" data-testid="species-page-romaji">
            {species.name_ja_romanized}
          </span>
        )}
      </p>
    </div>
  )
}
