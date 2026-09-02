/**
 * The per-game colour palette, contrast-corrected per theme.
 *
 * WHY THIS SCRIPT EXISTS: PokeAPI has no colour for a version. `version.json`
 * carries id / name / names / version_group and nothing else, and neither does
 * version-groups.json in this app's bundle -- audited before any of this was
 * built. So "does each game have an associated colour?" is answered NO by the
 * data and YES by the games: every one of them has a box-art colour that a
 * reader recognises, and the community's version-colour set is the de-facto
 * table. Those base hexes are the input below; they are recognisable and they
 * are also, mostly, illegible as text on either of this app's surfaces.
 *
 * So each one is corrected the way the type palette already was
 * (design-tokens.css, type-color-community-dark-mode-override): scale all three
 * channels equally -- which preserves the hue exactly -- until the colour clears
 * 4:1 against the surface it will sit on. Darken for light mode, lighten for
 * dark mode. A badge tints its own background with the same colour at 12%, so
 * the ratio that actually matters is text against THAT, and that is what is
 * measured and printed here.
 *
 * Run: node scripts/calibrate-game-colors.mjs
 * It prints the two CSS blocks to paste into design-tokens.css; it does not
 * write them, so a palette change is always a reviewed diff.
 */

const FLOOR = 4.0
const TINT = 0.12

/** The community version-colour set, plus the two Gamecube titles it omits. */
const BASE = {
  red: '#ff1111',
  blue: '#1111ff',
  yellow: '#ffd733',
  gold: '#daa520',
  silver: '#c0c0c0',
  crystal: '#4fd9ff',
  ruby: '#a00000',
  sapphire: '#0000a0',
  emerald: '#00a000',
  firered: '#ff7327',
  leafgreen: '#00dd00',
  diamond: '#aaaaff',
  pearl: '#ffaaaa',
  platinum: '#999999',
  heartgold: '#b69e00',
  soulsilver: '#c0c0c0',
  // Not in the community set: Colosseum's logo bronze and XD's violet.
  colosseum: '#c87137',
  xd: '#7b3fa0',
  // The Japanese-only releases the bundle carries as separate versions.
  'red-japan': '#ff1111',
  'green-japan': '#00a000',
  'blue-japan': '#1111ff',
}

const SURFACE = { light: '#fafafa', dark: '#141414' }

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const lin = (v) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t)

/**
 * Two stages, in this order:
 *
 *  1. Scale all three channels by one factor. This keeps the hue EXACTLY, so
 *     Crystal stays the community cyan and Gold the community amber, only dark
 *     or light enough to read. k < 1 darkens (light mode), k > 1 lightens.
 *  2. If the hue cannot clear the floor by scaling at all, blend toward the
 *     surface's ink instead -- white on dark, black on light.
 *
 * Stage 2 is not a fallback for awkward cases, it is a fact about blue: pure
 * #1111ff has almost all of its luminance in the 7.2%-weighted channel, so
 * scaling it up saturates that channel at 2.3:1 and stops. Every readable blue
 * on black is a DESATURATED one -- which is exactly what the community palette
 * itself did for --type-water (#6890f0 on dark, not #6890f0 scaled). Blue,
 * Sapphire and Blue (JP) are the three that need it.
 */
function correct(base, bg, direction) {
  const rgb = hex(base)
  const bgRgb = hex(bg)
  const tinted = mix(bgRgb, rgb, TINT)
  if (ratio(rgb, tinted) >= FLOOR) return { rgb, how: 'as published', r: ratio(rgb, tinted) }

  for (let step = 1; step <= 400; step++) {
    const k = direction === 'darken' ? 1 - step / 400 : 1 + (step / 400) * 3
    const next = rgb.map((v) => Math.min(255, Math.max(0, v * k)))
    if (ratio(next, tinted) >= FLOOR) {
      return { rgb: next, how: `x${k.toFixed(3)}`, r: ratio(next, tinted) }
    }
  }

  const ink = direction === 'darken' ? [0, 0, 0] : [255, 255, 255]
  for (let step = 1; step <= 100; step++) {
    const t = step / 100
    const next = mix(rgb, ink, t)
    if (ratio(next, tinted) >= FLOOR) {
      return {
        rgb: next,
        how: `${direction === 'darken' ? 'shade' : 'tint'} ${Math.round(t * 100)}%`,
        r: ratio(next, tinted),
      }
    }
  }
  return { rgb: ink, how: 'ink', r: ratio(ink, tinted) }
}

for (const mode of ['light', 'dark']) {
  const bg = SURFACE[mode]
  console.log(
    `\n/* --- ${mode}: game colours, >=${FLOOR}:1 against a ${TINT * 100}% tint of #${bg.slice(1)} --- */`,
  )
  const lines = []
  for (const [game, base] of Object.entries(BASE)) {
    const out = correct(base, bg, mode === 'light' ? 'darken' : 'lighten')
    lines.push({ game, base, hex: toHex(out.rgb), how: out.how, r: out.r })
  }
  for (const l of lines) {
    console.log(
      `  --game-${l.game}: ${l.hex};`.padEnd(34) + ` /* ${l.base} ${l.how}, ${l.r.toFixed(2)}:1 */`,
    )
  }
  const untouched = lines.filter((l) => l.how === 'as published').length
  console.log(`  /* ${untouched}/${lines.length} used the community hex unchanged */`)
}
