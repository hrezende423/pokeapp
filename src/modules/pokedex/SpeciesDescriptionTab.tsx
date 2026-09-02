import { useMemo } from 'react'
import { listVersionGroups } from '../../data'
import type { Species } from '../../data'
import { GameBadge } from './GameBadge'
import { generationLabel } from './speciesFacts'

/**
 * The Description tab: every game's Pokedex entry, in sequence.
 *
 * NO GAME SELECTOR. The flavour text is the whole point of the tab and it is
 * short -- 16 in-scope versions, one paragraph each, all of it already in the
 * eagerly-loaded bundle. Gating it behind a selector meant reading a species'
 * Pokedex history one game at a time; the Bulbapedia-style full sequence is one
 * read. Nothing is fetched to do this, so "all of them" costs nothing that "one
 * of them" did not already cost.
 *
 * ENTRIES ARE GROUPED BY GENERATION, in bundle order (oldest first). The grouping
 * is not decoration: entries change wording between generations far more than
 * between the two versions of one pair, so the generation is the unit a reader is
 * actually comparing.
 *
 * THE GAME NAME IS A COLOURED BADGE, not a small-caps label -- see GameBadge for
 * where the colours come from, and why a version gets a badge where a type never
 * does. Sixteen entries down one column is exactly the case a badge is for.
 *
 * LOCATIONS MOVED OUT, to the Info tab under the stat and evolution charts. A
 * sortable five-column encounter table under sixteen paragraphs of prose was two
 * different kinds of reading in one place, and the facts tab is where a fact
 * belongs. See SpeciesLocations.
 *
 * BIOLOGY IS STILL DEFERRED, as decided -- it needs the Bulbapedia sourcing pass.
 * Nothing is stubbed for it.
 */

/**
 * Every in-scope version that has an entry for this species, oldest first,
 * bucketed by generation.
 *
 * Version order comes from listVersionGroups (generation, then the bundle's own
 * `order`), not from Object.keys on flavor_text -- a JSON object's key order is
 * whatever the build wrote, which is not a promise and is not chronological.
 */
function entriesByGeneration(species: Species) {
  const buckets = new Map<number, { version: string; text: string }[]>()
  for (const group of listVersionGroups()) {
    const gen = group.generation_id ?? 0
    for (const version of group.versions) {
      if (version == null) continue
      const text = species.flavor_text[version]
      if (!text) continue
      const list = buckets.get(gen)
      if (list) list.push({ version, text })
      else buckets.set(gen, [{ version, text }])
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, entries]) => ({ generation, entries }))
}

export function SpeciesDescriptionTab({ species }: { species: Species }) {
  const byGeneration = useMemo(() => entriesByGeneration(species), [species])
  const totalEntries = byGeneration.reduce((n, g) => n + g.entries.length, 0)

  return (
    <div
      className="species-description"
      data-testid="species-description"
      data-flavor-entries={totalEntries}
    >
      <section className="species-info-block" data-testid="species-flavor">
        <h3 className="species-info-heading">
          Pokedex entries
          <span className="species-info-count num">{totalEntries}</span>
        </h3>

        {totalEntries === 0 ? (
          <p className="species-info-caption" data-testid="species-flavor-none">
            No in-scope game carries a Pokedex entry for {species.display_name}.
          </p>
        ) : (
          byGeneration.map((bucket) => (
            <div
              key={bucket.generation}
              className="species-flavor-gen"
              /* NOT species-flavor-gen-N: that matches [data-testid^="species-flavor-"],
                 which is how every reader addresses a per-VERSION entry, so the
                 four group wrappers were being counted as versions. */
              data-testid={`species-flavor-group-${bucket.generation}`}
              data-entries={bucket.entries.length}
            >
              <h4 className="species-flavor-gen-label">{generationLabel(bucket.generation)}</h4>
              <dl className="species-flavor-list">
                {bucket.entries.map((entry) => (
                  <div
                    key={entry.version}
                    className="species-flavor-entry"
                    data-testid={`species-flavor-${entry.version}`}
                  >
                    {/* The dt is the row, the badge inside it is the shape. A dt
                        cannot be an inline-block badge and stay a dt. */}
                    <dt className="species-flavor-version-row">
                      <GameBadge version={entry.version} className="species-flavor-version" />
                    </dt>
                    <dd className="species-flavor-text">{entry.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </section>

      {/* The biology write-up is deliberately absent, not forgotten -- see the
          note at the top of this file and the punch list beside it. */}
    </div>
  )
}
