/**
 * Git worktrees OUTSIDE the repo, in a sibling folder: `../pokeapp-worktrees/<name>`.
 *
 *   npm run worktree -- add <name> <new-branch> [base]   create, with node_modules linked
 *   npm run worktree -- remove <name>                    unlink node_modules, then remove
 *   npm run worktree -- list
 *
 * WHY OUTSIDE: a worktree inside the repo adds a second copy of every .html file under
 * the dev server's root, and Vite reloads the page under test when one appears. That
 * was the cause of the verify:team-builder flakes of 2026-11-07 (vite.config.ts also
 * ignores .claude/** now, for the worktrees the agent harness makes there).
 *
 * WHY node_modules IS A LINK: so typecheck and lint run in the worktree without a
 * second `npm ci`. It is a directory junction on Windows (no admin rights needed).
 * `remove` unlinks it BEFORE `git worktree remove`, so nothing can ever recurse
 * through the link into the main repo's node_modules.
 *
 * NO SERVERS IN A WORKTREE: every suite owns a fixed port, so only one gate runs at a
 * time, and it runs in the main tree.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/* The MAIN repo, even when this runs inside a worktree: git's common dir is the main
   checkout's .git, so its parent is the main repo (not the worktree the script
   happens to sit in, which would nest worktrees inside worktrees). */
const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const COMMON = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: HERE, encoding: 'utf8' }).trim()
const REPO = resolve(COMMON, '..')
export const WORKTREE_ROOT = resolve(REPO, '..', 'pokeapp-worktrees')

const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' })
const [cmd, name, branch, base = 'HEAD'] = process.argv.slice(2)

function unlinkModules(dir) {
  const link = join(dir, 'node_modules')
  if (!existsSync(link) && !isLink(link)) return
  if (!isLink(link)) throw new Error(`${link} is a real folder, not a link: refusing to touch it`)
  unlinkSync(link)
}

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

if (cmd === 'add') {
  if (!name || !branch) throw new Error('usage: add <name> <new-branch> [base]')
  const dir = join(WORKTREE_ROOT, name)
  mkdirSync(WORKTREE_ROOT, { recursive: true })
  git('worktree', 'add', '-b', branch, dir, base)
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'junction')
  console.log(dir)
} else if (cmd === 'remove') {
  if (!name) throw new Error('usage: remove <name>')
  const dir = join(WORKTREE_ROOT, name)
  unlinkModules(dir)
  git('worktree', 'remove', dir)
  console.log(`removed ${dir}`)
} else if (cmd === 'list') {
  process.stdout.write(git('worktree', 'list'))
} else {
  console.error('usage: node scripts/worktree.mjs add <name> <new-branch> [base] | remove <name> | list')
  process.exit(1)
}
