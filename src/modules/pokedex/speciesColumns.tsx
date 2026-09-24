import { TypeLabel } from '../../components/ds/TypeLabel'
import type { Column } from '../../components/DataTable'
import {
  EFFORT_VALUES_INTRODUCED_IN_GENERATION,
  genderRatio,
  getEggGroup,
  getItem,
  getType,
  resolveAbilitiesForGeneration,
} from '../../data'
import type { VersionGroup } from '../../data'
import { evolutionFacts } from './evoDescribe'
import { statFieldsFor, type SpeciesRow } from './speciesQuery'

/**
 * The Pokedex list view's columns: every field the bundle carries about a
 * species, in one very wide table.
 *
 * WHY A SEPARATE DECLARATION FROM THE SORT FIELDS. They were the same list for
 * one pass -- the table's columns WERE the four things the grid could sort by --
 * and that stopped being true the moment the table grew past what a card can
 * print. The grid's Sort menu offers what a card shows; this table offers
 * everything, sorted from its own headers. See speciesQuery.ts.
 *
 * ONE FACT PER COLUMN, NEVER A JOINED LIST. Types, abilities, egg groups and the
 * EV yield were each one cell holding a middot-separated run, and that is not a
 * column: it cannot be sorted on ("Grass/Poison" sorts under G, away from every
 * other Poison), it cannot be scanned down, and a species with one type and one
 * with two are different shapes in the same cell. They are split to the slots the
 * games themselves have -- two types, two abilities and a hidden one, two egg
 * groups, one EV yield per stat -- so every cell holds a single value or a dash.
 *
 * NO ENTRY-NUMBER COLUMNS. "Nat #" and "Reg #" led this table and are gone, with
 * every other printed entry number in the dexes -- the number is still what the
 * list is ORDERED by (the Sort menu's "Dex #") and still printed beside a global
 * search hit, which is the one place it answers a question. As a column it was
 * two cells of ordinal that nobody reads across 493 rows.
 *
 * THE IDENTITY BLOCK FITS THE WINDOW, deliberately and by measurement: Name
 * through Speed, which is the block that answers "what is this and how good is
 * it". Splitting the joined cells made that block thirteen columns; the widths
 * below are sized so it still lands inside a normal window, and
 * verify-dex-filters measures it rather than trusting it. Everything after Speed
 * is over the horizontal scroll, which the list view draws a bar for.
 *
 * EVERY WIDTH IS MEASURED, not chosen. Each one is the larger of what its HEADER
 * needs (the label at --font-size-caption, uppercase, plus the 4px gap and the
 * sort arrow it has to hold when active) and what its WIDEST CELL needs, plus the
 * cell padding and 2px of air -- so a column is as wide as the thing in it and no
 * wider. Two are deliberate CLAMPS rather than fits: "Held items" and "Evolves
 * to" have cells of 208px and 1347px, and one Eevee would otherwise set the width
 * of all 493 rows, so those two ellipsize and the detail page carries the rest.
 *
 * ERA CORRECTNESS runs through the same resolvers as everywhere else: abilities
 * do not exist before Generation 3 and neither does the EV yield, egg groups
 * arrive in Generation 2, and Gen 1's combined Special replaces the split pair
 * (so Gen 1 has one stat column fewer, not a blank one).
 */

const DASH = '—'

const titleCase = (value: string | null | undefined) =>
  value ? value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : DASH

/** A yes/no field, printed as a word rather than a tick nobody can sort. */
const flag = (on: boolean) => (on ? 'Yes' : 'No')

/**
 * The gender split as the games state it: eighths female, or genderless.
 *
 * `genderRatio` is the same helper the species page's bar uses, so the two
 * cannot disagree about Nidoran.
 */
function genderLabel(genderRate: number | null): string {
  const ratio = genderRatio(genderRate)
  if (!ratio) return 'Genderless'
  if (ratio.female === 0) return '100% ♂'
  if (ratio.female === 100) return '100% ♀'
  return `${100 - ratio.female}% ♂ / ${ratio.female}% ♀`
}

/**
 * Wild held items for the selected game, with their rarity.
 *
 * Rarity is per VERSION, not per version group -- 21 entries differ between the
 * two halves of a pair -- so the versions are filtered to the selected game and
 * the distinct rarities joined. Under "All games" every in-scope entry is shown,
 * since there is no one game to scope to.
 */
