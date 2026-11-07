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

hr('3. CI')
{
  const has = (p) => tracked.includes(p)
  // Comments are dropped: pr.yml's header explains why `check --all` is NOT run.
  const code = (p) =>
    has(p)
      ? read(p)
          .split(/\r?\n/)
          .filter((l) => !l.trimStart().startsWith('#'))
          .join('\n')
      : ''
  const pr = code('.github/workflows/pr.yml')
  check('a PR workflow exists and runs on every pull request', /\bon:\s*\n\s*pull_request:/.test(pr))
  for (const [label, re] of [
    ['typecheck', /npx tsc -b/],
    ['lint', /npm run lint/],
    ['build', /npm run build/],
    ['the design-token contrast check, with PYTHONUTF8=1 and fails: 0 required', /PYTHONUTF8: '1'[\s\S]*check-contrast\.py[\s\S]*grep -q 'fails: 0'/],
  ]) check(`the PR workflow runs ${label}`, re.test(pr))
  check('the PR workflow runs no Playwright suite (documented: too long for a PR)', !/check -- --all|verify:(?!infra)/.test(pr))
  const full = code('.github/workflows/suites.yml')
  check(
    'a scheduled and manual workflow runs `check --all`',
    /schedule:/.test(full) && /workflow_dispatch:/.test(full) && /npm run check -- --all/.test(full),
  )
  check('the deploy workflow still deploys main', /push:\s*\n\s*branches: \[main\]/.test(read('.github/workflows/deploy.yml')))
}

hr('4. GATE HONESTY')
{
  const { suitesFor } = await import('./lib/suiteMap.mjs')
  const routes = (file) => [...suitesFor([file])]
  check('a src/data/ change runs verify:ux', routes('src/data/era.ts').includes('ux'), routes('src/data/era.ts').join())
  check('a src/modules/nav/ change runs verify:ux', routes('src/modules/nav/navHistory.ts').includes('ux'), routes('src/modules/nav/navHistory.ts').join())
  check('a changed suite runs itself', routes('scripts/verify-scroll-nav.mjs').includes('scroll-nav'))
  check('any src/ change boots the app', routes('src/App.tsx').includes('app'))
  const gate = read('scripts/check.mjs')
  check('a passing non-fast run records its HEAD for the reminder', /if \(passed && !fast\)[\s\S]*writeFileSync\(STATE_FILE/.test(gate))
  check(
    'scroll-nav is out of FLAKY: its §2 clicks a card visible at the parked offset',
    !/'scroll-nav':/.test(/const FLAKY = \{[\s\S]*?\};/.exec(gate)?.[0] ?? '') &&
      /species-open-"\]'\)\]\.find/.test(read('scripts/verify-scroll-nav.mjs')),
  )
  const hook = read('.claude/hooks/stop-gate.sh')
  check(
    'the Stop hook adds the unchecked-areas reminder (with --all) without blocking',
    /check\.mjs --unchecked/.test(hook) && /systemMessage/.test(hook) && /check -- --all/.test(gate),
  )
}

hr('SUMMARY')
if (failures.length) {
  console.log(`${failures.length} FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
