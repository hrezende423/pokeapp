import { useMemo, useState } from 'react'
import { SelectField } from '../../../components/ds/SelectField'
import { getSpecies } from '../../../data'
import { speciesEntries } from '../../dex/entrySources'
import { listedTeams, teamUiId } from '../../team-builder/model'
import { useTeamBuilderData } from '../../team-builder/store'
import { findTool } from '../registry'
import { ToolInputs, ToolResult, ToolShell } from '../ToolShell'
import { teamThreats, typeName, type Member } from './threatMath'

const TOOL = findTool('15')!
const TEAM_SIZE = 6

/**
 * #15 Team threat finder: the Pokémon of the app's generation whose own types
 * hit the most members of a team super-effectively. The team is picked by hand
 * or loaded from a saved team of the same generation.
 */
export function ThreatTool() {
  return (
    <ToolShell toolKey={TOOL.key} title={TOOL.label} gate={TOOL.gate!}>
      {({ generation }) => <ThreatBody key={generation} generation={generation} />}
    </ToolShell>
  )
}

const empty = (): (Member | null)[] => Array.from({ length: TEAM_SIZE }, () => null)

function ThreatBody({ generation }: { generation: number }) {
  const species = useMemo(() => speciesEntries({ generation, isAll: false }), [generation])
  const data = useTeamBuilderData()
  const teams = listedTeams(data).filter((t) => t.generation === generation)
  const [slots, setSlots] = useState<(Member | null)[]>(empty)
  const [teamId, setTeamId] = useState('')
  const members = useMemo(() => slots.filter((m): m is Member => m != null), [slots])
  const threats = useMemo(
    () => teamThreats(generation, members, species, getSpecies),
    [generation, members, species],
  )

  const loadTeam = (id: string) => {
    setTeamId(id)
    const team = teams.find((t) => t.id === id)
    if (!team) return
    setSlots(
      team.memberIds.map((bid) => {
        const b = data.builds.find((x) => x.id === bid)
        return b ? { speciesId: b.speciesId, pokemonId: b.pokemonId } : null
      }),
    )
  }
  const setSlot = (i: number, value: string) => {
    setTeamId('')
    setSlots((s) => s.map((m, k) => (k === i ? (value ? { speciesId: Number(value) } : null) : m)))
  }

  const memberName = (i: number) => getSpecies(members[i].speciesId)?.display_name ?? '?'

  return (
    <>
      <ToolInputs>
        {teams.length > 0 && (
          <SelectField
            label="Saved team"
            options={[
              { value: '', label: '—' },
              ...teams.map((t) => ({
                value: t.id,
                label: `${teamUiId(data, t.id)}${t.name ? ` ${t.name}` : ''}`,
              })),
            ]}
            value={teamId}
            data-testid="thr-team"
            onChange={(e) => loadTeam(e.target.value)}
          />
        )}
        <div className="calc-row">
          {slots.map((m, i) => (
            <SelectField
              key={i}
              label={`Member ${i + 1}`}
              options={[
                { value: '', label: '—' },
                ...species.map((s) => ({ value: String(s.id), label: s.display_name })),
              ]}
              value={m ? String(m.speciesId) : ''}
              data-testid={`thr-member-${i + 1}`}
              onChange={(e) => setSlot(i, e.target.value)}
            />
          ))}
        </div>
        <p className="calc-result-note" data-testid="thr-formula">
          Threat = the number of team members one of its own types hits super-effectively, on this
          generation&rsquo;s type chart. Ties go to the higher base stat total.
        </p>
      </ToolInputs>
      <ToolResult
        reason={
          members.length === 0
            ? 'Pick at least one team member.'
            : threats.length === 0
              ? 'Nothing in this generation hits any member super-effectively with its own type.'
              : null
        }
      >
        <ol className="tools-list" data-testid="thr-rows">
          {threats.map((t, i) => (
            <li
              key={t.speciesId}
              className="tools-item"
              data-testid={`thr-rank-${i + 1}`}
              data-species={t.speciesId}
              data-hits={t.hits.length}
            >
              <span>
                <span className="num">
                  {t.hits.length}/{members.length}
                </span>{' '}
                {getSpecies(t.speciesId)?.display_name}{' '}
                <span className="tools-blurb">BST {t.bst}</span>
              </span>
              <span className="tools-blurb">
                {t.hits
                  .map((h) => `${memberName(h.member)} (${typeName(h.typeId)} ×${h.multiplier})`)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ol>
      </ToolResult>
    </>
  )
}
