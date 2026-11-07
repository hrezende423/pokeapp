/**
 * verify:curated -- the curated-data pipeline (scripts/build-curated.mjs), browser-free.
 *
 * 1. The real datasets pass every check.
 * 2. Each invalid fixture in scripts/curated/__fixtures__/ fails, for the
 *    expected reason, at the expected file, record id and JSON pointer -- through
 *    the function and through the CLI (exit 1).
 * 3. The committed outputs in public/data/curated/ are byte-identical to a fresh build.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CURATED_ROOT, OUT_DIR, buildCurated, curatedTypes } from './build-curated.mjs'

const failures = []
const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const FIXTURES = join(CURATED_ROOT, '__fixtures__')
const EXPECTED_TYPES = ['glossary', 'milestones', 'ribbons']

hr('1. THE REAL DATASETS PASS')
const real = buildCurated()
{
  check(`the types are ${EXPECTED_TYPES.join(', ')}`, JSON.stringify(curatedTypes()) === JSON.stringify(EXPECTED_TYPES), curatedTypes().join(', '))
  check('no violations', real.violations.length === 0, real.violations.map((v) => `${v.file} ${v.pointer} ${v.message}`).join('; '))
  for (const type of EXPECTED_TYPES) {
    const records = JSON.parse(real.outputs.get(type) ?? '{"records":[]}').records
    check(`${type}: at least one record`, records.length > 0, `${records.length}`)
    check(`${type}: every record is marked "example": true (no real data yet)`, records.every((r) => r.example === true))
    check(`${type}: records sorted by id`, records.every((r, i) => i === 0 || records[i - 1].id < r.id))
  }
}

hr('2. EACH INVALID FIXTURE FAILS FOR ITS REASON')
{
  const cases = [
    {
      name: 'missing-required-field',
      file: 'glossary/data/bad.json',
      id: 'no-definition',
      pointer: '/0',
      reason: /must have required property 'definition'/,
    },
    {
      name: 'missing-generation-field',
      file: 'ribbons/data/bad.json',
      id: 'no-how',
      pointer: '/0/generations/4',
      reason: /must have required property 'how'/,
    },
    {
      name: 'unknown-generation-key',
      file: 'milestones/data/bad.json',
      id: 'generation-ten',
      pointer: '/0/generations/10',
      reason: /generation key "10" is outside 1-9/,
    },
    {
      name: 'duplicate-id',
      file: 'ribbons/data/b.json',
      id: 'twice',
      pointer: '/0/id',
      reason: /duplicate id "twice" \(first in .*ribbons\/data\/a\.json at \/0\/id\)/,
    },
    {
      name: 'wrong-type',
      file: 'ribbons/data/bad.json',
      id: 'string-generation',
      pointer: '/0/introduced',
      reason: /must be integer/,
    },
  ]
  const onDisk = readdirSync(FIXTURES).sort()
  check('every fixture on disk has an expected reason', JSON.stringify(onDisk) === JSON.stringify(cases.map((c) => c.name).sort()), onDisk.join(', '))

  for (const c of cases) {
    const dir = join(FIXTURES, c.name)
    const { violations } = buildCurated({ dataRoot: dir })
    const file = `${dir.replace(/\\/g, '/')}/${c.file}`
    const hit = violations.find((v) => v.file === file && v.id === c.id && v.pointer === c.pointer && c.reason.test(v.message))
    check(`${c.name}: fails at ${c.file} id=${c.id} ${c.pointer}`, Boolean(hit), violations.map((v) => `${v.file} ${v.id} ${v.pointer} ${v.message}`).join('; '))
    check(`${c.name}: that is the only violation`, violations.length === 1, `${violations.length}`)
  }

  // Once through the CLI: exit 1, and the line names file, record id and pointer.
  const c = cases[1]
  let status = 0
  let stderr = ''
  try {
    execFileSync(process.execPath, ['scripts/build-curated.mjs', '--data', join(FIXTURES, c.name)], { stdio: 'pipe', encoding: 'utf8' })
  } catch (err) {
    status = err.status
    stderr = String(err.stderr)
  }
  check('CLI exits 1 on a violation', status === 1, `exit ${status}`)
  check('CLI names file, record id and JSON pointer', stderr.includes(`${c.file}  id=${c.id}  ${c.pointer}  `), stderr.trim().split('\n').pop())
}

hr('3. COMMITTED OUTPUTS MATCH A FRESH BUILD')
{
  for (const type of EXPECTED_TYPES) {
    const path = join(OUT_DIR, `${type}.json`)
    const committed = existsSync(path) ? readFileSync(path) : null
    const fresh = Buffer.from(real.outputs.get(type) ?? '', 'utf8')
    check(`${path} is byte-identical to a fresh build`, committed != null && committed.equals(fresh), committed ? `${committed.length} vs ${fresh.length} bytes` : 'missing; run npm run build:curated')
  }
  const extra = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => !EXPECTED_TYPES.includes(f.replace(/\.json$/, ''))) : []
  check(`${OUT_DIR} holds no file without a type`, extra.length === 0, extra.join(', '))
}

hr('SUMMARY')
if (failures.length) {
  console.log(`${failures.length} FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
