import { IconGenderFemale, IconGenderMale } from '@tabler/icons-react'

/**
 * ♂ / ♀ drawn as Tabler icons sized and seated like a capital letter (owner,
 * 2026-10-11: "species, gender sign and level are misaligned").
 *
 * IBM Plex has no U+2642 / U+2640, so the characters fell back to whatever the
 * system had -- Segoe UI Symbol on Windows, whose circle hangs below the
 * baseline at a different weight; an emoji on some phones. The DOM said the row
 * shared one baseline and it did; the GLYPH was the misalignment. An icon has
 * the same box on every machine.
 *
 * Geometry: the 24-unit Tabler box at 0.95em puts the ink (units 3-21) at
 * ~0.71em, Plex's cap height, and `vertical-align: -0.12em` drops the box by
 * its bottom padding so the ink sits ON the baseline like a letter.
 *
 * The character stays in the DOM, visually hidden: a screen reader still hears
 * "male sign", and text read off the page (search, the suites) is unchanged.
 */
export function GenderSign({ sign }: { sign: '♂' | '♀' }) {
  const Icon = sign === '♂' ? IconGenderMale : IconGenderFemale
  return (
    <span className="gender-sign" data-sign={sign === '♂' ? 'male' : 'female'}>
      <Icon className="gender-sign-icon" stroke={1.75} aria-hidden focusable="false" />
      <span className="visually-hidden">{sign}</span>
    </span>
  )
}
