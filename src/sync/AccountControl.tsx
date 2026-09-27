import { IconBrandGithub } from '@tabler/icons-react'
import { useDisclosureGroup } from '../modules/dex/query/useDisclosureGroup'
import { signInWithGitHub, signOut, useSyncState, type SyncStatus } from './teamSync'
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
 * The app bar's account control: "Sign in" while signed out, the GitHub name
 * once signed in, with a small panel saying where the Team Builder's data is and
 * a way out. A text-only ghost trigger, like Sort and Search/Filter beside it.
 */
export function AccountControl() {
  const sync = useSyncState()
  const { openId, toggle, ref } = useDisclosureGroup({ dismissOnOutsideClick: true })
  const open = openId === 'account'
  const signedIn = sync.status !== 'signed-out'

  if (!signedIn) {
    return (
      <button
        type="button"
        className="ghost-button app-controls-toggle account-trigger"
        data-testid="account-sign-in"
        title="Sign in with GitHub to keep your teams and builds on every device"
        onClick={() => void signInWithGitHub()}
      >
        Sign in
      </button>
    )
  }

  return (
    <div className="app-controls account" data-open={open} ref={ref} data-testid="account">
      <button
        type="button"
        className="ghost-button app-controls-toggle account-trigger"
        data-testid="account-toggle"
        data-status={sync.status}
        aria-expanded={open}
        onClick={() => toggle('account')}
      >
        {sync.avatarUrl && <img className="account-avatar" src={sync.avatarUrl} alt="" />}
        <span className="account-dot" data-status={sync.status} aria-hidden />
        {sync.user}
      </button>
      <div className="app-controls-panel account-panel" data-testid="account-panel">
        <div className="app-controls-field">
          <span className="account-who">
            <IconBrandGithub size={14} stroke={1.5} aria-hidden /> {sync.user}
          </span>
          <p className="account-status" data-testid="account-status" data-status={sync.status}>
            {STATUS_TEXT[sync.status]}
            {sync.status === 'synced' && sync.lastSynced && ` · ${when(sync.lastSynced)}`}
          </p>
          {sync.error && sync.status === 'error' && <p className="account-error">{sync.error}</p>}
          <p className="account-note">
            Your teams and builds are saved on this device and in your account, and follow you
            to any device you sign in on.
          </p>
        </div>
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
      </div>
    </div>
  )
}
