/**
 * Team Building documents for the Team Matchup suite: one real team per
 * generation, built IN THE PAGE from the bundle's own records (names -> ids), so
 * the fixture never carries a hand-typed id that could drift from the data.
 *
 * `seedTeams(page)` writes them to the Team Builder's localStorage key; the
 * suite reloads afterwards so the store reads them.
 */

export const TEAMS = {
  'red-blue': {
    gen: 1,
    level: 62,
    mons: [
      ['jolteon', ['thunderbolt', 'double-kick', 'pin-missile', 'thunder-wave']],
      ['snorlax', ['body-slam', 'earthquake', 'rest', 'ice-beam']],
      ['starmie', ['surf', 'psychic', 'thunderbolt', 'recover']],
      ['alakazam', ['psychic', 'seismic-toss', 'thunder-wave', 'recover']],
      ['rhydon', ['earthquake', 'rock-slide', 'body-slam', 'substitute']],
      ['lapras', ['blizzard', 'surf', 'body-slam', 'confuse-ray']],
    ],
  },
  crystal: {
    gen: 2,
    level: 50,
    mons: [
      ['typhlosion', ['flamethrower', 'thunder-punch', 'earthquake', 'swift'], 'charcoal'],
      ['ampharos', ['thunderbolt', 'fire-punch', 'thunder-wave', 'light-screen'], 'magnet'],
      ['tyranitar', ['rock-slide', 'crunch', 'earthquake', 'dragon-dance'], 'leftovers'],
      ['lapras', ['ice-beam', 'surf', 'thunderbolt', 'confuse-ray'], 'never-melt-ice'],
      ['heracross', ['megahorn', 'cross-chop', 'rock-slide', 'swords-dance'], 'quick-claw'],
      ['espeon', ['psychic', 'bite', 'morning-sun', 'reflect'], 'twisted-spoon'],
    ],
  },
  emerald: {
    gen: 3,
    level: 60,
    mons: [
      ['swampert', ['surf', 'earthquake', 'ice-beam', 'protect'], 'leftovers', 'relaxed'],
      ['manectric', ['thunderbolt', 'crunch', 'thunder-wave', 'quick-attack'], 'magnet', 'timid'],
      ['breloom', ['sky-uppercut', 'mega-drain', 'spore', 'swords-dance'], 'quick-claw', 'adamant'],
      ['gardevoir', ['psychic', 'thunderbolt', 'calm-mind', 'hypnosis'], 'twisted-spoon', 'modest'],
      [
        'salamence',
        ['dragon-claw', 'aerial-ace', 'flamethrower', 'dragon-dance'],
        'shell-bell',
        'naive',
      ],
      ['metagross', ['meteor-mash', 'earthquake', 'psychic', 'agility'], 'choice-band', 'adamant'],
    ],
  },
  platinum: {
    gen: 4,
    level: 62,
    mons: [
      ['infernape', ['close-combat', 'flare-blitz', 'u-turn', 'mach-punch'], 'life-orb', 'jolly'],
      [
        'garchomp',
        ['earthquake', 'dragon-claw', 'stone-edge', 'swords-dance'],
        'choice-scarf',
        'jolly',
      ],
      ['gyarados', ['waterfall', 'ice-fang', 'earthquake', 'dragon-dance'], 'leftovers', 'adamant'],
      [
        'lucario',
        ['aura-sphere', 'dark-pulse', 'flash-cannon', 'nasty-plot'],
        'expert-belt',
        'timid',
      ],
      ['togekiss', ['air-slash', 'aura-sphere', 'thunder-wave', 'roost'], 'leftovers', 'calm'],
      [
        'magnezone',
        ['thunderbolt', 'flash-cannon', 'hidden-power', 'thunder-wave'],
        'magnet',
        'modest',
      ],
    ],
  },
}

/** Build the Team Builder document in the page, from names, and store it. */
export async function seedTeams(page) {
  return page.evaluate(async (TEAMS) => {
    const D = await import('/pokeapp/src/data/index.ts')
    await D.initDataLayer()
    const byName = (list, n) => list.find((x) => x.name === n)
    const species = D.listSpecies()
    const moves = D.listMoves()
    const items = D.listItems()
    const natures = D.listNatures()
    const builds = []
    const teams = []
    const missing = []
    let seq = 1
    for (const [vg, t] of Object.entries(TEAMS)) {
      const members = []
      for (const [sp, mv, item, nature] of t.mons) {
        const s = byName(species, sp)
        if (!s) {
          missing.push(sp)
          continue
        }
        const v = s.varieties.find((x) => x.is_default) ?? s.varieties[0]
        const ab =
          t.gen >= 3
            ? (D.resolveAbilitiesForGeneration(v, t.gen).find((a) => !a.is_hidden)?.ability.id ??
              null)
            : null
        const moveIds = mv.map((m) => byName(moves, m)?.id ?? (missing.push(m), null))
        const itemId = item ? (byName(items, item)?.id ?? (missing.push(item), null)) : null
        const natureId = nature ? (byName(natures, nature)?.id ?? null) : null
        const classic = t.gen <= 2
        const individual = classic
          ? { attack: 15, defense: 15, speed: 15, special: 15 }
          : {
              hp: 31,
              attack: 31,
              defense: 31,
              'special-attack': 31,
              'special-defense': 31,
              speed: 31,
            }
        const effort = classic
          ? { hp: 30000, attack: 30000, defense: 30000, speed: 30000, special: 30000 }
          : {
              hp: 4,
              attack: 252,
              defense: 0,
              'special-attack': 0,
              'special-defense': 0,
              speed: 252,
            }
        const id = `fx-${vg}-${sp}`
        builds.push({
          id,
          generation: t.gen,
          speciesId: s.id,
          pokemonId: v.pokemon_id,
          nickname: '',
          gender: null,
          shiny: false,
          level: t.level,
          friendship: 255,
          itemId: t.gen >= 2 ? itemId : null,
          abilityId: ab,
          natureId: t.gen >= 3 ? natureId : null,
          moveIds,
          effort,
          individual,
          tags: [],
          notes: '',
        })
        members.push(id)
      }
      teams.push({
        id: `fx-team-${vg}`,
        seq: seq++,
        generation: t.gen,
        versionGroup: vg,
        name: `Fixture ${vg}`,
        purpose: 'main-story',
        memberIds: [...members, null, null, null, null, null, null].slice(0, 6),
        notes: '',
      })
    }
    localStorage.setItem(
      'pokeapp:team-builder:v1',
      JSON.stringify({
        builds,
        teams,
        nextBuildSeq: builds.length + 1,
        nextTeamSeq: teams.length + 1,
      }),
    )
    localStorage.removeItem('pokeapp:team-matchup:v1')
    return { builds: builds.length, teams: teams.length, missing }
  }, TEAMS)
}