function heldItemsLabel(row: SpeciesRow, versions: string[]): string {
  const parts: string[] = []
  for (const held of row.variety.held_items) {
    const inScope = held.versions.filter(
      (v) => versions.length === 0 || (v.version != null && versions.includes(v.version)),
    )
    if (inScope.length === 0) continue
    const rarities = [...new Set(inScope.map((v) => v.rarity))].sort((a, b) => b - a)
    const name = getItem(held.item_id)?.display_name ?? `#${held.item_id}`
    parts.push(`${name} ${rarities.join('/')}%`)
  }
  return parts.length > 0 ? parts.join(' · ') : DASH
}

export interface SpeciesColumnScope {
  generation: number
  versionGroup: VersionGroup | null
}

export function speciesColumns({
  generation,
  versionGroup,
}: SpeciesColumnScope): Column<SpeciesRow>[] {
  const versions = (versionGroup?.versions ?? []).filter((v): v is string => v != null)

  const statFields = statFieldsFor(generation)

  const statColumns: Column<SpeciesRow>[] = statFields.map((stat) => ({
    key: `stat-${stat.key}`,
    label: stat.label,
    width: STAT_WIDTHS[stat.key] ?? '3.9rem',
    numeric: true,
    sortValue: (row) => row.stats[stat.key] ?? null,
    render: (row) => <span className="num">{row.stats[stat.key] ?? DASH}</span>,
  }))

  const evColumns: Column<SpeciesRow>[] =
    generation < EFFORT_VALUES_INTRODUCED_IN_GENERATION
      ? []
      : statFields.map((stat) => ({
          key: `ev-${stat.key}`,
          label: `${EV_LABELS[stat.key] ?? stat.label} EVY`,
          width: EV_WIDTHS[stat.key] ?? '3.7rem',
          numeric: true,
          sortValue: (row) => row.evs[stat.key] ?? 0,
          render: (row) => <span className="num">{row.evs[stat.key] ?? 0}</span>,
        }))

  return [
    {
      key: 'name',
      label: 'Name',
      width: '4.05rem',
      sortValue: (row) => row.species.display_name,
      render: (row) => row.species.display_name,
    },
    /*
      TWO TYPE COLUMNS, NOT ONE. A single cell reading "Grass/Poison" sorts under
      G, so every dual-type Poison lands nowhere near the pure ones -- and the
      second slot is a real, separate fact the games track (it is what an
      attacker's second multiplier comes from). Type 2 is a dash where there is
      none rather than an empty cell, so "no second type" and "nothing loaded"
      cannot look the same.
    */
    {
      key: 'type1',
      label: 'Type 1',
      width: '3.5rem',
      sortValue: (row) => typeName(row, 0),
      render: (row) => typeCell(row, 0),
    },
    {
      key: 'type2',
      label: 'Type 2',
      width: '3.5rem',
      sortValue: (row) => typeName(row, 1),
      render: (row) => typeCell(row, 1),
    },
    /*
      THE TWO ORDINARY SLOTS AND THE HIDDEN ONE, separately -- the hidden slot is
      not a third ability, it is a different mechanic, and joining it into one run
      with an "(H)" suffix made that a matter of spotting a marker. In Gen 1-4
      scope every hidden cell is a dash by construction (hidden abilities arrive
      in Gen 5, and `resolveAbilitiesForGeneration` returns nothing at all before
      Gen 3); the column is present so the table's shape does not change under a
      later generation, and it prints a dash rather than an empty cell.
    */
    {
      key: 'ability1',
      label: 'Ability 1',
      width: '5.15rem',
      sortValue: (row) => abilitySlot(row, generation, 1),
      render: (row) => abilitySlot(row, generation, 1) ?? DASH,
    },
    {
      key: 'ability2',
      label: 'Ability 2',
      width: '5.15rem',
      sortValue: (row) => abilitySlot(row, generation, 2),
      render: (row) => abilitySlot(row, generation, 2) ?? DASH,
    },
    {
      key: 'abilityHidden',
      label: 'Hidden ability',
      width: '6.1rem',
      sortValue: (row) => hiddenAbility(row, generation),
      render: (row) => hiddenAbility(row, generation) ?? DASH,
    },
    {
      key: 'bst',
      label: 'BST',
      width: '2.3rem',
      numeric: true,
      sortValue: (row) => row.bst,
      render: (row) => <span className="num">{row.bst}</span>,
    },
    ...statColumns,
    {
      key: 'eggGroup1',
      label: 'Egg group 1',
      width: '5.15rem',
      sortValue: (row) => eggGroupNames(row)[0] ?? null,
      render: (row) => eggGroupNames(row)[0] ?? DASH,
    },
    {
      key: 'eggGroup2',
      label: 'Egg group 2',
      width: '5.15rem',
      sortValue: (row) => eggGroupNames(row)[1] ?? null,
      render: (row) => eggGroupNames(row)[1] ?? DASH,
    },
    /*
      ONE EV YIELD COLUMN PER STAT, and they follow the SAME era rule as the base
      stats beside them -- so Gen 1 would get a single "Spc EVY" and Gen 2-4 the
      split pair, and the two blocks can never disagree about how many stats an
      era has. The whole block is absent before Generation 3, where effort values
      do not exist: `row.evs` is empty there and six columns of dashes is noise
      rather than a fact. A stat that yields nothing prints 0, not a dash --
      zero IS the yield, and it is what you sort against.
    */
    ...evColumns,
    {
      key: 'height',
      label: 'Height',
      width: '3.45rem',
      numeric: true,
      sortValue: (row) => row.height,
      render: (row) => (
        <span className="num">
          {row.height != null ? (row.height / 10).toFixed(1) : DASH}
          <span className="move-unit">m</span>
        </span>
      ),
    },
    {
      key: 'weight',
      label: 'Weight',
      width: '3.6rem',
      numeric: true,
      sortValue: (row) => row.weight,
      render: (row) => (
        <span className="num">
          {row.weight != null ? (row.weight / 10).toFixed(1) : DASH}
          <span className="move-unit">kg</span>
        </span>
      ),
    },
    {
      key: 'catchRate',
      label: 'Catch rate',
      width: '4.75rem',
      numeric: true,
      sortValue: (row) => row.species.capture_rate,
      render: (row) => <span className="num">{row.species.capture_rate ?? DASH}</span>,
    },
    {
      key: 'friendship',
      label: 'Friendship',
      width: '4.9rem',
      numeric: true,
      sortValue: (row) => row.species.base_happiness,
      render: (row) => <span className="num">{row.species.base_happiness ?? DASH}</span>,
    },
    {
      key: 'baseExp',
      label: 'Base EXP',
      width: '4.05rem',
      numeric: true,
      sortValue: (row) => row.variety.base_experience,
      render: (row) => <span className="num">{row.variety.base_experience ?? DASH}</span>,
    },
    {
      key: 'gender',
      label: 'Gender ratio',
      width: '6.15rem',
      // Sorted by the underlying eighths, so the column reads as a scale rather
      // than alphabetically by the label that describes it.
      sortValue: (row) => row.species.gender_rate ?? -1,
      render: (row) => genderLabel(row.species.gender_rate),
    },
    {
      key: 'growth',
      label: 'Growth rate',
      width: '6.3rem',
      sortValue: (row) => row.species.growth_rate,
      render: (row) => titleCase(row.species.growth_rate),
    },
    {
      key: 'eggCycles',
      label: 'Egg cycles',
      width: '4.8rem',
      numeric: true,
      sortValue: (row) => row.species.hatch_counter,
      render: (row) => <span className="num">{row.species.hatch_counter ?? DASH}</span>,
    },
    {
      key: 'color',
      label: 'Colour',
      width: '3.55rem',
      sortValue: (row) => row.species.color,
      render: (row) => titleCase(row.species.color),
    },
    {
      // A CLAMP, not a fit: the widest cell is 208px of joined item names. See
      // the note at the top about the two columns that ellipsize on purpose.
      key: 'heldItems',
      label: 'Held items',
      width: '11rem',
      sortValue: (row) => heldItemsLabel(row, versions),
      render: (row) => heldItemsLabel(row, versions),
    },
    {
      key: 'genderDiff',
      label: 'Gender diff.',
      width: '5.3rem',
      sortValue: (row) => flag(row.species.has_gender_differences),
      render: (row) => flag(row.species.has_gender_differences),
    },
    {
      key: 'genus',
      label: 'Genus',
      width: '7.4rem',
      sortValue: (row) => row.species.genus,
      render: (row) => row.species.genus ?? DASH,
    },
    {
      key: 'shape',
      label: 'Body shape',
      width: '4.95rem',
      sortValue: (row) => row.species.shape,
      render: (row) => titleCase(row.species.shape),
    },
    {
      key: 'generation',
      label: 'Gen',
      width: '2.4rem',
      numeric: true,
      sortValue: (row) => row.species.generation_id,
      render: (row) => <span className="num">{row.species.generation_id ?? DASH}</span>,
    },
    {
      key: 'baby',
      label: 'Baby',
      width: '2.75rem',
      sortValue: (row) => flag(row.species.is_baby),
      render: (row) => flag(row.species.is_baby),
    },
    {
      key: 'legendary',
      label: 'Legendary',
      width: '4.7rem',
      sortValue: (row) => flag(row.species.is_legendary),
      render: (row) => flag(row.species.is_legendary),
    },
    {
      key: 'mythical',
      label: 'Mythical',
      width: '4.25rem',
      sortValue: (row) => flag(row.species.is_mythical),
      render: (row) => flag(row.species.is_mythical),
    },
    {
      key: 'evoStage',
      label: 'Evo stage',
      width: '4.4rem',
      numeric: true,
      sortValue: (row) => evolutionFacts(row.species).stage,
      render: (row) => <span className="num">{evolutionFacts(row.species).stage ?? DASH}</span>,
    },
    {
      key: 'evolvesFrom',
      label: 'Evolves from',
      width: '5.6rem',
      sortValue: (row) => evolutionFacts(row.species).evolvesFrom?.display_name ?? null,
      render: (row) => evolutionFacts(row.species).evolvesFrom?.display_name ?? DASH,
    },
    {
      // The other clamp, and by far the wider one: Eevee's seven evolutions with
      // their conditions measure 1347px. 20rem shows the common one-evolution
      // case whole and ellipsizes the rest.
      key: 'evolvesTo',
      label: 'Evolves to',
      width: '20rem',
      sortValue: (row) =>
        evolutionFacts(row.species)
          .evolvesTo.map((e) => e.species?.display_name ?? '')
          .join(', ') || null,
      render: (row) => {
        const to = evolutionFacts(row.species).evolvesTo
        if (to.length === 0) return DASH
        return to
          .map((e) => `${e.species?.display_name ?? '?'} (${e.condition || 'no condition'})`)
          .join(' · ')
      },
    },
    {
      key: 'hasFurther',
      label: 'Further evo',
      width: '5.25rem',
      sortValue: (row) => flag(evolutionFacts(row.species).hasFurther),
      render: (row) => flag(evolutionFacts(row.species).hasFurther),
    },
  ]
}

