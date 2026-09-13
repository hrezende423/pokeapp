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
 * THE IDENTITY BLOCK FITS THE WINDOW, deliberately and by measurement: national
 * number through Speed, which is the block that answers "what is this and how
 * good is it". Splitting the joined cells made that block fifteen columns rather
 * than twelve, and the widths below are sized so it still lands inside a normal
 * window; verify-dex-filters measures it rather than trusting it. Everything
 * after Speed is over the horizontal scroll, which the list view now actually
 * draws a bar for.
 *
 * ERA CORRECTNESS runs through the same resolvers as everywhere else: abilities
 * do not exist before Generation 3 and neither does the EV yield, egg groups
 * arrive in Generation 2, and Gen 1's combined Special replaces the split pair
 * (so Gen 1 has one stat column fewer, not a blank one).
 */

const DASH = '—'

const titleCase = (value: string | null | undefined) =>
  value ? value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : DASH

/**
 * Which regional dex a game numbers its species by.
 *
 * Written out rather than derived: a generation does not determine it --
 * FireRed/LeafGreen are Generation 3 games that use the KANTO dex, Platinum
 * extends Diamond/Pearl's Sinnoh dex rather than sharing it, and HeartGold/
 * SoulSilver use the updated Johto one. The three entries with no regional dex
 * at all (Colosseum, XD, and the "All games" scope, which is not one game) are
 * null on purpose, and the column prints a dash rather than borrowing a number
 * from a game the reader did not pick.
 */
const REGIONAL_DEX: Record<string, string> = {
  'red-blue': 'kanto',
  yellow: 'kanto',
  'red-green-japan': 'kanto',
  'blue-japan': 'kanto',
  'gold-silver': 'original-johto',
  crystal: 'original-johto',
  'ruby-sapphire': 'hoenn',
  emerald: 'hoenn',
  'firered-leafgreen': 'kanto',
  'diamond-pearl': 'original-sinnoh',
  platinum: 'extended-sinnoh',
  'heartgold-soulsilver': 'updated-johto',
}

