/**
 * Resolves the Figma frames' drawing scale from the real bundled font.
 *
 * The MainPage frames are 1860px wide, which is not CSS px. Every length in the
 * grid depends on the divisor, and the two candidates were 2.0 (the conventional
 * 2x export scale) and 2.23 (the scale at which the type lands on the locked
 * token sizes). Guessed glyph advances could not separate them.
 *
 * This measures the actual advance width of each string Figma's text nodes
 * contain, in the actual self-hosted IBM Plex Sans, and inverts it: a node
 * whose width is W raw units, drawn in a face whose advance for that string is
 * `a` em, was set at W/a raw px. Dividing that by the candidate scale gives the
 * CSS font size the design implies -- and only one candidate can land on the
 * token scale (38 / 20 / 14 / 11 / 10).
 *
 * Usage: node scripts/calibrate-scale.mjs
 */

import { chromium } from 'playwright'
import { startPreviewServer } from './lib/devServer.mjs'

const PORT = 4194

// Every text node in MainPage-Light whose string is unambiguous, from
// get_metadata. Widths are raw Figma units.
//
// Row 1 (container-dex-row 9:163): cards at x=189 / 707 / 1225 are Bulbasaur,
// Ivysaur, Venusaur. Row 2 (11:217): Quagsire, Espeon, Umbreon.
const NODES = [
  // --- card names (the reference renders these heavier than the number)
  { role: 'card name', text: 'Bulbasaur', raw: 153, weights: [600, 700] },
  { role: 'card name', text: 'Ivysaur', raw: 112, weights: [600, 700] },
  { role: 'card name', text: 'Venusaur', raw: 145, weights: [600, 700] },
  { role: 'card name', text: 'Quagsire', raw: 138, weights: [600, 700] },
  { role: 'card name', text: 'Espeon', raw: 114, weights: [600, 700] },
  { role: 'card name', text: 'Umbreon', raw: 141, weights: [600, 700] },
  // --- ability line (regular, secondary colour)
  { role: 'ability', text: 'Overgrow', raw: 111, weights: [400] },
  { role: 'ability', text: 'Damp · Water Absorb', raw: 242, weights: [400] },
  // --- nav labels
  { role: 'nav label', text: 'Pokeapp', raw: 134, weights: [400, 600] },
  { role: 'nav label', text: 'Pokedex', raw: 132, weights: [400, 600] },
  { role: 'nav label', text: 'Team', raw: 83, weights: [400, 600] },
  { role: 'nav label', text: 'Notes', raw: 90, weights: [400, 600] },
  { role: 'nav label', text: 'Tools', raw: 81, weights: [400, 600] },
  // --- dex numbers. Figma gives #0001/#0002/#0003 widths of 96/100/101, which
  //     are NOT equal -- so the reference draws these with proportional digits,
  //     not the tabular/mono face. Measured proportionally to match.
  { role: 'dex number', text: '#0001', raw: 96, weights: [400] },
  { role: 'dex number', text: '#0002', raw: 100, weights: [400] },
  { role: 'dex number', text: '#0003', raw: 101, weights: [400] },
]

// Type rows carry uppercase + tracking, and Figma's single text node spaces the
// middot differently from our CSS, so they are measured but not used to decide.
const TYPE_NODES = [
  { text: 'GRASS · POISON', raw: 194 },
  { text: 'WATER · GROUND', raw: 207 },
  { text: 'PSYCHIC', raw: 108 },
  { text: 'DARK', raw: 66 },
]

const TOKEN_SIZES = [38, 20, 14, 11, 10]

/*
  ITS SERVER COMES FROM scripts/lib/devServer.mjs, like every other script here
  that needs one. It used to start its own server through a shell and treat "the
  URL answered" as ready, which left two holes a calibration tool can least
  afford:

    THE SHELL SAT BETWEEN THIS SCRIPT AND ITS SERVER. On Windows it started
    cmd.exe, which started npx, which started vite. A tree-kill was in place so
    a normal run did reap it -- but the shell was never necessary.

    READINESS WAS "SOMETHING ANSWERED", which is the one that actually bit. With
    the port already held, --strictPort makes the new vite exit at once and
    nothing here watched for that, so the poll succeeded against the OTHER
    server and this tool measured it. Demonstrated rather than theorised: run
    with a foreign server on this port it printed a full report of measurements
    taken from a build it never started, and exited 0. For a tool whose whole
    output is measured constants, silently-stale numbers are the worst failure
    available.

  startPreviewServer runs vite directly with no shell, REFUSES to start when the
  port already answers, watches the child's exit so a --strictPort bail is a loud
  error instead of a wrong answer, and byte-matches the served index.html
  against the local dist/index.html before returning. Run `npm run build` first.
*/
const preview = await startPreviewServer({ port: PORT })
/* The server's own url, not a string rebuilt from the port. */
const APP_URL = preview.url

const nearestToken = (px) =>
  TOKEN_SIZES.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a))

