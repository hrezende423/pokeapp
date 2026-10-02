/**
 * The trainer build's inputs, fetched once into .cache/trainers/ and reused.
 *
 * PINNED, NOT HEAD. Every pret disassembly is checked out at the commit named
 * below, so a rebuild next month produces the same bundle byte for byte unless
 * someone deliberately moves a pin. Moving one is a data change: re-run the
 * build and read the diff it produces.
 *
 * SPARSE, NOT FULL. These repositories carry graphics, audio and build tooling
 * the trainer build never reads (pokeplatinum alone is over a gigabyte), so each
 * is a blob-filtered clone with a non-cone sparse checkout of just the paths the
 * parsers open. `core.longpaths` is passed per command rather than set globally.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const REPOS = {
  pokered: {
    sha: 'd2704a63c26f9ba046ade877445216b3de0519a4',
    paths: ['/data/trainers/', '/data/pokemon/', '/constants/', '/data/maps/objects/'],
  },
  pokeyellow: {
    sha: 'e89ead154b9968aa50eed9328ff2b38b6c194382',
    paths: ['/data/trainers/', '/data/pokemon/', '/constants/', '/data/maps/objects/'],
  },
  pokegold: {
    sha: '0f087a51e36cbd38f33e5055754614578246ceff',
    paths: ['/data/trainers/', '/data/pokemon/', '/constants/', '/maps/*.asm'],
  },
  pokecrystal: {
    sha: 'e058e4f50b3bbf7377e036b81c25a72c54656c5c',
    paths: [
      '/data/trainers/',
      '/data/pokemon/',
      '/data/battle_tower/',
      '/constants/',
      '/maps/*.asm',
    ],
  },
  pokeruby: {
    sha: 'eae3eccc9dd27ca7e4a6874bb040eeadb081b9ed',
    paths: [
      '/src/data/',
      '/include/constants/',
      '/constants/',
      '/charmap.txt',
      '/src/battle_2.c',
      '/src/battle_main.c',
      '/src/battle_tower.c',
      '/data/trainer_money.inc',
      '/data/maps/*/scripts.inc',
    ],
  },
  pokeemerald: {
    sha: 'c925b8482d05fb882d6b64e523653cae599e025f',
    paths: [
      '/src/data/',
      '/include/constants/',
      '/charmap.txt',
      '/src/battle_main.c',
      '/src/battle_tower.c',
      '/src/frontier_util.c',
      '/data/maps/*/scripts.inc',
    ],
  },
  pokefirered: {
    sha: '037335f4c725d7c9aecdac87066f2002b4bd7e14',
    paths: [
      '/src/data/',
      '/include/constants/',
      '/charmap.txt',
      '/src/battle_main.c',
      '/src/trainer_tower.c',
      '/src/trainer_tower_sets.c',
      '/data/maps/*/scripts.inc',
    ],
  },
  pokediamond: {
    sha: '5bc4b1a3d8f100f77a4c64e59a0d544a0e29b3ec',
    paths: [
      '/files/poketool/trainer/',
      '/files/poketool/personal/',
      '/files/battle/b_tower/',
      '/files/msgdata/msg/',
      '/arm9/src/trainer_data.c',
      '/include/constants/',
    ],
  },
  pokeplatinum: {
    sha: 'c248fb3f8cc9934ded800e489567c5c0eeee92eb',
    paths: [
      '/res/trainers/data/',
      '/res/trainers/frontier/',
      '/res/trainers/*.json',
      '/res/pokemon/*/data.json',
      '/src/trainer_data.c',
      '/include/constants/',
      '/include/data/trainer_class_prize_mul.h',
      '/include/data/trainer_class_genders.h',
      '/generated/',
    ],
  },
  pokeheartgold: {
    sha: '9d8b7591f09b65804da2fb2dfd56f320633e0d36',
    paths: [
      '/files/poketool/trainer/',
      '/files/poketool/personal/',
      '/src/trainer_data.c',
      '/include/constants/',
    ],
  },
}

/**
 * What scripts/build-battle-data.mjs reads on top of the trainer build's paths:
 * the games' move tables, held-item attributes and trainer AI. Same pins, same
 * clones -- one checkout per repo, so the two builds can never read different
 * commits of the same game.
 */
export const BATTLE_PATHS = {
  pokered: ['/data/moves/', '/data/battle/'],
  pokeyellow: ['/data/moves/', '/data/battle/'],
  pokegold: ['/data/moves/', '/data/items/', '/data/battle/ai/'],
  pokecrystal: ['/data/moves/', '/data/items/', '/data/battle/ai/'],
  pokeruby: [
    '/data/battle_ai_scripts.s',
    '/include/macros/battle_ai_script.inc',
    '/src/battle_ai_script_commands.c',
  ],
  pokeemerald: [
    '/data/battle_ai_scripts.s',
    '/asm/macros/battle_ai_script.inc',
    '/src/battle_ai_script_commands.c',
    // Double battles (S6): damage, targeting, turn order, switching, effects.
    '/src/pokemon.c',
    '/src/battle_util.c',
    '/src/battle_script_commands.c',
    '/src/battle_ai_switch_items.c',
    '/data/battle_scripts_1.s',
    '/include/battle.h',
  ],
  pokefirered: [
    '/data/battle_ai_scripts.s',
    '/asm/macros/battle_ai_script.inc',
    '/src/battle_ai_script_commands.c',
  ],
  pokediamond: ['/files/battle/tr_ai/'],
  pokeplatinum: [
    '/res/moves/',
    '/res/items/data/',
    '/res/prebuilt/battle/tr_ai/',
    '/src/battle/trainer_ai/',
    '/asm/macros/aicmd.inc',
    '/include/data/scripts/',
    // Double battles (S6): the battle engine and the AI's doubles routines.
    '/src/battle/',
    '/include/battle/',
  ],
  pokeheartgold: [],
}

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'core.longpaths=true', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  })
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr || r.stdout}`)
  }
  return r.stdout.trim()
}

/**
 * Ensure every repo is present at its pin with its sparse paths checked out.
 * Returns { name: absoluteDir }. Idempotent: a repo already at its pin with
 * the same path list is left alone.
 */
export function ensureSources(cacheRoot) {
  const out = {}
  mkdirSync(cacheRoot, { recursive: true })
  for (const [name, { sha, paths: own }] of Object.entries(REPOS)) {
    const paths = [...own, ...(BATTLE_PATHS[name] ?? [])]
    const dir = join(cacheRoot, name)
    const stamp = join(dir, '.pokeapp-pin')
    const want = `${sha}\n${paths.join('\n')}`
    if (existsSync(stamp) && readFileSync(stamp, 'utf8') === want) {
      out[name] = dir
      continue
    }
    if (!existsSync(join(dir, '.git'))) {
      console.log(`  cloning pret/${name} (sparse)`)
      git(
        cacheRoot,
        'clone',
        '--filter=blob:none',
        '--no-checkout',
        '--sparse',
        `https://github.com/pret/${name}.git`,
        name,
      )
    }
    git(dir, 'sparse-checkout', 'set', '--no-cone', ...paths)
    git(dir, 'fetch', '--quiet', '--filter=blob:none', 'origin', sha)
    git(dir, 'checkout', '--quiet', '--detach', sha)
    writeFileSync(stamp, want)
    out[name] = dir
  }
  return out
}