export function regionalDexKey(versionGroup: VersionGroup | null): string | null {
  if (!versionGroup) return null
  return REGIONAL_DEX[versionGroup.name] ?? null
}

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
  const dexKey = regionalDexKey(versionGroup)
  const versions = (versionGroup?.versions ?? []).filter((v): v is string => v != null)
  const regional = (row: SpeciesRow) =>
    dexKey ? (row.species.pokedex_numbers[dexKey] ?? null) : null

  const statFields = statFieldsFor(generation)

  const statColumns: Column<SpeciesRow>[] = statFields.map((stat) => ({
    key: `stat-${stat.key}`,
    label: stat.label,
    width: '3.4rem',
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
          width: '4.2rem',
          numeric: true,
          sortValue: (row) => row.evs[stat.key] ?? 0,
          render: (row) => <span className="num">{row.evs[stat.key] ?? 0}</span>,
        }))

  return [
    {
      key: 'natdex',
      label: 'Nat #',
      width: '3.9rem',
      numeric: true,
      sortValue: (row) => row.species.id,
      render: (row) => <span className="num">{String(row.species.id).padStart(4, '0')}</span>,
    },
    {
      key: 'regdex',
      label: 'Reg #',
      width: '3.9rem',
      numeric: true,
      sortValue: (row) => regional(row),
      render: (row) => {
        const n = regional(row)
        return <span className="num">{n != null ? String(n).padStart(3, '0') : DASH}</span>
      },
    },
    {
      key: 'name',
      label: 'Name',
      width: '7.5rem',
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
      width: '4.8rem',
      sortValue: (row) => typeName(row, 0),
      render: (row) => typeCell(row, 0),
    },
    {
      key: 'type2',
      label: 'Type 2',
      width: '4.8rem',
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
      width: '7.6rem',
      sortValue: (row) => abilitySlot(row, generation, 1),
      render: (row) => abilitySlot(row, generation, 1) ?? DASH,
    },
    {
      key: 'ability2',
      label: 'Ability 2',
      width: '7.6rem',
      sortValue: (row) => abilitySlot(row, generation, 2),
      render: (row) => abilitySlot(row, generation, 2) ?? DASH,
    },
    {
      key: 'abilityHidden',
      label: 'Hidden ability',
      width: '7.6rem',
      sortValue: (row) => hiddenAbility(row, generation),
      render: (row) => hiddenAbility(row, generation) ?? DASH,
    },
    {
      key: 'bst',
      label: 'BST',
      width: '3.6rem',
      numeric: true,
      sortValue: (row) => row.bst,
      render: (row) => <span className="num">{row.bst}</span>,
    },
    ...statColumns,
    {
      key: 'eggGroup1',
      label: 'Egg group 1',
      width: '6.8rem',
      sortValue: (row) => eggGroupNames(row)[0] ?? null,
      render: (row) => eggGroupNames(row)[0] ?? DASH,
    },
    {
      key: 'eggGroup2',
      label: 'Egg group 2',
      width: '6.8rem',
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
      width: '4.6rem',
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
      width: '5.4rem',
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
      width: '4.8rem',
      numeric: true,
      sortValue: (row) => row.species.capture_rate,
      render: (row) => <span className="num">{row.species.capture_rate ?? DASH}</span>,
    },
    {
      key: 'friendship',
      label: 'Friendship',
      width: '5rem',
      numeric: true,
      sortValue: (row) => row.species.base_happiness,
      render: (row) => <span className="num">{row.species.base_happiness ?? DASH}</span>,
    },
    {
      key: 'baseExp',
      label: 'Base EXP',
      width: '5rem',
      numeric: true,
      sortValue: (row) => row.variety.base_experience,
      render: (row) => <span className="num">{row.variety.base_experience ?? DASH}</span>,
    },
    {
      key: 'gender',
      label: 'Gender ratio',
      width: '7.5rem',
      // Sorted by the underlying eighths, so the column reads as a scale rather
      // than alphabetically by the label that describes it.
      sortValue: (row) => row.species.gender_rate ?? -1,
      render: (row) => genderLabel(row.species.gender_rate),
    },
    {
      key: 'growth',
      label: 'Growth rate',
      width: '8rem',
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
      width: '5rem',
      sortValue: (row) => row.species.color,
      render: (row) => titleCase(row.species.color),
    },
    {
      key: 'heldItems',
      label: 'Held items',
      width: '11rem',
      sortValue: (row) => heldItemsLabel(row, versions),
      render: (row) => heldItemsLabel(row, versions),
    },
    {
      key: 'genderDiff',
      label: 'Gender diff.',
      width: '5.4rem',
      sortValue: (row) => flag(row.species.has_gender_differences),
      render: (row) => flag(row.species.has_gender_differences),
    },
    {
      key: 'genus',
      label: 'Genus',
      width: '9rem',
      sortValue: (row) => row.species.genus,
      render: (row) => row.species.genus ?? DASH,
    },
    {
      key: 'shape',
      label: 'Body shape',
      width: '6rem',
      sortValue: (row) => row.species.shape,
      render: (row) => titleCase(row.species.shape),
    },
    {
      key: 'generation',
      label: 'Gen',
      width: '3.4rem',
      numeric: true,
      sortValue: (row) => row.species.generation_id,
      render: (row) => <span className="num">{row.species.generation_id ?? DASH}</span>,
    },
    {
      key: 'baby',
      label: 'Baby',
      width: '4rem',
      sortValue: (row) => flag(row.species.is_baby),
      render: (row) => flag(row.species.is_baby),
    },
    {
      key: 'legendary',
      label: 'Legendary',
      width: '5rem',
      sortValue: (row) => flag(row.species.is_legendary),
      render: (row) => flag(row.species.is_legendary),
    },
    {
      key: 'mythical',
      label: 'Mythical',
      width: '5rem',
      sortValue: (row) => flag(row.species.is_mythical),
      render: (row) => flag(row.species.is_mythical),
    },
    {
      key: 'evoStage',
      label: 'Evo stage',
      width: '4.8rem',
      numeric: true,
      sortValue: (row) => evolutionFacts(row.species).stage,
      render: (row) => <span className="num">{evolutionFacts(row.species).stage ?? DASH}</span>,
    },
    {
      key: 'evolvesFrom',
      label: 'Evolves from',
      width: '7.5rem',
      sortValue: (row) => evolutionFacts(row.species).evolvesFrom?.display_name ?? null,
      render: (row) => evolutionFacts(row.species).evolvesFrom?.display_name ?? DASH,
    },
    {
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
      width: '5.4rem',
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
