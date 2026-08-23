import { useMemo, useState } from 'react'
import { TypeBadge } from '../../components/TypeBadge'
import { TypeFilter } from '../../components/TypeFilter'
import { listMoves, typesInGeneration } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { DexCard, DexFacts, DexShell } from './DexShell'
import { moveEntries } from './entrySources'
import { MoveLearners } from './MoveLearners'

function titleCase(value: string | null): string {
  if (!value) return '—'
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * physical / special / status is `damage_class`, NOT `meta.category`.
 *
 * `meta.category` is a different axis entirely -- damage, ailment, net-good-stats,
 * ohko, field-effect and eleven more -- describing what the move *does*, not how
 * damage is calculated. Both are shown, labelled distinctly, because conflating
 * them is the obvious mistake here.
 */

export function Movedex() {
  const { versionGroup, generation, isAll } = useVersionGroup()
  const vgName = versionGroup?.name ?? null
  const [typeFilter, setTypeFilter] = useState<number[]>([])

  const availableTypes = useMemo(() => typesInGeneration(generation), [generation])

  // A type that stops existing when the generation changes must not keep filtering.
  const activeTypeFilter = useMemo(
    () => typeFilter.filter((id) => availableTypes.some((t) => t.id === id)),
    [typeFilter, availableTypes],
  )

  const gated = useMemo(() => moveEntries({ generation, isAll }), [generation, isAll])

  const entries = useMemo(
    () =>
      activeTypeFilter.length === 0
        ? gated
        : gated.filter((m) => m.type_id != null && activeTypeFilter.includes(m.type_id)),
    [gated, activeTypeFilter],
  )

  const total = listMoves().length

  return (
    <DexShell
      dexId="movedex"
      title="Movedex"
      entries={entries}
      gatedMessage={`No move in the bundle exists in Generation ${generation}.`}
      note={
        isAll
          ? `All ${total} moves — every one exists in at least one of Generations 1-4`
          : `${gated.length} of ${total} moves exist in Generation ${generation}`
      }
      controls={
        <TypeFilter
          available={availableTypes}
          selected={activeTypeFilter}
          onChange={setTypeFilter}
          testIdPrefix="movedex-type"
          label="Filter moves by type"
        />
      }
      row={(move) => ({
        id: move.id,
        label: move.display_name,
        meta: move.damage_class ?? undefined,
      })}
      detail={(move) => (
        <>
          <DexCard testId="movedex-card-head" title="Move">
            <h2 data-testid="movedex-name">{move.display_name}</h2>
            <div className="row-types" data-testid="movedex-type">
              {move.type_id != null && <TypeBadge typeId={move.type_id} />}
              <span className="damage-class" data-testid="movedex-damage-class">
                {titleCase(move.damage_class)}
              </span>
            </div>
            <p className="subtitle" data-testid="movedex-intro">
              Introduced in Generation {move.generation_id ?? '?'}
            </p>
          </DexCard>

          <div className="card-grid">
            <DexCard testId="movedex-card-battle" title="Battle">
              <DexFacts
                facts={[
                  ['power', <span data-testid="movedex-power">{move.power ?? '—'}</span>],
                  [
                    'accuracy',
                    <span data-testid="movedex-accuracy">
                      {move.accuracy != null ? `${move.accuracy}%` : '—'}
                    </span>,
                  ],
                  ['PP', <span data-testid="movedex-pp">{move.pp ?? '—'}</span>],
                  [
                    'category',
                    <span data-testid="movedex-category">{titleCase(move.damage_class)}</span>,
                  ],
                  ['priority', move.priority ?? 0],
                  ['target', titleCase(move.target)],
                  // The other axis, named so it cannot be mistaken for the above.
                  ['effect kind', titleCase(move.meta?.category ?? null)],
                ]}
              />
            </DexCard>

            <DexCard testId="movedex-card-contest" title="Contest">
              {move.contest_type == null && move.contest_effect == null ? (
                <p className="subtitle" data-testid="movedex-contest-none">
                  This move has no contest data.
                </p>
              ) : (
                <DexFacts
                  facts={[
                    [
                      'contest type',
                      <span data-testid="movedex-contest-type">
                        {titleCase(move.contest_type)}
                      </span>,
                    ],
                    [
                      'appeal',
                      <span data-testid="movedex-contest-appeal">
                        {move.contest_effect?.appeal ?? '—'}
                      </span>,
                    ],
                    [
                      'jam',
                      <span data-testid="movedex-contest-jam">
                        {move.contest_effect?.jam ?? '—'}
                      </span>,
                    ],
                    [
                      'super contest appeal',
                      <span data-testid="movedex-super-appeal">
                        {move.super_contest_effect?.appeal ?? '—'}
                      </span>,
                    ],
                  ]}
                />
              )}
              {move.contest_effect?.flavor_text && (
                <p className="subtitle" data-testid="movedex-contest-flavor">
                  {move.contest_effect.flavor_text}
                </p>
              )}
            </DexCard>
          </div>

          <DexCard testId="movedex-card-effect" title="Effect">
            {move.short_effect && (
              <p data-testid="movedex-short-effect">
                <strong>{move.short_effect}</strong>
              </p>
            )}
            <p data-testid="movedex-effect">{move.effect ?? 'No effect text in the bundle.'}</p>
            {move.effect_chance != null && (
              <p className="subtitle" data-testid="movedex-effect-chance">
                Effect chance {move.effect_chance}%
              </p>
            )}
            {move.stat_changes.length > 0 && (
              <p className="subtitle" data-testid="movedex-stat-changes">
                {move.stat_changes
                  .map((s) => `${titleCase(s.stat)} ${s.change > 0 ? '+' : ''}${s.change}`)
                  .join(', ')}
              </p>
            )}
          </DexCard>

          <DexCard
            testId="movedex-card-learners"
            title={`Species that learn it${vgName ? ` · ${vgName}` : ' · all games'}`}
          >
            {/* Keyed so switching move or game remounts rather than showing the
                previous move's list while the next one resolves. */}
            <MoveLearners
              key={`${move.id}|${vgName ?? 'all'}`}
              move={move}
              versionGroup={vgName}
              isAll={isAll}
            />
          </DexCard>
        </>
      )}
    />
  )
}
