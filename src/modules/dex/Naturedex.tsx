import { useMemo } from 'react'
import { NATURES_INTRODUCED_IN_GENERATION, naturesExistInGeneration } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexCard, DexFacts, DexShell } from './DexShell'
import { natureEntries } from './entrySources'

const STAT_LABELS: Record<string, string> = {
  attack: 'Attack',
  defense: 'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
}

const statLabel = (stat: string | null) => (stat ? (STAT_LABELS[stat] ?? stat) : null)

function titleCase(value: string | null): string {
  if (!value) return '—'
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function Naturedex() {
  const { generation, isAll } = useVersionGroup()

  // Gated as one rule, not per entry: all 25 natures arrived together in Gen 3
  // and none has been added or removed since, so there is no per-entry signal to
  // consult and inventing one would be fiction.
  const available = isAll || naturesExistInGeneration(generation)
  const entries = useMemo(() => natureEntries({ generation, isAll }), [generation, isAll])

  return (
    <DexShell
      dexId="naturedex"
      title="Naturedex"
      entries={entries}
      gatedMessage={`Natures did not exist in Generation ${generation}. They were introduced in Generation ${NATURES_INTRODUCED_IN_GENERATION} — pick a Generation ${NATURES_INTRODUCED_IN_GENERATION}+ game to browse them.`}
      note={
        available
          ? `All ${entries.length} natures${isAll ? '' : ` (Generation ${generation})`}`
          : `Natures did not exist in Generation ${generation}`
      }
      row={(nature) => {
        const up = statLabel(nature.increased_stat)
        const down = statLabel(nature.decreased_stat)
        return {
          id: nature.id,
          label: nature.display_name,
          meta: up && down ? `+${up} / −${down}` : 'neutral',
        }
      }}
      detail={(nature) => {
        const up = statLabel(nature.increased_stat)
        const down = statLabel(nature.decreased_stat)
        // Five natures (Hardy, Docile, Serious, Bashful, Quirky) raise and lower
        // the same stat, which PokeAPI represents as both fields being null.
        const neutral = up == null || down == null
        return (
          <>
            <DexCard testId="naturedex-card-head" title="Nature">
              <h2 data-testid="naturedex-name">{nature.display_name}</h2>
              <p className="subtitle" data-testid="naturedex-summary">
                {neutral ? 'Neutral — no stat change' : `+10% ${up}, −10% ${down}`}
              </p>
            </DexCard>

            <DexCard testId="naturedex-card-stats" title="Stat change">
              {neutral ? (
                <p className="subtitle" data-testid="naturedex-neutral">
                  This nature raises and lowers the same stat, so it has no net effect.
                </p>
              ) : (
                <ul className="stats" data-testid="naturedex-stat-pair">
                  <li>
                    <span>increased</span>
                    <strong className="stat-up" data-testid="naturedex-increased">
                      {up} +10%
                    </strong>
                  </li>
                  <li>
                    <span>decreased</span>
                    <strong className="stat-down" data-testid="naturedex-decreased">
                      {down} −10%
                    </strong>
                  </li>
                </ul>
              )}
            </DexCard>

            <DexCard testId="naturedex-card-flavor" title="Flavour">
              <DexFacts
                facts={[
                  ['likes', titleCase(nature.likes_flavor)],
                  ['dislikes', titleCase(nature.hates_flavor)],
                ]}
              />
            </DexCard>
          </>
        )
      }}
    />
  )
}
