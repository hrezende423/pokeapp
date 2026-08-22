import { useState } from 'react'
import { availableSpriteGenders, getSpriteUrl, type SpriteGender } from '../../data/sprites'
import type { Species, Variety } from '../../data'

interface Props {
  species: Species
  variety: Variety
}

/**
 * Artwork panel with three independent toggles.
 *
 * Static art comes from the PokeAPI sprite URLs already in the bundle
 * (front_default / front_shiny). Animated art comes from the pokeapp-sprites
 * release assets, which are the only source with gendered variants — the bundle
 * carries no gendered *static* sprite, so the gender toggle only changes the
 * animated view. That is a data limitation, not an oversight.
 *
 * Nothing here is preloaded: each variant is fetched the first time it is shown
 * and then served from the browser/service-worker cache, so toggling back and
 * forth issues no further requests.
 */
export function Artwork({ species, variety }: Props) {
  const [shiny, setShiny] = useState(false)
  const [animated, setAnimated] = useState(false)
  const [gender, setGender] = useState<SpriteGender>('male')
  const [failed, setFailed] = useState<string | null>(null)

  const genders = availableSpriteGenders(species.has_gender_differences)
  const hasGenderToggle = genders.length > 0

  const animatedUrl = getSpriteUrl(species.id, {
    shiny,
    gender: hasGenderToggle ? gender : undefined,
    hasGenderDifference: species.has_gender_differences,
  })
  const staticUrl = shiny ? variety.sprites.front_shiny : variety.sprites.front_default
  const src = animated ? animatedUrl : staticUrl

  return (
    <div className="artwork">
      <div className="artwork-frame">
        {src ? (
          <img
            key={src}
            src={src}
            alt={`${species.display_name}${shiny ? ' (shiny)' : ''}${
              animated ? ', animated' : ''
            }${hasGenderToggle ? `, ${gender}` : ''}`}
            data-testid="artwork-img"
            data-src-kind={animated ? 'animated' : 'static'}
            data-shiny={shiny}
            data-gender={hasGenderToggle ? gender : 'n/a'}
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

      <div className="artwork-toggles">
        <button
          type="button"
          data-testid="toggle-shiny"
          aria-pressed={shiny}
          className={shiny ? 'chip chip-active' : 'chip'}
          onClick={() => setShiny((v) => !v)}
        >
          {shiny ? 'Shiny' : 'Regular'}
        </button>
        <button
          type="button"
          data-testid="toggle-animated"
          aria-pressed={animated}
          className={animated ? 'chip chip-active' : 'chip'}
          onClick={() => setAnimated((v) => !v)}
        >
          {animated ? 'Animated' : 'Static'}
        </button>
        {hasGenderToggle && (
          <button
            type="button"
            data-testid="toggle-gender"
            aria-pressed={gender === 'female'}
            className={gender === 'female' ? 'chip chip-active' : 'chip'}
            onClick={() => setGender((g) => (g === 'male' ? 'female' : 'male'))}
            title="Gendered artwork exists only for the animated sprites"
          >
            {gender === 'male' ? 'Male' : 'Female'}
          </button>
        )}
      </div>
      {hasGenderToggle && !animated && (
        <p className="subtitle" data-testid="gender-static-note">
          Gendered artwork is animated-only.
        </p>
      )}
    </div>
  )
}
