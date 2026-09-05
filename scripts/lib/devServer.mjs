/**
 * Start a Vite server for a verification suite, and prove it is really ours.
 *
 * WHY THIS EXISTS, because it cost a whole verification run. The suites start
 * `vite` on a fixed port and then poll the URL until it answers. Two things went
 * wrong at once:
 *
 *   1. `spawn(..., { shell: true })` on Windows starts cmd.exe, which starts npx,
 *      which starts vite. `child.kill()` kills cmd.exe and ORPHANS vite. Repeated
 *      runs left 78 live servers holding every port in the 4173-4199 range.
 *   2. With the port already held, `--strictPort` makes the new vite exit
 *      immediately -- but the poll still succeeds, because the ORPHAN answers. And
 *      several orphans were `vite preview`, serving a stale `dist/`. So the suite
 *      tested a previous build of the app: a fix applied to a source file did not
 *      appear in the browser, and a section failed for a bug already fixed.
 *
 * So this module does three things the inline version did not:
 *
 *   - runs `node node_modules/vite/bin/vite.js` DIRECTLY, no shell and no npx, so
 *     the returned handle is the actual server and killing it kills the server;
 *   - REFUSES TO START if the port is already answering, which turns an orphan
 *     from a silent wrong answer into a loud failure;
 *   - VERIFIES THE SERVED PAGE IS THE ONE THIS RUN INTENDED before returning.
 *
 * TWO MODES, because the suites are split between them and the freshness proof
 * is necessarily different for each:
 *
 *   - `startDevServer` -- for suites that must import `/src/**` as real modules
 *     (verify-legal-moveset, verify-team-builder). Proof: the dev HTML references
 *     `/src/main.tsx`, which a preview server answers with SPA-fallback HTML.
 *   - `startPreviewServer` -- for suites that test the PRODUCTION build (every
 *     other browser suite). Proof: the served `index.html` must byte-match the
 *     local `dist/index.html`. That is strictly stronger than "it answered": it
 *     also catches an orphaned preview serving a *different* `dist/`, and it
 *     catches a dev server squatting the port, since dev HTML never matches.
 *
 * The preview mode deliberately does NOT try to prove `dist/` is itself current
 * with respect to `src/`. Nothing here can know that -- run `npm run build`
 * first. What it does guarantee is that the browser sees the `dist/` on disk.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html')

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' })
  return { status: res.status, body: await res.text() }
}

/**
 * Refuse to start when the port already answers. Without this, the `--strictPort`
 * exit is invisible and an orphan silently serves the whole suite.
 */
async function assertPortFree(port, url) {
  try {
    const probe = await fetch(url)
    if (probe.ok) {
      throw new Error(
        `port ${port} is already serving ${url} before this suite started it.\n` +
          `That is almost certainly an orphaned server from an earlier run, and it may be\n` +
          `serving a STALE BUILD. Kill leftover vite processes and re-run.`,
      )
    }
  } catch (err) {
    // A connection failure is the expected, healthy case.
    if (err instanceof Error && err.message.includes('already serving')) throw err
  }
}

/**
 * Kill the server for real.
 *
 * `child.kill()` is enough now that we spawn node directly rather than through a
 * shell, but the tree-kill stays as a belt-and-braces second shot: leaving a
 * server bound to the port is the exact failure this whole module exists to
 * prevent, and it is cheap to over-insure against.
 */
function makeStop(child) {
  return () => {
    try {
      child.kill()
    } catch {
      /* already gone */
    }
    if (process.platform === 'win32' && child.pid) {
      try {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        /* best effort */
      }
    }
  }
}

/**
 * Spawn vite with the given argv and poll until `accept(status, body)` is happy.
 *
 * `accept` returns `true` (ready), `false` (not yet), or `{ fatal: reason }` to
 * stop the run -- which is how "something answered, but it is not ours" is
 * reported. It returns that verdict rather than throwing so the fetch's own
 * "connection refused" (the normal not-up-yet case) stays distinguishable from a
 * real diagnosis.
 */
