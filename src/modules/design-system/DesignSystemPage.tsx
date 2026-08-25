import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../../components/ds/Button'
import { EvRow, EvTotal, MoveSlotGrid, StatList, StatRow } from '../../components/ds/DataRows'
import { HeroDetailCard } from '../../components/ds/HeroDetailCard'
import { LedgerRow } from '../../components/ds/LedgerRow'
import { FormSectionLabel, SearchFilterRow, Tabs } from '../../components/ds/Navigation'
import { SelectField } from '../../components/ds/SelectField'
import { SpeciesDetailPanel } from '../../components/ds/SpeciesDetailPanel'
import { SpeciesGridCard } from '../../components/ds/SpeciesGridCard'
import { TextField } from '../../components/ds/TextField'
import { Toggle } from '../../components/ds/Toggle'
import '../../components/ds/ds.css'
import {
  evolutionThumbUrl,
  getSpecies,
  getType,
  resolveAbilitiesForGeneration,
  resolveTypesForGeneration,
} from '../../data'
import type { Species, Variety } from '../../data'
import {
  loadSpeciesBackgrounds,
  speciesBackground,
  type SpeciesBackground,
} from '../../data/speciesBackgrounds'

/**
 * Live reference for the design-system components, the in-app equivalent of
 * ds-component-library.html and ds-form-field-states.html -- with two
 * differences that make it worth having: it renders the real React components
 * rather than static HTML, and it feeds them real bundle data and real artwork,
 * which is how every one of these components was validated in the first place
 * (DESIGN-SYSTEM.md §1, step 5).
 *
 * Light and dark are shown side by side by putting data-theme on a wrapper, which
 * is exactly the contract design-tokens.css declares ("on :root or any ancestor")
 * -- so the pairing also checks that the attribute works on a subtree.
 *
 * This page does NOT restyle the existing dex modules. Whether those get
 * retrofitted to this system is still an open item in design-tokens.json, and it
 * is not a decision to make silently while wiring up tokens.
 */

const GEN = 4

/** The three species the design docs themselves use as examples. */
const EXAMPLES = [6, 94, 197]

