import { useState } from 'react'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import { artworkMode, genderAvailable, motionAvailable, resolveArtworkUrl } from '../../data'
import type { ArtworkView, Species, Variety } from '../../data'

interface Props {
  species: Species
  variety: Variety
  view: ArtworkView
  onChange: (next: ArtworkView) => void
}

/** Why a control is greyed out, so the UI never just silently drops it. */
const NO_MOTION = 'Animation exists only for the custom artwork; in-game sprites are static.'
const NO_GENDER_ARTWORK = 'Official artwork has no gender-specific version.'
const NO_GENDER_SPECIES = 'This species has no gender-specific image in this view.'

/**
 * The artwork panel and the four switches that drive it.
 *
 * State is owned by the caller so the evolution tree can follow the colour
 * choice. Availability is resolved per combination against the real data (see
 * data/artwork.ts) rather than a blanket rule, so an unavailable gender is
 * disabled instead of falling back to the male image under a "Female" label.
 *
 * Nothing is preloaded: each variant is fetched the first time it is shown and
 * then served from the browser/service-worker cache, so toggling back and forth
 * issues no further requests.
 */
export function Artwork({ species, variety, view, onChange }: Props) {
  const [failed, setFailed] = useState<string | null>(null)

  const mode = artworkMode(view)
  const canMotion = motionAvailable(view)
  const canGender = genderAvailable(species, variety, view)
  const src = resolveArtworkUrl(species, variety, view)

  // A disabled gender switch must also stop *claiming* female: the switch reads
  // its position from the effective gender, not the stored one.
  const effectiveGender = canGender ? view.gender : 'male'

  const genderReason =
    view.source === 'artwork' && view.motion === 'static' ? NO_GENDER_ARTWORK : NO_GENDER_SPECIES

  return (
    <div className="artwork">
      <div className="artwork-frame" data-mode={mode}>
        {src ? (
          <img
            key={src}
            src={src}
            alt={`${species.display_name}${view.shiny ? ' (shiny)' : ''}, ${
              mode === 'in-game-static' ? 'in-game sprite' : 'official artwork'
            }${view.motion === 'animated' && canMotion ? ', animated' : ''}${
              canGender ? `, ${effectiveGender}` : ''
            }`}
            data-testid="artwork-img"
            data-mode={mode}
            data-source={view.source}
            data-src-kind={canMotion ? view.motion : 'static'}
            data-shiny={view.shiny}
            data-gender={canGender ? effectiveGender : 'n/a'}
            onError={() => setFailed(src)}
            onLoad={() => setFailed(null)}
          />
        ) : (
          <p className="subtitle" data-testid="artwork-missing">
            No artwork available.
          </p>
        )}
        {failed === src && (
          <p role="alert" data-testid="artwork-error">
            Artwork failed to load.
          </p>
        )}
      </div>

      <div className="artwork-toggles" data-testid="artwork-toggles">
        <ToggleSwitch
          id="source"
          label="Source"
          offLabel="In-game"
          onLabel="Artwork"
          checked={view.source === 'artwork'}
          onChange={(on) => onChange({ ...view, source: on ? 'artwork' : 'in-game' })}
        />
        <ToggleSwitch
          id="shiny"
          label="Color"
          offLabel="Regular"
          onLabel="Shiny"
          checked={view.shiny}
          onChange={(on) => onChange({ ...view, shiny: on })}
        />
        <ToggleSwitch
          id="motion"
          label="Motion"
          offLabel="Static"
          onLabel="Animated"
          // Forced to Static when the source has no animation, rather than
          // remembering a choice the current view cannot honour.
          checked={canMotion && view.motion === 'animated'}
          disabled={!canMotion}
          disabledReason={NO_MOTION}
          onChange={(on) => onChange({ ...view, motion: on ? 'animated' : 'static' })}
        />
        <ToggleSwitch
          id="gender"
          label="Gender"
          offLabel="Male"
          onLabel="Female"
          checked={effectiveGender === 'female'}
          disabled={!canGender}
          disabledReason={genderReason}
          onChange={(on) => onChange({ ...view, gender: on ? 'female' : 'male' })}
        />
      </div>
    </div>
  )
}
