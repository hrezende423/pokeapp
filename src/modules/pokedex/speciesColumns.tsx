import { TypeRow } from '../../components/ds/TypeLabel'
import type { Column } from '../../components/DataTable'
import {
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
 * THE FIRST TWELVE COLUMNS FIT THE WINDOW, deliberately and by measurement:
 * national number through Speed, which is the block that answers "what is this
 * and how good is it". Everything after Speed is over the horizontal scroll,
 * which is the trade this table makes rather than shrinking type past legibility
 * -- the widths below are what makes that promise, and verify-dex-filters
 * measures it rather than trusting it.
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

  const statColumns: Column<SpeciesRow>[] = statFieldsFor(generation).map((stat) => ({
    key: `stat-${stat.key}`,
    label: stat.label,
    width: '3.4rem',
    numeric: true,
    sortValue: (row) => row.stats[stat.key] ?? null,
    render: (row) => <span className="num">{row.stats[stat.key] ?? DASH}</span>,
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
    {
      key: 'types',
      label: 'Types',
      width: '7.5rem',
      // Sorted by the typing as written, so the two halves of a dual type stay
      // together rather than interleaving with every other Grass.
      sortValue: (row) => row.typeIds.map((id) => getType(id)?.name ?? '').join('/'),
      render: (row) => (
        <TypeRow types={row.typeIds.map((id) => getType(id)?.name ?? '').filter(Boolean)} small />
      ),
    },
    {
      key: 'abilities',
      label: 'Abilities',
      width: '10.5rem',
      sortValue: (row) => abilityNames(row, generation).join(', '),
      render: (row) => {
        const names = abilityNames(row, generation)
        return names.length > 0 ? names.join(' · ') : DASH
      },
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
      key: 'eggGroups',
      label: 'Egg groups',
      width: '9rem',
      sortValue: (row) => eggGroupNames(row).join(', '),
      render: (row) => {
        const names = eggGroupNames(row)
        return names.length > 0 ? names.join(' · ') : DASH
      },
    },
    {
      key: 'ev',
      label: 'EV yield',
      width: '8rem',
      sortValue: (row) => Object.values(row.evs).reduce((a, b) => a + b, 0) || null,
      render: (row) => {
        const parts = statFieldsFor(generation)
          .filter((stat) => row.evs[stat.key] != null)
          .map((stat) => `${row.evs[stat.key]} ${stat.label}`)
        return parts.length > 0 ? parts.join(' · ') : DASH
      },
    },
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

/** Abilities INCLUDING the hidden slot, which is marked rather than dropped. */
function abilityNames(row: SpeciesRow, generation: number): string[] {
  return resolveAbilitiesForGeneration(row.variety, generation).map((a) =>
    a.is_hidden ? `${a.ability.display_name} (H)` : a.ability.display_name,
  )
}

function eggGroupNames(row: SpeciesRow): string[] {
  return (row.species.egg_group_ids ?? []).map((id) => getEggGroup(id)?.display_name ?? String(id))
}
