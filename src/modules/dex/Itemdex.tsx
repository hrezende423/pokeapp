import { IconArrowLeft, IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { ItemArtwork } from '../../components/ItemArtwork'
import { itemIconUrl } from '../../data/itemArtwork'
import { getItemSupplement, getMove, listItems, type Item, type ItemSupplement } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { gameLabel, gamesInGeneration } from '../version-group/games'
import { DataTable, type Column } from '../../components/DataTable'
import { DexPageShell } from './DexPageShell'
import { itemEntries } from './entrySources'

function titleCase(value: string | null): string {
  if (!value) return '—'
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** "usable-in-battle" -> "Usable in battle": an attribute reads as a phrase, not a title. */
function sentenceCase(value: string): string {
  const words = value.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The Pokédollar sign. Unicode has no code point for the games' P-with-two-bars;
 * U+20BD is the glyph Bulbapedia and the community use for it, and it is the
 * same shape. Prefixed with no space, as the games print it.
 */
const POKEDOLLAR = '₽'

function money(value: number): string {
  return `${POKEDOLLAR}${value.toLocaleString('en-US')}`
}

/**
 * Release order of the Gen 1-4 games the supplement can name. A function, not a
 * module constant: the version groups only exist once the data layer has booted,
 * which is after this module is imported.
 */
const legacyGames = (): string[] =>
  [1, 2, 3, 4].flatMap((g) => gamesInGeneration(g).map((vg) => vg.name))

/**
 * Buy price in ONE game, from Bulbapedia (item-supplement.json).
 *
 * The selected generation's default game when there is a selection. Under "All"
 * there is no game, so it is the latest Gen 1-4 game that sells the item -- a
 * price is a per-game fact and "All" has to pick one to show a number at all.
 */
function buyPrice(supplement: ItemSupplement | undefined, game: string | null): number | null {
  if (!supplement) return null
  if (game) return supplement.prices[game]?.[0] ?? null
  for (const vg of legacyGames().reverse()) {
    const buy = supplement.prices[vg]?.[0]
    if (buy != null) return buy
  }
  return null
}

/**
 * The move a TM or HM teaches in ONE game: the selected generation's default
 * game, or under "All" the latest Gen 1-4 game that has the machine -- the
 * price column's rule. TM01 is Mega Punch in Generation 1 and Focus Punch from
 * Generation 3, so the name is per game or it is wrong somewhere.
 */
function machineMove(item: Item, game: string | null): string | null {
  if (item.machines.length === 0) return null
  const byGame = new Map(item.machines.map((m) => [m.version_group, m.move_id]))
  const id = game
    ? byGame.get(game)
    : legacyGames()
        .reverse()
        .map((vg) => byGame.get(vg))
        .find((m) => m != null)
  return id != null ? (getMove(id)?.display_name ?? null) : null
}

/**
 * The item's generations as ranges: [1, 2, 3, 4] reads "1–4", and a gap keeps
 * its gap ("1–2, 4") rather than being smoothed into a range it is not.
 */
function generationRange(gens: number[]): string {
  const sorted = [...new Set(gens)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length;) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`)
    i = j + 1
  }
  return parts.join(', ')
}

/**
 * Every attribute an item in the bundle can have, read off the bundle rather
 * than hardcoded -- the dexes' rule for option lists. Computed once: the bundle
 * does not change under a running app.
 */
let attributeVocabulary: string[] | null = null
function allAttributes(): string[] {
  if (!attributeVocabulary) {
    const seen = new Set<string>()
    for (const item of listItems()) for (const a of item.attributes) if (a) seen.add(a)
    attributeVocabulary = [...seen].sort()
  }
  return attributeVocabulary
}

/**
 * The Itemdex: a sortable table, and a boxless item page.
 *
 * THE ICON LEADS THE NAME (owner, 2026-10-11), at 48px -- twice the 24 it was
 * drawn at when it trailed the name -- and centred on the name's line. Third
 * pass: it is a COLUMN of its own with no header, after the item number, so the
 * "Name" header sits over the names rather than over the icons.
 *
 * CATEGORY AND POCKET ARE BOTH REAL AND BOTH SHOWN. They are separate fields, not
 * a coarse and a fine version of one thing: 40 categories map onto 8 bag pockets,
 * and the mapping lives on item-category in PokeAPI rather than on the item. See
 * the derivation in scripts/build-data.ts.
 *
 * PRICES AND ACQUISITION ARE BULBAPEDIA'S, not PokeAPI's: the snapshot prices 13
 * of the 563 items and has no locations at all. See
 * scripts/build-item-supplement.mjs.
 */
export function Itemdex() {
  const { versionGroup, generation, isAll } = useVersionGroup()
  const vgName = versionGroup?.name ?? null

  // Under "All" nothing is filtered out: there is no single era to filter by.
  const entries = useMemo(() => itemEntries({ generation, isAll }), [generation, isAll])

  /*
    A TABLE WITH SORTABLE HEADERS (owner, 2026-10-10), like the Movedex. Initial
    order is the bundle's own (item id), which is what the list showed.

    EVERY WIDTH IS ITS LONGEST CONTENT PLUS PADDING (owner, 2026-10-11), measured
    in the browser at an 18px root, at the hover (regular) weight: "1029" 39px,
    "TM73 (Thunder Wave)" 142px, "Type Enhancement" 122px, "Pokeballs" 62px,
    "₽10,000" ~66px -- each plus the cell's 14px of padding and ~20px of air. px,
    because they were measured in px.
  */
  const columns: Column<Item>[] = useMemo(
    () => [
      {
        // The bundle's item id, the dex's own order (owner, 2026-10-11).
        key: 'no',
        label: 'No.',
        width: '60px',
        sortValue: (item) => item.id,
        render: (item) => <span className="num itemdex-no">{item.id}</span>,
      },
      {
        // The icon, inert and unlabelled: not sortable, nothing to read.
        key: 'icon',
        label: '',
        width: '64px',
        render: (item) => {
          const icon = itemIconUrl(item)
          return (
            <span className="itemdex-name-icon">
              {icon && (
                <img
                  src={icon}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  data-testid={`itemdex-row-icon-${item.id}`}
                />
              )}
            </span>
          )
        },
      },
      {
        key: 'name',
        label: 'Name',
        width: '190px',
        sortValue: (item) => item.display_name,
        render: (item) => {
          // A machine names its move after its number: "TM01 (Focus Punch)".
          const move = machineMove(item, vgName)
          return (
            <span className="itemdex-name-text">
              {item.display_name}
              {move && (
                <span className="itemdex-machine-move" data-testid={`itemdex-row-move-${item.id}`}>
                  {' '}
                  ({move})
                </span>
              )}
            </span>
          )
        },
      },
      {
        key: 'category',
        label: 'Category',
        width: '160px',
        sortValue: (item) => item.category,
        render: (item) => (
          <span data-testid={`itemdex-row-category-${item.id}`}>{titleCase(item.category)}</span>
        ),
      },
      {
        key: 'pocket',
        label: 'Pocket',
        width: '100px',
        sortValue: (item) => item.pocket,
        render: (item) =>
          item.pocket ? (
            <span data-testid={`itemdex-row-pocket-${item.id}`}>{titleCase(item.pocket)}</span>
          ) : (
            '—'
          ),
      },
      {
        // The buy price in the selected generation's default game. Most items are
        // not sold anywhere, which is an answer (a dash) rather than a gap.
        key: 'price',
        label: 'Price',
        width: '100px',
        numeric: true,
        sortValue: (item) => buyPrice(getItemSupplement(item.name), vgName),
        render: (item) => {
          const buy = buyPrice(getItemSupplement(item.name), vgName)
          return (
            <span className="num" data-testid={`itemdex-row-price-${item.id}`}>
              {buy != null ? money(buy) : '—'}
            </span>
          )
        },
      },
    ],
    [vgName],
  )

  return (
    <DexPageShell
      dexId="itemdex"
      entries={entries}
      entryId={(item) => item.id}
      gatedMessage={`No item in the bundle is indexed in Generation ${generation}.`}
      list={({ entries: visible, onSelect }) => (
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(item) => item.id}
          onRowClick={(item) => onSelect(item.id)}
          testId="itemdex-rows"
          emptyNote="No item matches those filters."
          plain
        />
      )}
      detail={({ entry, onBack }) => (
        <ItemDetail
          key={entry.id}
          item={entry}
          generation={generation}
          isAll={isAll}
          onBack={onBack}
        />
      )}
    />
  )
}

/**
 * A read-only checkbox, drawn in the design system's DISABLED look (owner,
 * 2026-10-11: "gray-ish like they were disabled"): 18px mark, 3px radius, a
 * --color-text-disabled outline, "on" filled in the same grey with a
 * --color-bg-canvas check, and the label in --color-text-disabled too. The first
 * pass drew the enabled look so it would not read "unavailable"; the owner
 * preferred it receding.
 *
 * AN SVG, NOT AN <input>: it is a readout, so it must not take focus or a click.
 * And not a CSS border, which is what lets the item page stay boxless
 * (verify-dexes asserts it).
 */
function CheckMark({ checked }: { checked: boolean }) {
  return (
    <svg
      className="item-attr-mark"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden
      focusable="false"
    >
      <rect
        x="0.75"
        y="0.75"
        width="16.5"
        height="16.5"
        rx="3"
        fill={checked ? 'var(--color-text-disabled)' : 'none'}
        stroke="var(--color-text-disabled)"
        strokeWidth="1.5"
      />
      {checked && (
        <path
          d="M5 9.2 7.8 12 13 6.5"
          fill="none"
          stroke="var(--color-bg-canvas)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

interface AcquisitionRow {
  key: number
  games: string
  finite: string
  repeatable: string
}

/** A method cell: Bulbapedia's line breaks kept as separate lines. */
function MethodLines({ text }: { text: string }) {
  if (!text) return <span className="data-table-prose">—</span>
  return (
    <span className="data-table-prose item-acq-lines">
      {text.split('\n').map((line, i) => (
        <span key={i}>{line}</span>
      ))}
    </span>
  )
}

function ItemDetail({
  item,
  generation,
  isAll,
  onBack,
}: {
  item: Item
  generation: number
  isAll: boolean
  onBack: () => void
}) {
  const [acquisitionOpen, setAcquisitionOpen] = useState(false)
  const supplement = getItemSupplement(item.name)
  const generations = item.generation_ids.filter((g) => g <= 4)

  /*
    THE GAMES THIS PAGE SPEAKS FOR: the selected generation's, or every Gen 1-4
    game under "All". Prices and acquisition are both per game, and both follow
    the global selector -- the Info tab's locations are the ONE sanctioned
    exception to it, and this page is not that.
  */
  const games = useMemo(
    () => (isAll ? legacyGames() : gamesInGeneration(generation).map((vg) => vg.name)),
    [generation, isAll],
  )

  /*
    One price when every game in scope agrees, otherwise one per distinct price
    with the games that charge it -- "₽200 (Red/Blue, Yellow)". Grouped rather
    than listed per game because prices change rarely and a column of identical
    figures would bury the one that differs.
  */
  const priceGroups = (side: 0 | 1) => {
    const groups = new Map<number, string[]>()
    for (const vg of games) {
      const v = supplement?.prices[vg]?.[side]
      if (v == null) continue
      groups.set(v, [...(groups.get(v) ?? []), vg])
    }
    return [...groups].map(([value, vgs]) => ({ value, vgs }))
  }
  const buys = priceGroups(0)
  const sells = priceGroups(1)
  const pricedGames = buys.flatMap((g) => g.vgs).length

  const renderGroups = (groups: { value: number; vgs: string[] }[], allGames: boolean) =>
    groups.map((g, i) => (
      <span key={g.value} className="item-price-group">
        {i > 0 && ' · '}
        <span className="num">{money(g.value)}</span>
        {(!allGames || groups.length > 1) && (
          <span className="fact-note"> ({g.vgs.map(gameLabel).join(', ')})</span>
        )}
      </span>
    ))

  /*
    ACQUISITION RUNS FROM GENERATION 1 UP TO THE SELECTED ONE (owner,
    2026-10-11), not the selected generation alone: where an item could be found
    is a history the reader is standing at the end of. Still bounded by the
    selector -- a Gen 3 reader sees no Gen 4 game. Prices stay per generation.
    Not memoised: a few dozen rows at most.
  */
  const inScope = new Set(
    isAll
      ? legacyGames()
      : [1, 2, 3, 4]
          .filter((g) => g <= generation)
          .flatMap((g) => gamesInGeneration(g).map((vg) => vg.name)),
  )
  const rows: AcquisitionRow[] = (supplement?.acquisition.rows ?? [])
    .map((r, i) => ({ ...r, games: r.games.filter((g) => inScope.has(g)), key: i }))
    .filter((r) => r.games.length > 0)
    .map((r) => ({
      key: r.key,
      games: r.games.map(gameLabel).join(', '),
      finite: r.finite,
      repeatable: r.repeatable,
    }))
  const split = supplement?.acquisition.split ?? false

  const acquisitionColumns: Column<AcquisitionRow>[] = split
    ? [
        /* Percentages: the table fills the page's column, which is the
           Berrydex's width now (owner, 2026-10-11) rather than 1000px. */
        {
          key: 'games',
          label: 'Games',
          width: '24%',
          render: (r) => <span className="data-table-prose">{r.games}</span>,
        },
        {
          key: 'finite',
          label: 'Finite methods',
          width: '38%',
          render: (r) => <MethodLines text={r.finite} />,
        },
        {
          key: 'repeatable',
          label: 'Repeatable methods',
          width: '38%',
          render: (r) => <MethodLines text={r.repeatable} />,
        },
      ]
    : [
        {
          key: 'games',
          label: 'Games',
          width: '24%',
          render: (r) => <span className="data-table-prose">{r.games}</span>,
        },
        {
          key: 'finite',
          label: 'Methods',
          width: '76%',
          render: (r) => <MethodLines text={r.finite} />,
        },
      ]

  const allAttrs = allAttributes()
  const has = new Set(item.attributes.filter((a): a is string => !!a))

  return (
    <div
      className="entity-detail entity-column item-detail"
      data-testid="itemdex-detail"
      data-entry-id={item.id}
    >
      <div className="pokedex-back-row">
        <button type="button" className="pokedex-back" data-testid="entity-back" onClick={onBack}>
          <IconArrowLeft size={18} stroke={1.5} aria-hidden focusable="false" />
          All items
        </button>
      </div>

      {/* Artwork beside the name rather than in a panel above it: there is no
          container here for it to sit inside. */}
      <div className="item-hero">
        <ItemArtwork item={item} size={96} testId="itemdex-artwork" />
        <div className="item-hero-text">
          <h2 className="entity-detail-name" data-testid="itemdex-name">
            {item.display_name}
          </h2>
          <p className="entity-detail-meta">
            <span data-testid="itemdex-category">{titleCase(item.category)}</span>
            {item.pocket && (
              <>
                {' · '}
                <span data-testid="itemdex-pocket">{titleCase(item.pocket)} pocket</span>
              </>
            )}
          </p>
        </div>
      </div>

      {item.short_effect && (
        <p className="item-short-effect" data-testid="itemdex-short-effect">
          {item.short_effect}
        </p>
      )}
      <p className="entity-detail-desc" data-testid="itemdex-effect">
        {item.effect ?? 'No effect text in the bundle.'}
      </p>

      {/* Label/value rows -- no hairlines since the third pass. */}
      <ul className="fact-rows" data-testid="itemdex-facts">
        <li>
          <span className="fact-label">Price</span>
          <span className="fact-value" data-testid="itemdex-price">
            {buys.length > 0 ? renderGroups(buys, pricedGames === games.length) : 'Not sold'}
          </span>
        </li>
        <li>
          <span className="fact-label">Sell price</span>
          <span className="fact-value" data-testid="itemdex-sell-price">
            {sells.length > 0
              ? renderGroups(sells, sells.flatMap((g) => g.vgs).length === games.length)
              : '—'}
          </span>
        </li>
        <li>
          <span className="fact-label">Fling power</span>
          <span className="fact-value">
            {item.fling_power != null ? <span className="num">{item.fling_power}</span> : '—'}
          </span>
        </li>
        <li>
          <span className="fact-label">Fling effect</span>
          <span className="fact-value">{titleCase(item.fling_effect)}</span>
        </li>
        <li>
          <span className="fact-label">
            {generations.length === 1 ? 'Generation' : 'Generations'}
          </span>
          <span className="fact-value" data-testid="itemdex-generations">
            {generations.length > 0 ? (
              <span className="num">{generationRange(generations)}</span>
            ) : (
              '—'
            )}
          </span>
        </li>
        {/* Two rows of four under their label (owner, 2026-10-11), which is
            what lets the page be the Berrydex's width. */}
        <li className="item-attr-row">
          <span className="fact-label">Attributes</span>
          <ul className="item-attrs" data-testid="itemdex-attributes">
            {allAttrs.map((a) => (
              <li
                key={a}
                className="item-attr"
                role="checkbox"
                aria-checked={has.has(a)}
                aria-readonly="true"
                aria-disabled="true"
                data-testid={`itemdex-attr-${a}`}
                data-checked={has.has(a)}
              >
                <CheckMark checked={has.has(a)} />
                {sentenceCase(a)}
              </li>
            ))}
          </ul>
        </li>
      </ul>

      {/* HOW TO GET IT, folded by default: on a busy item the table is longer
          than everything above it, and most visits are for the effect. */}
      <div className="item-acq">
        <button
          type="button"
          className="item-acq-toggle"
          aria-expanded={acquisitionOpen}
          aria-controls="itemdex-acquisition"
          data-testid="itemdex-acquisition-toggle"
          onClick={() => setAcquisitionOpen((open) => !open)}
        >
          Acquisition
          {acquisitionOpen ? (
            <IconChevronUp size={18} stroke={1.5} aria-hidden focusable="false" />
          ) : (
            <IconChevronDown size={18} stroke={1.5} aria-hidden focusable="false" />
          )}
        </button>
        {acquisitionOpen && (
          <div id="itemdex-acquisition" className="item-acq-body" data-testid="itemdex-acquisition">
            {rows.length > 0 ? (
              <DataTable
                rows={rows}
                columns={acquisitionColumns}
                rowKey={(r) => r.key}
                testId="itemdex-acquisition-rows"
              />
            ) : (
              <p className="subtitle" data-testid="itemdex-acquisition-none">
                Bulbapedia lists no way to obtain {item.display_name}{' '}
                {isAll || generation >= 4
                  ? 'in Generations 1–4'
                  : generation === 1
                    ? 'in Generation 1'
                    : `in Generations 1–${generation}`}
                .
              </p>
            )}
            <p className="list-caption">
              From {supplement ? `Bulbapedia's “${supplement.title}” page` : 'Bulbapedia'} (CC
              BY-NC-SA 2.5).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
