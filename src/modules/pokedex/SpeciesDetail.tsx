import { useEffect, useMemo, useState } from 'react'
import { TypeBadge } from '../../components/TypeBadge'
import {
  captureRatePercent,
  genderRatio,
  getEggGroup,
  getEncountersForSpecies,
  getEvolutionChain,
  getLearnsetsForSpecies,
  getSpecies,
  listSpecies,
  resolveAbilitiesForGeneration,
  resolveTypesForGeneration,
  ABILITIES_INTRODUCED_IN_GENERATION,
  DEFAULT_ARTWORK_VIEW,
} from '../../data'
import type { ArtworkView, EncounterRow, LearnRow, Species } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { Artwork } from './Artwork'
import { Encounters } from './Encounters'
import { EvolutionTree } from './EvolutionTree'
import { Learnset } from './Learnset'
import { TypeEffectiveness } from './TypeEffectiveness'

const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
  special: 'Special',
}

/** Highest base stat in Gen 1-4 is Blissey's 255 HP; use it to scale the bars. */
const MAX_BASE_STAT = 255

function titleCase(value: string | null): string {
  if (!value) return '—'
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function SpeciesDetail({
  speciesId,
  onSelectSpecies,
}: {
  speciesId: number
  onSelectSpecies?: (id: number) => void
}) {
  const { versionGroup, generation, isAll } = useVersionGroup()
  const species = getSpecies(speciesId)
  const vgName = versionGroup?.name ?? null

  // The four artwork axes live here, not in <Artwork>, because the evolution tree
  // follows the colour choice. Reset per species by the key in <Pokedex>.
  const [view, setView] = useState<ArtworkView>(DEFAULT_ARTWORK_VIEW)

  // Partition loads are tagged with the request they belong to, so readiness is
  // derived rather than reset. Clearing state synchronously in the effect would
  // cascade an extra render and briefly show the previous game's rows.
  const requestKey = `${speciesId}|${vgName ?? 'all'}`
  const [loaded, setLoaded] = useState<{
    key: string
    learnsets: LearnRow[]
    encounters: EncounterRow[]
  } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)

  const variety = useMemo(
    () => species?.varieties.find((v) => v.is_default) ?? species?.varieties[0],
    [species],
  )

  // Must be computed before the early return below: hooks cannot run conditionally.
  const breedingPartners = useBreedingPartners(species, generation)

  // Re-fetches whenever the species OR the version group changes, which is what
  // makes an already-open detail view follow a version-group switch. Under "All"
  // there is no partition to fetch, so nothing is requested.
  useEffect(() => {
    if (vgName == null) return
    let cancelled = false
    Promise.all([
      getLearnsetsForSpecies(speciesId, vgName),
      getEncountersForSpecies(speciesId, vgName),
    ])
      .then(([learn, enc]) => {
        if (!cancelled) setLoaded({ key: requestKey, learnsets: learn, encounters: enc })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFailure({ key: requestKey, message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [speciesId, vgName, requestKey])

  if (!species || !variety) {
    return <p role="alert">Unknown species #{speciesId}.</p>
  }

  const typeIds = resolveTypesForGeneration(variety, generation).map((t) => t.type_id)
  const abilities = resolveAbilitiesForGeneration(variety, generation)
  const ratio = genderRatio(species.gender_rate)
  const chain =
    species.evolution_chain_id != null ? getEvolutionChain(species.evolution_chain_id) : undefined

  const ready = loaded?.key === requestKey ? loaded : null
  const loadError = failure?.key === requestKey ? failure.message : null

  // Only rows for the default form, so a multi-form species does not show the
  // same move several times over.
  const formRows = ready?.learnsets.filter((r) => r.pokemon_id === variety.pokemon_id) ?? []
  const formEncounters = ready?.encounters.filter((r) => r.pokemon_id === variety.pokemon_id) ?? []

  const eggGroups = species.egg_group_ids.map((id) => getEggGroup(id)).filter((g) => g != null)

  /** Learnsets and encounters are per version group, so "All" has no answer. */
  const perGameNote = (
    <p className="subtitle" data-testid="needs-version-group">
      Select a specific game to see this — it differs per version group.
    </p>
  )

  return (
    <article className="detail" data-testid="species-detail" data-species-id={species.id}>
      <section className="card card-head" data-testid="card-head">
        <div className="detail-ident">
          <p className="subtitle">#{String(species.id).padStart(3, '0')}</p>
          <h2 data-testid="detail-name">{species.display_name}</h2>
          <p className="subtitle">{species.genus ?? ''}</p>
          <div className="row-types" data-testid="detail-types">
            {typeIds.map((id) => (
              <TypeBadge key={id} typeId={id} />
            ))}
          </div>
        </div>
        <Artwork species={species} variety={variety} view={view} onChange={setView} />
      </section>

      <div className="card-grid">
        <section className="card" data-testid="card-stats">
          <h3>Base stats</h3>
          <ul className="stat-bars" data-testid="base-stats">
            {variety.stats.map((s) => (
              <li key={s.stat ?? 'unknown'}>
                <span className="stat-name">{STAT_LABELS[s.stat ?? ''] ?? s.stat}</span>
                <span className="stat-track">
                  <span
                    className="stat-fill"
                    style={{ width: `${Math.min(100, (s.base_stat / MAX_BASE_STAT) * 100)}%` }}
                  />
                </span>
                <span className="stat-value">{s.base_stat}</span>
              </li>
            ))}
          </ul>
          <p className="subtitle" data-testid="stat-total">
            Total {variety.stats.reduce((sum, s) => sum + s.base_stat, 0)}
          </p>

          <h4>Profile</h4>
          <ul className="stats">
            <li>
              <span>growth rate</span>
              <strong data-testid="growth-rate">{titleCase(species.growth_rate)}</strong>
            </li>
            <li>
              <span>catch rate</span>
              <strong data-testid="catch-rate">
                {species.capture_rate ?? '—'}
                {species.capture_rate != null && (
                  <span className="subtitle"> (~{captureRatePercent(species.capture_rate)}%)</span>
                )}
              </strong>
            </li>
            <li>
              <span>base XP</span>
              <strong data-testid="base-xp">{variety.base_experience ?? '—'}</strong>
            </li>
            <li>
              <span>gender ratio</span>
              <strong data-testid="gender-ratio">
                {ratio ? `${ratio.male}% / ${ratio.female}%` : 'Genderless'}
              </strong>
            </li>
            <li>
              <span>height</span>
              <strong>{variety.height != null ? `${variety.height / 10} m` : '—'}</strong>
            </li>
            <li>
              <span>weight</span>
              <strong>{variety.weight != null ? `${variety.weight / 10} kg` : '—'}</strong>
            </li>
          </ul>
        </section>

        <section className="card" data-testid="card-traits">
          <h3>Types</h3>
          <div className="row-types" data-testid="traits-types">
            {typeIds.map((id) => (
              <TypeBadge key={id} typeId={id} />
            ))}
          </div>

          <h4>Abilities</h4>
          {abilities.length === 0 ? (
            <p className="subtitle" data-testid="abilities-none">
              {generation < ABILITIES_INTRODUCED_IN_GENERATION
                ? `Abilities did not exist in Generation ${generation}.`
                : 'No abilities in this generation.'}
            </p>
          ) : (
            <ul className="ability-list" data-testid="abilities">
              {abilities.map((a) => (
                <li key={a.slot} data-testid={`ability-${a.ability.name}`}>
                  <strong>{a.ability.display_name}</strong>
                  {a.is_hidden && <span className="subtitle"> (hidden)</span>}
                  <p className="subtitle">{a.ability.short_effect ?? a.ability.effect ?? ''}</p>
                </li>
              ))}
            </ul>
          )}

          <h4>Egg groups &amp; breeding</h4>
          <p data-testid="egg-groups">
            {eggGroups.length > 0 ? eggGroups.map((g) => g.display_name).join(', ') : 'none'}
          </p>
          <p className="subtitle">
            Hatch counter {species.hatch_counter ?? '—'} · base friendship{' '}
            {species.base_happiness ?? '—'}
          </p>
          <p className="subtitle" data-testid="breeding-partners">
            {eggGroups.some((g) => g.name === 'no-eggs')
              ? 'Cannot breed.'
              : `${breedingPartners} compatible species share an egg group in Generation ${generation}.`}
          </p>
        </section>
      </div>

      <section className="card" data-testid="card-effectiveness">
        <h3>Type effectiveness · Generation {generation}</h3>
        <TypeEffectiveness typeIds={typeIds} generation={generation} />
      </section>

      <section className="card" data-testid="card-evolution">
        <h3>Evolution</h3>
        {chain ? (
          <EvolutionTree
            chain={chain.chain}
            currentId={species.id}
            shiny={view.shiny}
            onSelect={onSelectSpecies}
          />
        ) : (
          <p className="subtitle">No evolution chain data.</p>
        )}
      </section>

      <div className="card-grid">
        <section className="card" data-testid="card-learnset">
          <h3>Learnset{vgName ? ` · ${vgName}` : ''}</h3>
          {isAll ? (
            perGameNote
          ) : !ready && !loadError ? (
            <p className="subtitle" data-testid="learnset-loading">
              Loading learnset…
            </p>
          ) : (
            <Learnset rows={formRows} versionGroup={vgName ?? ''} />
          )}
        </section>

        <section className="card" data-testid="card-encounters">
          <h3>Encounters{vgName ? ` · ${vgName}` : ''}</h3>
          {loadError && <p role="alert">{loadError}</p>}
          {isAll ? (
            perGameNote
          ) : !ready && !loadError ? (
            <p className="subtitle" data-testid="encounters-loading">
              Loading encounters…
            </p>
          ) : (
            <Encounters rows={formEncounters} versionGroup={vgName ?? ''} />
          )}
        </section>
      </div>
    </article>
  )
}

/**
 * Count of species that share at least one egg group, within the current
 * generation. Genderless and the no-eggs group are excluded from the pool.
 */
function useBreedingPartners(species: Species | undefined, generation: number): number {
  return useMemo(() => {
    if (!species) return 0
    const groups = new Set(species.egg_group_ids)
    if (groups.size === 0) return 0
    return listSpecies().filter((other) => {
      if (other.id === species.id) return false
      const gen = other.generation_id ?? 99
      if (gen > generation) return false
      return other.egg_group_ids.some((id) => groups.has(id))
    }).length
  }, [species, generation])
}