function defaultVariety(species: Species): Variety {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

function typeNames(variety: Variety): string[] {
  return resolveTypesForGeneration(variety, GEN)
    .map((t) => getType(t.type_id)?.name)
    .filter((n): n is string => n != null)
}

function firstAbility(variety: Variety): string | null {
  return resolveAbilitiesForGeneration(variety, GEN)[0]?.ability.display_name ?? null
}

function Comp({ name, note, children }: { name: string; note?: string; children: ReactNode }) {
  return (
    <section className="ds-comp">
      <p className="ds-comp-name">{name}</p>
      {children}
      {note && <p className="ds-comp-note">{note}</p>}
    </section>
  )
}

/** One demo rendered twice, once per theme, via data-theme on the wrapper. */
function Pair({ children }: { children: ReactNode }) {
  return (
    <div className="ds-demo-pair">
      {(['light', 'dark'] as const).map((theme) => (
        <div key={theme} data-theme={theme} className="ds-demo-panel" data-demo-theme={theme}>
          <span className="ds-demo-panel-label">{theme}</span>
          {children}
        </div>
      ))}
    </div>
  )
}

function Category({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ds-cat">
      <h2 className="ds-cat-title">{title}</h2>
      {children}
    </div>
  )
}

export function DesignSystemPage() {
  const species = useMemo(
    () => EXAMPLES.map((id) => getSpecies(id)).filter((s): s is Species => s != null),
    [],
  )

  const [caught, setCaught] = useState(true)
  const [tab, setTab] = useState('Stats')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [evs, setEvs] = useState({ Attack: 252, Speed: 252, HP: 4 })
  const [tints, setTints] = useState<Record<number, SpeciesBackground | null> | null>(null)
  const [tintError, setTintError] = useState<string | null>(null)

  // The tint table is asset metadata in the sprites repo, so it is fetched rather
  // than bundled. Failure falls back to the standard (untinted) mode and says so,
  // instead of rendering --surface and calling it the tinted mode.
  useEffect(() => {
    let cancelled = false
    loadSpeciesBackgrounds()
      .then(() => {
        if (cancelled) return
        setTints(Object.fromEntries(EXAMPLES.map((id) => [id, speciesBackground(id)])))
      })
      .catch((err: unknown) => {
        if (!cancelled) setTintError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const evTotal = Object.values(evs).reduce((a, b) => a + b, 0)
  const hero = species[0]
  const heroVariety = hero ? defaultVariety(hero) : null

  return (
    <div className="ds-root ds-page" data-testid="dex-designsystem">
      <header>
        <h1 className="ds-cat-title" data-testid="ds-title">
          Design system
        </h1>
        <p className="ds-comp-note">
          The fourteen validated components from DESIGN-SYSTEM.md §5 plus the form-field states from
          §10, built as React components on the tokens in src/design-tokens.css, rendered with real
          bundle data. Light and dark come from data-theme on each panel.
        </p>
      </header>

      <Category title="Actions">
        <Comp name="Button">
          <Pair>
            <div className="ds-demo-row">
              <Button>Add to team</Button>
              <Button variant="secondary">Compare</Button>
            </div>
          </Pair>
        </Comp>

        <Comp
          name="Toggle (binary state)"
          note="A binary indicator, not a segmented control. Nothing in the app tracks caught state yet, so this is local state on the page."
        >
          <Pair>
            <div className="ds-demo-row">
              <Toggle on={caught} label={caught ? 'Caught' : 'Not caught'} onChange={setCaught} />
            </div>
          </Pair>
        </Comp>
      </Category>

      <Category title="Form fields">
        <Comp name="Text input — the five states">
          <Pair>
            <div className="ds-demo-row">
              <TextField label="Nickname" placeholder="Charizard" helper="Optional" />
              <TextField
                label="Nickname"
                state="focus"
                defaultValue="Char"
                helper="Optional"
                readOnly
              />
              <TextField label="Nickname" state="disabled" defaultValue="Charizard" />
              <TextField
                label="Nickname"
                state="error"
                defaultValue="Charizarddddddddd"
                error="Max 12 characters"
                readOnly
              />
              <TextField label="Nickname" state="success" defaultValue="Char" readOnly />
            </div>
          </Pair>
        </Comp>

        <Comp
          name="Select"
          note="A styled native select with a unicode chevron, not an overlay menu."
        >
          <Pair>
            <SelectField label="Ability" options={['Blaze', 'Solar Power']} />
          </Pair>
        </Comp>

        <Comp
          name="EV / stat editable row"
          note="Open item from §5: sliders were requested for EV/IV entry and are not designed yet, so this plain-number version is a placeholder, not the answer. The running total is plain text — never a bar."
        >
          <Pair>
            <div style={{ width: 220 }}>
              <StatList>
                {Object.entries(evs).map(([label, value]) => (
                  <EvRow
                    key={label}
                    label={label}
                    value={value}
                    onChange={(next) => setEvs((prev) => ({ ...prev, [label]: next }))}
                  />
                ))}
              </StatList>
              <EvTotal total={evTotal} />
            </div>
          </Pair>
        </Comp>

        <Comp name="Move-slot tile">
          <Pair>
            <MoveSlotGrid moves={['Flamethrower', 'Dragon Claw', 'Roost', null]} />
          </Pair>
        </Comp>

        <Comp name="Form section label">
          <Pair>
            <FormSectionLabel>Battle setup</FormSectionLabel>
          </Pair>
        </Comp>
      </Category>

      <Category title="Navigation">
        <Comp name="Tabs">
          <Pair>
            <Tabs tabs={['Stats', 'Moves', 'Evolution']} active={tab} onSelect={setTab} />
          </Pair>
        </Comp>

        <Comp
          name="Search / filter row"
          note="Filters are middot-separated plain text: no chip, no pill container. That de-chroming was deliberate, alongside the type-label decision."
        >
          <Pair>
            <SearchFilterRow
              value={search}
              onValueChange={setSearch}
              filters={['All', 'Fire', 'Water']}
              activeFilter={filter}
              onFilterChange={setFilter}
            />
          </Pair>
        </Comp>
      </Category>

      <Category title="Data display">
        <Comp name="Data table stat row">
          <Pair>
            <div style={{ width: 220 }}>
              <StatList>
                {(heroVariety?.stats ?? []).slice(0, 3).map((s) => (
                  <StatRow key={s.stat} label={s.stat ?? '—'} value={s.base_stat} />
                ))}
              </StatList>
            </div>
          </Pair>
        </Comp>

        <Comp
          name="Ledger list row"
          note="The dex number's opacity ties to caught / not-caught (100% / 40%) — the app's only tracked binary state, per §8. The artwork never dims."
        >
          <Pair>
            <div className="ds-ledger-list" style={{ width: 300 }}>
              {species.map((s, i) => {
                const v = defaultVariety(s)
                return (
                  <LedgerRow
                    key={s.id}
                    dexNumber={s.id}
                    name={s.display_name}
                    types={typeNames(v)}
                    spriteUrl={v.sprites.front_default}
                    caught={i === 0}
                  />
                )
              })}
            </div>
          </Pair>
        </Comp>

        <Comp
          name="Species grid card"
          note="A ghost card: no border, no fill. Chosen over four other treatments in a real five-way comparison. Dimming is not applied here — §5 leaves the grid-scale dim question open."
        >
          <Pair>
            <div className="ds-grid">
              {species.map((s) => {
                const v = defaultVariety(s)
                return (
                  <SpeciesGridCard
                    key={s.id}
                    dexNumber={s.id}
                    name={s.display_name}
                    types={typeNames(v)}
                    ability={firstAbility(v)}
                    artworkUrl={evolutionThumbUrl(v, false)}
                  />
                )
              })}
            </div>
          </Pair>
        </Comp>
      </Category>

      <Category title="Composite / screen-level">
        <Comp name="Hero detail card">
          {hero && heroVariety && (
            <Pair>
              <HeroDetailCard
                dexNumber={hero.id}
                name={hero.display_name}
                genus={hero.genus}
                types={typeNames(heroVariety)}
                era={`Gen ${hero.generation_id ?? GEN}`}
                heightM={heroVariety.height != null ? heroVariety.height / 10 : null}
                weightKg={heroVariety.weight != null ? heroVariety.weight / 10 : null}
                artworkUrl={evolutionThumbUrl(heroVariety, false)}
                stats={heroVariety.stats.map((s) => ({
                  label: s.stat ?? '—',
                  value: s.base_stat,
                }))}
                primaryAction="Add to team"
                secondaryAction="Compare"
              />
            </Pair>
          )}
        </Comp>

        <Comp
          name="Species detail page — standard background"
          note="One constant --surface for every species. Kept as a supported simple mode, not deprecated."
        >
          {hero && heroVariety && (
            <Pair>
              <SpeciesDetailPanel
                dexNumber={hero.id}
                name={hero.display_name}
                genus={hero.genus}
                types={typeNames(heroVariety)}
                artworkUrl={evolutionThumbUrl(heroVariety, false)}
                mode="standard"
                theme="light"
              >
                <div className="ds-detail-section">
                  <StatList>
                    {heroVariety.stats.map((s) => (
                      <StatRow key={s.stat} label={s.stat ?? '—'} value={s.base_stat} />
                    ))}
                  </StatList>
                </div>
              </SpeciesDetailPanel>
            </Pair>
          )}
        </Comp>

        <Comp
          name="Species detail page — species-tinted background"
          note="Art-directed per illustration, from species-background-colors.json in the pokeapp-sprites repo — not derived from type colours. Gengar and Umbreon are here because §5 names them: a saturated purple rather than a pale lavender, and a warm grey-gold that stays legible behind near-black artwork."
        >
          {tintError && (
            <p className="ds-comp-note" role="alert" data-testid="ds-tint-error">
              Tint table unavailable ({tintError}) — falling back to the standard mode.
            </p>
          )}
          <div className="ds-demo-pair">
            {(['light', 'dark'] as const).map((theme) =>
              species.slice(1).map((s) => {
                const v = defaultVariety(s)
                return (
                  <div
                    key={`${theme}-${s.id}`}
                    data-theme={theme}
                    className="ds-demo-panel"
                    data-demo-theme={theme}
                  >
                    <span className="ds-demo-panel-label">
                      {theme} · {s.display_name}
                    </span>
                    <SpeciesDetailPanel
                      dexNumber={s.id}
                      name={s.display_name}
                      genus={s.genus}
                      types={typeNames(v)}
                      artworkUrl={evolutionThumbUrl(v, false)}
                      mode={tints?.[s.id] ? 'tinted' : 'standard'}
                      tint={tints?.[s.id] ?? null}
                      theme={theme}
                    >
                      <div className="ds-detail-section">
                        <StatList>
                          {v.stats.slice(0, 4).map((st) => (
                            <StatRow key={st.stat} label={st.stat ?? '—'} value={st.base_stat} />
                          ))}
                        </StatList>
                      </div>
                    </SpeciesDetailPanel>
                  </div>
                )
              }),
            )}
          </div>
        </Comp>
      </Category>

      <Category title="Not built here, on purpose">
        <ul className="ds-comp-note" data-testid="ds-open-items">
          <li>
            The 81 components in §7 / ds-component-library-full95.html. That pass is documented as
            consistent token application rather than multi-round validation, and none of them was
            named in this handoff.
          </li>
          <li>
            The solid-square type badge. It is sanctioned and has a radius token, but no fill or
            text colour is specified anywhere, so it would be a guess.
          </li>
          <li>
            Anything needing a status-green (a non-form "synced" style indicator). Explicitly still
            open in design-tokens.json.
          </li>
          <li>
            The caught/not-caught Poké Ball icon, the 17 type glyphs, and the other custom icons on
            the still-searching list — the toggle uses its track and thumb only.
          </li>
          <li>
            Retrofitting the existing dex modules onto this system. Still an open item; the tokens
            are loaded app-wide but no existing screen was restyled.
          </li>
        </ul>
      </Category>
    </div>
  )
}
