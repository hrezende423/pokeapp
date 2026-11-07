/**
 * `npm run preflight` (and init.sh): is this machine able to run the gate?
 *
 *   Node     the major version in .nvmrc (package.json "engines" says the same)
 *   Chrome   the system Chrome starts (every suite drives it)
 *   .cache   reported, never required: only the data generators (build:*) read the
 *            PokeAPI snapshot there, and build:data downloads it when it is missing
 *
 * Exits 1 on a missing requirement, with what to do.
 */
import { existsSync, readFileSync } from 'node:fs'
import { browserPreflight, CHROME_HELP } from './lib/browser.mjs'

let ok = true
const want = readFileSync('.nvmrc', 'utf8').trim()
const have = process.versions.node.split('.')[0]
if (have === want) console.log(`  PASS  Node ${process.versions.node} (.nvmrc: ${want})`)
else {
  ok = false
  console.log(`  FAIL  Node ${process.versions.node}, but .nvmrc pins ${want}: install Node ${want} (https://nodejs.org/) or switch with nvm/fnm`)
}

const chrome = await browserPreflight()
if (!chrome) console.log('  PASS  system Chrome starts')
else {
  ok = false
  console.log(`  FAIL  Chrome did not start: ${chrome}\n${CHROME_HELP.replace(/^/gm, '        ')}`)
}

if (existsSync('.cache/api-data')) console.log('  INFO  .cache/api-data present: the data generators (npm run build:data, ...) can run offline')
else console.log('  INFO  .cache/api-data absent: fine for the app and every suite; npm run build:data downloads it when needed')

process.exit(ok ? 0 : 1)
