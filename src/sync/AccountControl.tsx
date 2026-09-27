import { useMemo, useRef, useState } from 'react'
import { IconBrandGithub, IconUserCircle } from '@tabler/icons-react'
import { listSpecies } from '../data'
import { SearchSelect } from '../components/ds/SearchSelect'
import { ThemeSwitcher } from '../components/ds/ThemeSwitcher'
import { useDisclosureGroup } from '../modules/dex/query/useDisclosureGroup'
import {
  signInWithGitHub,
  signOut,
  updateProfile,
  useSyncState,
  type SyncStatus,
} from './teamSync'
import './account.css'

const STATUS_TEXT: Record<SyncStatus, string> = {
  'signed-out': 'Not signed in',
  syncing: 'Syncing…',
  synced: 'Synced',
  offline: 'Offline — will sync when back online',
  error: 'Sync failed',
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null

/**
 * The app bar's account menu, rightmost in the bar: sign-in, the account's name
 * and picture (editable), the sync status, and the Light/Dark switch, which lives
 * here rather than in the bar (owner, 2026-09-27). It opens signed out too, so
 * the theme is always one click away.
 *
 * The panel stays MOUNTED while closed, like the bar's other menus, so its
 * controls keep their state and nothing inside is tabbable.
 */
export function AccountControl() {
  const sync = useSyncState()
  const { openId, toggle, ref } = useDisclosureGroup({ dismissOnOutsideClick: true })
  const open = openId === 'account'
  const signedIn = sync.status !== 'signed-out'
  const [editing, setEditing] = useState(false)

  return (
    <div className="app-controls account" data-open={open} ref={ref} data-testid="account">
      <button
        type="button"
        className="ghost-button app-controls-toggle account-trigger"
        data-testid="account-toggle"
        data-status={sync.status}
        aria-expanded={open}
        aria-controls="account-panel"
        onClick={() => toggle('account')}
      >
        {signedIn ? (
          <>
            <Avatar url={sync.avatarUrl} size={18} />
            <span className="account-dot" data-status={sync.status} aria-hidden />
            <span className="account-name">{sync.user}</span>
          </>
        ) : (
          'Sign in'
        )}
      </button>

      <div className="app-controls-panel account-panel" id="account-panel" data-testid="account-panel">
        {signedIn ? (
          <div className="app-controls-field">
            {editing ? (
              <ProfileEditor onDone={() => setEditing(false)} />
            ) : (
              <>
                <div className="account-head">
                  <Avatar url={sync.avatarUrl} size={40} />
                  <div className="account-head-text">
                    <span className="account-who" data-testid="account-name">
                      {sync.user}
                    </span>
                    <span className="account-via">
                      <IconBrandGithub size={12} stroke={1.5} aria-hidden /> {sync.githubName}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ghost-button account-edit"
                    data-testid="account-edit"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                </div>
                <p className="account-status" data-testid="account-status" data-status={sync.status}>
                  {STATUS_TEXT[sync.status]}
                  {sync.status === 'synced' && sync.lastSynced && ` · ${when(sync.lastSynced)}`}
                </p>
                {sync.error && sync.status === 'error' && (
                  <p className="account-error">{sync.error}</p>
                )}
                <p className="account-note">
                  Your teams and builds are saved on this device and in your account, and follow
                  you to any device you sign in on.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="app-controls-field">
            <p className="account-note account-note-first">
              Sign in to keep your teams and builds on every device.
            </p>
            <button
              type="button"
              className="ghost-button account-signin"
              data-testid="account-sign-in"
              onClick={() => void signInWithGitHub()}
            >
              <IconBrandGithub size={15} stroke={1.5} aria-hidden /> Sign in with GitHub
            </button>
          </div>
        )}

        <div className="app-controls-field account-theme">
          <span className="app-controls-label">Theme</span>
          <ThemeSwitcher />
        </div>

        {signedIn && (
          <div className="app-controls-field">
            <button
              type="button"
              className="ghost-button"
              data-testid="account-sign-out"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Avatar({ url, size }: { url: string | null; size: number }) {
  return url ? (
    <img className="account-avatar" src={url} alt="" width={size} height={size} />
  ) : (
    <IconUserCircle size={size} stroke={1.25} aria-hidden />
  )
}

/** An image file, cropped square and scaled to 128px, as a JPEG data URL. */
function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        128,
        128,
      )
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file is not an image this browser can read.'))
    }
    img.src = url
  })
}

/**
 * Name and picture. The picture is an uploaded image, a Pokemon's official
 * artwork, or back to GitHub's; the name empties back to the GitHub login.
 */
function ProfileEditor({ onDone }: { onDone: () => void }) {
  const sync = useSyncState()
  const [name, setName] = useState(sync.customName ? (sync.user ?? '') : '')
  const [avatar, setAvatar] = useState<string | null>(sync.customAvatar ? sync.avatarUrl : null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const speciesOptions = useMemo(
    () =>
      listSpecies().map((s) => ({
        value: String(s.id),
        label: s.display_name,
        hint: `#${String(s.id).padStart(3, '0')}`,
      })),
    [],
  )

  const save = async () => {
    setSaving(true)
    const failure = await updateProfile({ display_name: name || null, avatar })
    setSaving(false)
    if (failure) setError(failure)
    else onDone()
  }

  return (
    <div className="account-editor" data-testid="account-editor">
      <div className="account-head">
        <Avatar url={avatar ?? sync.githubAvatarUrl} size={40} />
        <div className="account-pic-actions">
          <button
            type="button"
            className="ghost-button"
            data-testid="account-upload"
            onClick={() => fileRef.current?.click()}
          >
            Upload picture
          </button>
          {avatar && (
            <button
              type="button"
              className="ghost-button"
              data-testid="account-github-picture"
              onClick={() => setAvatar(null)}
            >
              Use GitHub picture
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          data-testid="account-file"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              setAvatar(await resizeToDataUrl(file))
              setError(null)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
        />
      </div>

      <SearchSelect
        label="Or a Pokémon"
        options={speciesOptions}
        value=""
        placeholder="Search a Pokémon…"
        testId="account-pokemon"
        onChange={(v) => {
          const species = listSpecies().find((s) => String(s.id) === v)
          const variety = species?.varieties.find((x) => x.is_default) ?? species?.varieties[0]
          if (variety?.sprites.official_artwork) setAvatar(variety.sprites.official_artwork)
        }}
      />

      <label className="ds-field">
        <span className="ds-field-label">Display name</span>
        <input
          className="ds-field-control"
          value={name}
          maxLength={40}
          placeholder={sync.githubName ?? ''}
          data-testid="account-display-name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      {error && <p className="account-error">{error}</p>}

      <div className="account-editor-actions">
        <button type="button" className="ghost-button" onClick={onDone} data-testid="account-cancel">
          Cancel
        </button>
        <button
          type="button"
          className="ghost-button account-save"
          disabled={saving}
          data-testid="account-save"
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
