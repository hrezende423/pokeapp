/**
 * verify:infra -- the infrastructure rules, checked statically. No server, no browser.
 *
 * Each section is a rule that once failed silently. A rule added by a later piece of
 * infrastructure work adds its section here, so `npm run check` keeps asserting it.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
  check(
    'npm run worktree resolves the MAIN repo (git common dir), so a worktree never nests in a worktree',
    /--git-common-dir/.test(read('scripts/worktree.mjs')),
  )
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
  check(
    'a non-fast run records its results, and a passing one its HEAD for the reminder',
    /if \(!fast\) \{[\s\S]*writeFileSync\(LAST_RUN_FILE[\s\S]*if \(passed\) writeFileSync\(STATE_FILE/.test(gate),
  )
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

hr('5. INSTRUCTIONS AND PROGRESS')
{
  const lines = read('CLAUDE.md').split(/\r?\n/).length - 1
  check('the root CLAUDE.md is at most 200 lines (it loads every session)', lines <= 200, `${lines} lines`)
  const nested = tracked.filter((p) => /(^|\/)CLAUDE\.md$/.test(p) && p !== 'CLAUDE.md')
  const table = read('CLAUDE.md')
  const unlisted = nested.filter((p) => !table.includes(`\`${p}\``) && p !== 'src/modules/battle/CLAUDE.md')
  check('every nested CLAUDE.md is in the root table', unlisted.length === 0, unlisted.join(', '))
  check(
    'the root names the species page hook that exists (useSpeciesGameScope)',
    /useSpeciesGameScope/.test(table) && existsSync('src/modules/pokedex/useSpeciesGameScope.ts'),
  )
  check('icon.md documents the 1.5px stroke the app uses', /1\.5px stroke/.test(read('design-system/components/icon.md')))
  check('docs/PROGRESS.md exists with a table row per slice', (read('docs/PROGRESS.md').match(/^\| 20/gm) ?? []).length >= 5)
  const status = execFileSync('node', ['scripts/status.mjs'], { encoding: 'utf8' })
  for (const metric of ['Suites passing', 'Unlogged failures', 'Logged debt', 'Unreleased commits', 'Data coverage', 'Token adoption', 'var(--accent) references', ':hover with a background', 'Native <select>', 'PRD Must done']) {
    check(`npm run status prints "${metric}"`, status.includes(`| ${metric}`))
  }
}

hr('6. DESIGN TOKENS (bridge only)')
{
  const app = read('src/design-tokens.css')
  const bridge = {
    '--font-size-body': '--font-style-body-size',
    '--font-size-title': '--font-style-h3-size',
    '--radius-control': '--radius-md',
    '--radius-pill': '--radius-lg',
    '--space-gap-sm': '--space-2',
    '--space-gap-xl': '--space-8',
    '--field-focus-border-width': '--border-width-thick',
    '--font-weight-medium': '--font-weight-semibold',
  }
  const missing = Object.entries(bridge).filter(([k, v]) => !app.includes(`${k}: var(${v})`))
  check('the app tokens with a same-kind dist equivalent are var() aliases of it', missing.length === 0, missing.map(([k]) => k).join(', '))
  const distNames = new Set([...read('design-system/dist/tokens.css').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
  const dangling = Object.values(bridge).filter((v) => !distNames.has(v))
  check('every alias target exists in dist/tokens.css', dangling.length === 0, dangling.join(', '))
  check(
    'the light accent resolves to the dist value; dark keeps its own (it moved a frozen screen)',
    (app.match(/--accent:\s*var\(--color-accent-default\)/g) ?? []).length === 1 && /--accent: #ff3b4e;/.test(app),
  )
  check('the tokens with no equivalent are listed (design-system/TOKEN-BRIDGE.md)', /## No equivalent in dist yet/.test(read('design-system/TOKEN-BRIDGE.md')))
  check('the frozen-screen pixel comparison tool exists', /compare <a> <b>/.test(read('scripts/compare-frozen.mjs')))
}

hr('7. PHONE SHELL')
{
  check('the viewport opts into safe areas (viewport-fit=cover)', /viewport-fit=cover/.test(read('index.html')))
  const css = read('src/phoneShell.css')
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const outside = body.replace(/@media \(max-width: 639px\) \{[\s\S]*\}\s*$/, '').trim()
  check('every phone-shell rule is inside the one phone media query (desktop untouched)', outside === '', outside.slice(0, 80))
  check('the phone shell uses no box-shadow', !/box-shadow/.test(body))
  check('the bottom bar and sheet pad by the safe-area inset', /env\(safe-area-inset-bottom\)/.test(body))
  check('the phone shell is imported last in App.tsx', /import '\.\/phoneShell\.css'/.test(read('src/App.tsx')))
  check('the mockup is in public/ (so it is reachable on the preview)', tracked.includes('public/mockups/phone-shell.html'))
}

hr('8. OFFLINE')
{
  const vite = read('vite.config.ts')
  check('the precache globs include the partition list', /globPatterns: \[[^\]]*PARTITION_GLOB/.test(vite))
  check('the partition list is read from the bundle (version-groups.json), not typed by hand', /version-groups\.json/.test(vite) && /PRECACHE_MAX_GENERATION/.test(vite))
  check('the mechanics-scope limit is Gen 4', /export const PRECACHE_MAX_GENERATION = 4/.test(read('src/data/manifest.ts')))
  check('sprites are never precached (no sprite host or image glob for artwork)', !/globPatterns: \[[^\]]*(webp|gif|sprites)/.test(vite))
  check('the Gen 5+ learnsets are warmed after boot', /scheduleWarmup\(\)/.test(read('src/App.tsx')))
}

hr('9. PERSISTENCE AND SYNC')
{
  const sql = tracked.filter((p) => /^supabase\/migrations\/.+\.sql$/.test(p))
  check('the user_documents migration is a tracked FILE', sql.length === 1, sql.join(', '))
  const text = sql[0] ? read(sql[0]) : ''
  check('it says it is NOT applied and awaits the owner', /NOT APPLIED/.test(text))
  check('RLS is enabled on the table', /alter table public\.user_documents enable row level security/i.test(text))
  for (const op of ['select', 'insert', 'update', 'delete']) {
    const policy = text.split(/create policy/i).find((block) => new RegExp(`for ${op} `, 'i').test(block)) ?? ''
    check(`an own-row ${op} policy (auth.uid() = user_id)`, /auth\.uid\(\)\)? = user_id/.test(policy))
  }
  const { suitesFor } = await import('./lib/suiteMap.mjs')
  check('src/store/ changes run verify:store and the Team Builder suites', ['store', 'team-builder', 'collection'].every((s) => suitesFor(['src/store/documentStore.ts']).has(s)))
  check('verify:store is browser-free in the gate', /'store'/.test(/const BROWSERLESS = new Set\(\[[^\]]*\]/.exec(read('scripts/check.mjs'))?.[0] ?? ''))
  check('the Team Builder keeps its key', /'pokeapp:team-builder:v1'/.test(read('src/modules/team-builder/store.ts')))
}

hr('10. SHARED FOUNDATIONS')
{
  const { suitesFor } = await import('./lib/suiteMap.mjs')
  check('src/lib/entities/ changes run verify:entities', suitesFor(['src/lib/entities/engine.ts']).has('entities'))
  check('scripts/curated/ changes run verify:curated', suitesFor(['scripts/curated/glossary/x.json']).has('curated'))
  const browserless = /const BROWSERLESS = new Set\(\[[^\]]*\]/.exec(read('scripts/check.mjs'))?.[0] ?? ''
  check('verify:entities and verify:curated are browser-free in the gate', /'entities'/.test(browserless) && /'curated'/.test(browserless))
  const pkg = JSON.parse(read('package.json'))
  check('build:curated, verify:entities and verify:curated are scripts', ['build:curated', 'verify:entities', 'verify:curated'].every((k) => pkg.scripts[k]))
  check('ajv is a declared devDependency', Boolean(pkg.devDependencies?.ajv))
}

hr('SUMMARY')
if (failures.length) {
  console.log(`${failures.length} FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
