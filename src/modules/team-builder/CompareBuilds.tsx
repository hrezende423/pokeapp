/**
 * Two Builds side by side, opened from the Build Library's selection mode.
 *
 * EACH BUILD READS IN ITS OWN GENERATION, the rule every other surface here
 * follows, so a Gen 2 and a Gen 4 Build can be compared: a row neither generation
 * has is left out, and a value only one has shows a dash on the other side.
 *
 * A ROW THAT DIFFERS IS MARKED BY A HAIRLINE, not by colour: no accent, no fill and
 * no badge are available for this.
 */

import { IconArrowLeft } from '@tabler/icons-react'
import { TypeLabel } from '../../components/ds/TypeLabel'
import { GhostButton } from './ui/GhostButton'
import { abilityName, buildLabel, buildSpecies, genderGlyph, itemName, moveRowsFor, natureName } from './buildFacts'
import { buildRows, type BuildRow } from './libraryQuery'
import type { Build } from './model'
import { useTeamBuilderData } from './store'
import { goTo } from './tbNav'

type Cell = string | number | null
interface Row {
  label: string
  values: [Cell, Cell]
}

const textFor = (value: Cell): string => (value == null || value === '' ? '—' : String(value))

const STATS = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Attack' },
  { key: 'defense', label: 'Defense' },
  { key: 'special-attack', label: 'Sp. Atk' },
  { key: 'special-defense', label: 'Sp. Def' },
  { key: 'speed', label: 'Speed' },
] as const

const fieldsFor = (b: Build) => ({
  gender: b.generation >= 2 ? genderGlyph(b.gender) : null,
  ability: b.generation >= 3 && b.abilityId != null ? abilityName(b.abilityId) : null,
  nature: b.generation >= 3 && b.natureId != null ? natureName(b.natureId) : null,
  item: b.generation >= 2 && b.itemId != null ? itemName(b.itemId) : null,
})

function rowsFor(a: BuildRow, b: BuildRow): Row[] {
  const fa = fieldsFor(a.build)
  const fb = fieldsFor(b.build)
  const movesA = moveRowsFor(a.build)
  const movesB = moveRowsFor(b.build)
  const rows: Row[] = [
    { label: 'Species', values: [a.speciesName, b.speciesName] },
    { label: 'Generation', values: [a.build.generation, b.build.generation] },
    { label: 'Level', values: [a.level, b.level] },
  ]
  /* A row that neither Build's generation has is absent, not dashed twice. */
  const optional: [string, keyof typeof fa, number][] = [
    ['Gender', 'gender', 2],
    ['Ability', 'ability', 3],
    ['Nature', 'nature', 3],
    ['Item', 'item', 2],
  ]
  for (const [label, key, since] of optional) {
    if (Math.max(a.build.generation, b.build.generation) >= since) {
      rows.push({ label, values: [fa[key], fb[key]] })
    }
  }
  movesA.forEach((move, i) =>
    rows.push({ label: `Move ${i + 1}`, values: [move?.name ?? null, movesB[i]?.name ?? null] }),
  )
  for (const { key, label } of STATS) rows.push({ label, values: [a.stats[key], b.stats[key]] })
  rows.push({ label: 'Base stat total', values: [a.bst, b.bst] })
  return rows
}

export function CompareBuilds({ ids }: { ids: [string, string] }) {
  const data = useTeamBuilderData()
  const all = buildRows(data)
  const [a, b] = ids.map((id) => all.find((r) => r.build.id === id))
  const back = () => goTo({ kind: 'build-library' })

  return (
    <section className="tb-screen tb-compare" data-testid="tb-compare" data-layout="tb-compare">
      <header className="tb-screen-head">
        <GhostButton bare onClick={back} testId="tb-compare-back">
          <IconArrowLeft size={18} stroke={1.5} />
          Build Library
        </GhostButton>
      </header>
      {!a || !b ? (
        <p className="tb-transfer-note" data-testid="tb-compare-missing">
          One of these Builds no longer exists.
        </p>
      ) : (
        <div className="tb-compare-scroll">
          <table className="tb-compare-table">
            <thead>
              <tr>
                <th />
                {[a, b].map((row) => {
                  const facts = buildSpecies(row.build)
                  return (
                    <th key={row.build.id} scope="col" data-testid={`tb-compare-head-${row.build.id}`}>
                      <span className="tb-compare-name">{buildLabel(row.build, facts?.species)}</span>
                      <span className="tb-compare-types">
                        {facts?.types.map((type) => <TypeLabel key={type} type={type} />)}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rowsFor(a, b).map(({ label, values }) => {
                const differs = values[0] !== values[1]
                return (
                  <tr key={label} data-testid={`tb-compare-row-${label}`} data-differs={differs}>
                    <th scope="row">{label}</th>
                    <td className="tb-compare-first">{textFor(values[0])}</td>
                    <td>{textFor(values[1])}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