/**
 * Short stat names for the EV columns.
 *
 * "Attack EVY" and "Sp. Atk EVY" are wider than any number they will ever hold,
 * and six of them in a row is most of a window -- so the EV block uses the
 * abbreviations while the base-stat block keeps the full labels. Keyed by stat
 * key rather than derived by truncating the label, because no rule that turns
 * "Defense" into "Def" also turns "Sp. Atk" into "SpA".
 */
/**
 * Per-stat column widths for the two stat blocks, sized to the HEADER in both
 * cases -- three digits are narrower than every one of these labels.
 *
 * Keyed rather than uniform because "HP" and "Defense" are not the same width and
 * a block padded to its widest member is six columns of the same wasted 30px.
 * Gen 1's combined `special` is here too, so the era swap changes the label AND
 * the width together.
 */
const STAT_WIDTHS: Record<string, string> = {
  hp: '2rem',
  attack: '3.45rem',
  defense: '3.85rem',
  special: '3.4rem',
  'special-attack': '3.4rem',
  'special-defense': '3.4rem',
  speed: '3.1rem',
}

/** The same, for the EV block, whose labels carry the " EVY" suffix. */
const EV_WIDTHS: Record<string, string> = {
  hp: '3.3rem',
  attack: '3.65rem',
  defense: '3.65rem',
  special: '3.65rem',
  'special-attack': '3.65rem',
  'special-defense': '3.7rem',
  speed: '3.65rem',
}

const EV_LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'Atk',
  defense: 'Def',
  special: 'Spc',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
}

const typeName = (row: SpeciesRow, slot: number): string | null => {
  const id = row.typeIds[slot]
  return id == null ? null : (getType(id)?.name ?? null)
}

/** The type as a LABEL -- the app-wide treatment: coloured text, never a badge. */
function typeCell(row: SpeciesRow, slot: number) {
  const name = typeName(row, slot)
  return name ? <TypeLabel type={name} small /> : DASH
}

/** The ability in one of the two ordinary slots, or null where the slot is empty. */
function abilitySlot(row: SpeciesRow, generation: number, slot: number): string | null {
  const found = resolveAbilitiesForGeneration(row.variety, generation).find(
    (a) => !a.is_hidden && a.slot === slot,
  )
  return found?.ability.display_name ?? null
}

function hiddenAbility(row: SpeciesRow, generation: number): string | null {
  const found = resolveAbilitiesForGeneration(row.variety, generation).find((a) => a.is_hidden)
  return found?.ability.display_name ?? null
}

function eggGroupNames(row: SpeciesRow): string[] {
  return (row.species.egg_group_ids ?? []).map((id) => getEggGroup(id)?.display_name ?? String(id))
}
