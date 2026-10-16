import { useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { TextField } from '../../../components/ds/TextField'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import {
  FLAVORS,
  blend,
  cook,
  gen3Choices,
  gen4Choices,
  opponentBerries,
  poffinName,
  type Gen3Mode,
} from './blockMath'

const TOOL = findTool('19')!

/**
 * #19 Pokéblocks and Poffins: what a set of berries makes, by the game's own
 * routine -- the Berry Blender in Ruby, Sapphire and Emerald, the Poffin pot in
 * Diamond, Pearl and Platinum.
 */
export function BlocksTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!} gamePicker>
      {({ generation, game }) =>
        !game ? null : generation === 3 ? (
          <BlenderBody key={game.name} emerald={game.name === 'emerald'} />
        ) : (
          <PoffinBody key={game.name} />
        )
      }
    </ToolShell>
  )
}

const title = (name: string) => `${name[0].toUpperCase()}${name.slice(1)} Berry`
const num = (s: string) => (s.trim() === '' ? NaN : Number(s))

function FlavorTable({ flavors, testid }: { flavors: number[]; testid: string }) {
  return (
    <table className="tools-compare" data-testid={testid}>
      <tbody>
        {FLAVORS.map((f, i) => (
          <tr key={f} data-flavor={f.toLowerCase()} data-value={flavors[i]}>
            <th scope="row">{f}</th>
            <td className="num">{flavors[i]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ------------------------------------------------------------------ Gen 3

function BlenderBody({ emerald }: { emerald: boolean }) {
  const [mode, setMode] = useState<Gen3Mode>('npc')
  const [opponents, setOpponents] = useState(3)
  const [mine, setMine] = useState(11) // Figy
  const [friends, setFriends] = useState<number[]>([1, 2, 3])
  const [rpm, setRpm] = useState('80')

  const players = mode === 'master' ? 2 : mode === 'npc' ? opponents + 1 : friends.length + 1
  const others = mode === 'friends' ? friends : opponentBerries(mine, players, mode)
  const berries = [mine, ...others]
  const speed = num(rpm)
  const reason =
    !Number.isFinite(speed) || speed < 0 || speed > 655
      ? 'Top speed must be a number of RPM from 0 to 655.'
      : null
  const block = reason ? null : blend(berries, speed)
  const berryOptions = gen3Choices.map((b) => ({ value: String(b.number), label: title(b.name) }))
  const nameOf = (n: number) => title(gen3Choices.find((b) => b.number === n)?.name ?? '?')

  return (
    <>
      <ToolInputs>
        <div className="calc-row">
          <SelectField
            label="Blending with"
            options={[
              { value: 'npc', label: 'Computer players' },
              ...(emerald ? [{ value: 'master', label: 'The Blend Master' }] : []),
              { value: 'friends', label: 'Friends (link)' },
            ]}
            value={mode}
            data-testid="blk-mode"
            onChange={(e) => setMode(e.target.value as Gen3Mode)}
          />
          {mode === 'npc' && (
            <SelectField
              label="Computer players"
              options={[1, 2, 3].map((k) => ({ value: String(k), label: String(k) }))}
              value={String(opponents)}
              data-testid="blk-opponents"
              onChange={(e) => setOpponents(Number(e.target.value))}
            />
          )}
          {mode === 'friends' && (
            <SelectField
              label="Friends"
              options={[1, 2, 3].map((k) => ({ value: String(k), label: String(k) }))}
              value={String(friends.length)}
              data-testid="blk-friend-count"
              onChange={(e) => {
                const k = Number(e.target.value)
                setFriends((f) => Array.from({ length: k }, (_, i) => f[i] ?? i + 1))
              }}
            />
          )}
          <TextField
            label="Top speed (RPM)"
            type="number"
            value={rpm}
            data-testid="blk-rpm"
            onChange={(e) => setRpm(e.target.value)}
          />
        </div>
        <div className="calc-row">
          <SelectField
            label="Your berry"
            options={berryOptions}
            value={String(mine)}
            data-testid="blk-berry-1"
            onChange={(e) => setMine(Number(e.target.value))}
          />
          {mode === 'friends' &&
            friends.map((b, i) => (
              <SelectField
                key={i}
                label={`Friend ${i + 1}`}
                options={berryOptions}
                value={String(b)}
                data-testid={`blk-berry-${i + 2}`}
                onChange={(e) =>
                  setFriends((f) => f.map((x, k) => (k === i ? Number(e.target.value) : x)))
                }
              />
            ))}
        </div>
        {mode !== 'friends' && (
          <p className="calc-result-note" data-testid="blk-npc-berries">
            {mode === 'master' ? 'The Blend Master adds' : 'The computer players add'}{' '}
            {others.map(nameOf).join(', ')} — the game picks them from your berry.
          </p>
        )}
        <p className="calc-result-note">
          The Enigma Berry is left out: its flavours come from the e-Reader card, not the game.
        </p>
      </ToolInputs>
      <ToolResult reason={reason}>
        {block && (
          <div data-testid="blk-result" data-color={block.color}>
            <p className="calc-result-note">
              {block.color} Pokéblock · level <span className="num">{block.level}</span> · feel{' '}
              <span className="num">{block.feel}</span>
            </p>
            {block.flavors ? (
              <FlavorTable flavors={block.flavors} testid="blk-flavors" />
            ) : (
              <p className="calc-result-note" data-testid="blk-black">
                Black: the same berry twice, nothing left after the flavours cancel, or four or more
                cancelled. The game gives it three random flavours at 2.
              </p>
            )}
          </div>
        )}
      </ToolResult>
    </>
  )
}

// ------------------------------------------------------------------ Gen 4

function PoffinBody() {
  const [berries, setBerries] = useState<string[]>(['cheri'])
  const [seconds, setSeconds] = useState('40')
  const [spills, setSpills] = useState('0')
  const [burns, setBurns] = useState('0')
  const [inStep, setInStep] = useState('0')

  const s = num(seconds)
  const sp = num(spills)
  const bu = num(burns)
  const st = num(inStep)
  const whole = (x: number) => Number.isInteger(x) && x >= 0
  const reason =
    !Number.isFinite(s) || s < 1 || s > 600
      ? 'Cooking time must be from 1 to 600 seconds.'
      : !whole(sp) || !whole(bu)
        ? 'Spills and burns are whole numbers, 0 or more.'
        : berries.length > 1 && (!whole(st) || st > 10)
          ? 'Stirring in step takes off 0 to 10.'
          : null
  const poffin = reason
    ? null
    : cook(berries, { seconds: s, spills: sp, burns: bu, inStep: berries.length > 1 ? st : 0 })
  const berryOptions = gen4Choices.map((b) => ({ value: b, label: title(b) }))

  return (
    <>
      <ToolInputs>
        <div className="calc-row">
          <SelectField
            label="Cooks"
            options={[1, 2, 3, 4].map((k) => ({ value: String(k), label: String(k) }))}
            value={String(berries.length)}
            data-testid="pof-cooks"
            onChange={(e) => {
              const k = Number(e.target.value)
              setBerries((b) => Array.from({ length: k }, (_, i) => b[i] ?? gen4Choices[i]))
            }}
          />
          <TextField
            label="Cooking time (s)"
            type="number"
            value={seconds}
            data-testid="pof-seconds"
            onChange={(e) => setSeconds(e.target.value)}
          />
          <TextField
            label="Spills"
            type="number"
            value={spills}
            data-testid="pof-spills"
            onChange={(e) => setSpills(e.target.value)}
          />
          <TextField
            label="Burns"
            type="number"
            value={burns}
            data-testid="pof-burns"
            onChange={(e) => setBurns(e.target.value)}
          />
          {berries.length > 1 && (
            <TextField
              label="Stirring in step (0–10)"
              type="number"
              value={inStep}
              data-testid="pof-instep"
              onChange={(e) => setInStep(e.target.value)}
            />
          )}
        </div>
        <div className="calc-row">
          {berries.map((b, i) => (
            <SelectField
              key={i}
              label={`Cook ${i + 1}`}
              options={berryOptions}
              value={b}
              data-testid={`pof-berry-${i + 1}`}
              onChange={(e) => setBerries((x) => x.map((y, k) => (k === i ? e.target.value : y)))}
            />
          ))}
        </div>
        <p className="calc-result-note">
          Each flavour is its total minus the next flavour’s, less one per flavour that went
          negative, times 60 ÷ the cooking time in seconds, less spills and burns. Smoothness is the
          berries’ average less the number of berries, never below 15.
        </p>
      </ToolInputs>
      <ToolResult reason={reason}>
        {poffin && (
          <div data-testid="pof-result" data-type={poffinName(poffin.type)}>
            <p className="calc-result-note">
              {poffinName(poffin.type)} · level <span className="num">{poffin.level}</span> ·
              smoothness <span className="num">{poffin.smoothness}</span>
            </p>
            {poffin.flavors ? (
              <FlavorTable flavors={poffin.flavors} testid="pof-flavors" />
            ) : (
              <p className="calc-result-note" data-testid="pof-foul">
                Foul: {poffin.foulBecause}. The game gives it three random flavours at 2.
              </p>
            )}
          </div>
        )}
      </ToolResult>
    </>
  )
}