async function start({ port, url, argv, timeoutMs, accept }) {
  await assertPortFree(port, url)

  const child = spawn(process.execPath, [VITE_BIN, ...argv], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  /*
    The server's own output is captured rather than discarded: when it fails to
    start (a port still held by an earlier run being the usual cause) the reason
    has to reach the suite's log, or the failure reads as "the app is broken".
  */
  const serverLog = []
  child.stdout?.on('data', (d) => serverLog.push(String(d).trimEnd()))
  child.stderr?.on('data', (d) => serverLog.push(String(d).trimEnd()))

  let exited = null
  child.on('exit', (code) => {
    exited = code
    serverLog.push(`vite exited with code ${code}`)
  })

  const stop = makeStop(child)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (exited != null) {
      throw new Error(
        `vite exited with code ${exited} before serving ${url} -- the port is probably taken.\n` +
          serverLog.map((l) => `    ${l}`).join('\n'),
      )
    }
    let answer = null
    try {
      answer = await fetchText(url)
    } catch {
      /* not up yet -- the only thing a fetch failure is allowed to mean here */
    }
    if (answer) {
      const verdict = accept(answer.status, answer.body)
      if (verdict === true) return { url, stop, log: serverLog }
      if (verdict !== false) {
        stop()
        throw new Error(verdict.fatal)
      }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  stop()
  throw new Error(
    `server never became ready at ${url}\n${serverLog.map((l) => `    ${l}`).join('\n')}`,
  )
}

/**
 * Boot a DEV server (source modules served live) and return `{ url, stop, log }`.
 *
 * For suites that import `/src/**` directly. Anything else should prefer
 * `startPreviewServer`, which tests what actually ships.
 */
export async function startDevServer({ port, base = '/pokeapp/', timeoutMs = 90000 }) {
  const url = `http://localhost:${port}${base}`
  return start({
    port,
    url,
    argv: ['--port', String(port), '--strictPort'],
    timeoutMs,
    accept: (status, body) => {
      if (status !== 200) return false
      // The dev HTML references the TypeScript entry directly; the built HTML
      // references a hashed /assets/ bundle instead. This is the discriminator.
      if (body.includes('/src/main.tsx')) return true
      return {
        fatal:
          `${url} answered, but with a BUILT page (no /src/main.tsx reference).\n` +
          `Something other than this run's dev server is on port ${port} -- most likely an\n` +
          `orphaned \`vite preview\`. Kill leftover vite processes and re-run.`,
      }
    },
  })
}

/**
 * Boot a PREVIEW server (the built `dist/`) and return `{ url, stop, log }`.
 *
 * Readiness is not "it answered" but "it answered with the index.html sitting in
 * dist/ right now" -- see this file's header for why the weaker test was not
 * enough.
 */
export async function startPreviewServer({ port, base = '/pokeapp/', timeoutMs = 120000 }) {
  const url = `http://localhost:${port}${base}`

  if (!existsSync(DIST_INDEX)) {
    throw new Error(
      `no build to preview: ${DIST_INDEX} does not exist. Run \`npm run build\` first.`,
    )
  }
  const expected = readFileSync(DIST_INDEX, 'utf8').trim()

  return start({
    port,
    url,
    argv: ['preview', '--port', String(port), '--strictPort'],
    timeoutMs,
    accept: (status, body) => {
      if (status !== 200) return false
      if (body.trim() === expected) return true
      /*
        Answered, but not with our dist/index.html. Either a dev server is on the
        port (its HTML references /src/main.tsx) or another preview is serving a
        different build. Both are the stale-code hazard; both are fatal.
      */
      const kind = body.includes('/src/main.tsx')
        ? 'a DEV server (the page references /src/main.tsx)'
        : 'a DIFFERENT build than the dist/ on disk'
      return {
        fatal:
          `${url} answered, but it is serving ${kind}.\n` +
          `Something other than this run's preview server is on port ${port} -- most likely an\n` +
          `orphaned vite from an earlier run. Kill leftover vite processes and re-run.`,
      }
    },
  })
}
