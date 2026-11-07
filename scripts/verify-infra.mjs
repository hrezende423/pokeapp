/**
 * verify:infra -- the infrastructure rules, checked statically. No server, no browser.
 *
 * Each section is a rule that once failed silently. A rule added by a later piece of
 * infrastructure work adds its section here, so `npm run check` keeps asserting it.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const failures = []
const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' })
const tracked = git('ls-files').split('\n').filter(Boolean)
const read = (p) => readFileSync(p, 'utf8')

hr('1. TEST-ENVIRONMENT STABILITY')
{
  const vite = read('vite.config.ts')
  check(
    "Vite's watcher ignores .claude/** (an in-repo worktree reloads the page under test)",
    /watch:\s*\{\s*ignored:\s*\[[^\]]*'\*\*\/\.claude\/\*\*'/.test(vite),
  )
  check('.claude/worktrees/ is git-ignored', read('.gitignore').split(/\r?\n/).includes('.claude/worktrees/'))

  const repo = resolve('.').replace(/\\/g, '/').toLowerCase()
  const inside = git('worktree', 'list', '--porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length).replace(/\\/g, '/').toLowerCase())
    .filter((p) => p !== repo && p.startsWith(`${repo}/`) && !p.includes('/.claude/worktrees/'))
  check('no git worktree lives inside the repo (outside the ignored harness folder)', inside.length === 0, inside.join(', '))

  const launches = tracked
    .filter((p) => p.startsWith('scripts/') && p.endsWith('.mjs'))
    .flatMap((p) =>
      read(p)
        .split('\n')
        .map((line, i) => ({ p, i: i + 1, line }))
        .filter(({ line }) => /chromium\.launch\(/.test(line)),
    )
  // lib/browser.mjs launches with its CHROME constant ({ channel: 'chrome' }).
  const bundled = launches.filter(({ line }) => !/chromium\.launch\((CHROME\b|\{[^}]*channel:\s*'chrome')/.test(line))
  check(
    `every browser launch uses system Chrome (channel 'chrome'): ${launches.length} launches`,
    launches.length > 0 && bundled.length === 0,
    bundled.map(({ p, i }) => `${p}:${i}`).join(', '),
  )
  check('the gate checks for Chrome before running a browser suite', /browserPreflight/.test(read('scripts/check.mjs')))
}

hr('2. RUNTIME AND SETUP')
{
  const nvmrc = read('.nvmrc').trim()
  const pkg = JSON.parse(read('package.json'))
  check('.nvmrc pins one major version', /^\d+$/.test(nvmrc), nvmrc)
  check(
    'package.json "engines" allows exactly that major',
    pkg.engines?.node === `>=${nvmrc} <${Number(nvmrc) + 1}`,
    String(pkg.engines?.node),
  )
  const workflows = tracked.filter((p) => p.startsWith('.github/workflows/'))
  const pinned = workflows.filter((p) => /node-version:\s*\S/.test(read(p)))
  check('every workflow reads Node from .nvmrc, none pins its own', pinned.length === 0, pinned.join(', '))
  const mode = git('ls-files', '-s', 'init.sh').split(/\s+/)[0]
  check('init.sh is tracked as executable', mode === '100755', mode)
  const init = read('init.sh')
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n')
  check(
    'init.sh installs, pre-flights, then runs the fast gate, in that order',
    init.indexOf('npm ci') < init.indexOf('scripts/preflight.mjs') &&
      init.indexOf('scripts/preflight.mjs') < init.indexOf('check -- --fast'),
  )
  check('init.sh never reinstalls a linked node_modules', /isSymbolicLink\(\)/.test(init))
  check('the README Status section is current (no "No Pokémon data")', !/No Pokémon data or features yet/.test(read('README.md')))
}

hr('SUMMARY')
if (failures.length) {
  console.log(`${failures.length} FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