try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })
  // Both faces must actually be loaded, or every advance below is a fallback's.
  for (const w of [400, 600, 700]) {
    await page.waitForFunction(
      (weight) => document.fonts.check(`${weight} 100px "IBM Plex Sans"`),
      w,
      { timeout: 30000 },
    )
  }

  const measured = await page.evaluate(
    ({ nodes, typeNodes }) => {
      const probe = document.createElement('span')
      probe.style.cssText =
        'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0;' +
        "font-family:'IBM Plex Sans';font-size:100px;letter-spacing:normal;"
      document.body.appendChild(probe)

      const advance = (text, weight, extra = '') => {
        probe.style.fontWeight = String(weight)
        probe.style.cssText = probe.style.cssText.replace(/text-transform:[^;]*;?/, '')
        probe.setAttribute('style', probe.getAttribute('style') + ';' + extra)
        probe.textContent = text
        // width at 100px == advance in em * 100
        return probe.getBoundingClientRect().width / 100
      }

      const out = nodes.map((n) => ({
        ...n,
        advances: n.weights.map((w) => ({ weight: w, a: advance(n.text, w) })),
      }))

      const types = typeNodes.map((n) => ({
        ...n,
        // uppercase + the 0.05em tracking .ds-type applies
        a: advance(n.text.toUpperCase(), 700, 'letter-spacing:0.05em'),
      }))

      probe.remove()
      return { out, types }
    },
    { nodes: NODES, typeNodes: TYPE_NODES },
  )

  const rows = []
  for (const n of measured.out) {
    for (const { weight, a } of n.advances) {
      const rawSize = n.raw / a
      rows.push({
        role: n.role,
        text: n.text,
        weight,
        raw: n.raw,
        a: Number(a.toFixed(4)),
        rawSize,
        at2: rawSize / 2.0,
        at223: rawSize / 2.23,
      })
    }
  }

  const pad = (s, n) => String(s).padEnd(n)
  console.log('')
  console.log('Advances measured in the real self-hosted IBM Plex Sans.')
  console.log('"raw size" = Figma node width / advance = the size the node was set at,')
  console.log('in Figma raw px. The two right columns divide it by each candidate scale.')
  console.log('')
  console.log(
    pad('role', 12) +
      pad('string', 21) +
      pad('wt', 5) +
      pad('raw w', 7) +
      pad('advance', 9) +
      pad('raw size', 10) +
      pad('/2.00', 8) +
      pad('/2.23', 8),
  )
  console.log('-'.repeat(80))
  for (const r of rows) {
    console.log(
      pad(r.role, 12) +
        pad(r.text, 21) +
        pad(r.weight, 5) +
        pad(r.raw, 7) +
        pad(r.a.toFixed(3), 9) +
        pad(r.rawSize.toFixed(2), 10) +
        pad(r.at2.toFixed(2), 8) +
        pad(r.at223.toFixed(2), 8),
    )
  }

  console.log('')
  console.log('Per-role means, and how far each candidate sits from the nearest token size:')
  console.log('')
  const roles = [...new Set(rows.map((r) => r.role))]
  for (const role of roles) {
    for (const weight of [...new Set(rows.filter((r) => r.role === role).map((r) => r.weight))]) {
      const set = rows.filter((r) => r.role === role && r.weight === weight)
      const mean = (k) => set.reduce((s, r) => s + r[k], 0) / set.length
      const spread = (k) => Math.max(...set.map((r) => r[k])) - Math.min(...set.map((r) => r[k]))
      const m2 = mean('at2')
      const m223 = mean('at223')
      const t2 = nearestToken(m2)
      const t223 = nearestToken(m223)
      console.log(
        `${pad(role + ' @' + weight, 20)}` +
          `raw ${mean('rawSize').toFixed(2)} (spread ${spread('rawSize').toFixed(2)})  |  ` +
          `/2.00 -> ${m2.toFixed(2)}px, nearest token ${t2} (off ${Math.abs(m2 - t2).toFixed(2)})  |  ` +
          `/2.23 -> ${m223.toFixed(2)}px, nearest token ${t223} (off ${Math.abs(m223 - t223).toFixed(2)})`,
      )
    }
  }

  console.log('')
  console.log('Type rows (uppercase + 0.05em tracking; middot spacing differs from ours,')
  console.log('so indicative only):')
  for (const t of measured.types) {
    const rawSize = t.raw / t.a
    console.log(
      `  ${pad(t.text, 16)} raw ${pad(t.raw, 5)} advance ${t.a.toFixed(3)}  ` +
        `raw size ${rawSize.toFixed(2)}  /2.00 -> ${(rawSize / 2).toFixed(2)}  ` +
        `/2.23 -> ${(rawSize / 2.23).toFixed(2)}`,
    )
  }

  // A scale-free cross-check that needs no font at all: if the frame is drawn at
  // scale S, then S = rawSize / cssSize for EVERY role at once. Solve for the S
  // that best puts every role on a token size.
  console.log('')
  console.log('Best-fit scale, solved across all roles at once (no candidate assumed):')
  let best = null
  for (let S = 1.6; S <= 2.6; S += 0.001) {
    let err = 0
    let n = 0
    for (const role of roles) {
      // Take the lighter weight for nav/number/ability, heavier for names: the
      // per-role weight choice is resolved below by whichever fits better.
      for (const weight of [...new Set(rows.filter((r) => r.role === role).map((r) => r.weight))]) {
        const set = rows.filter((r) => r.role === role && r.weight === weight)
        const mean = set.reduce((s, r) => s + r.rawSize, 0) / set.length
        const css = mean / S
        const t = nearestToken(css)
        err += Math.abs(css - t) / t
        n += 1
      }
    }
    const score = err / n
    if (!best || score < best.score) best = { S, score }
  }
  console.log(
    `  best S = ${best.S.toFixed(3)}  (mean relative distance to the token scale ${(
      best.score * 100
    ).toFixed(2)}%)`,
  )
  for (const role of roles) {
    for (const weight of [...new Set(rows.filter((r) => r.role === role).map((r) => r.weight))]) {
      const set = rows.filter((r) => r.role === role && r.weight === weight)
      const mean = set.reduce((s, r) => s + r.rawSize, 0) / set.length
      const css = mean / best.S
      console.log(
        `    ${pad(role + ' @' + weight, 20)} -> ${css.toFixed(2)}px (nearest token ${nearestToken(
          css,
        )})`,
      )
    }
  }

  await browser.close()
} finally {
  preview.stop()
}
