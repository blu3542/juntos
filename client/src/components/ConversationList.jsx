import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { signOut } from '../lib/auth'

const styles = `
  .cl-sidebar {
    width: 260px;
    min-width: 260px;
    background: #FFFCF6;
    border-right: 1px solid #B9B9B9;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    font-family: 'Cabin', sans-serif;
  }
  .cl-header {
    padding: 20px 16px 12px;
    border-bottom: 1px solid #B9B9B9;
    flex-shrink: 0;
    background: #F3EFE8;
  }
  .cl-header-title {
    font-size: 20px;
    font-weight: 700;
    color: #106C54;
    margin-bottom: 12px;
    font-style: italic;
  }
  .cl-new-btn {
    width: 100%;
    background: #106C54;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    font-family: 'Cabin', sans-serif;
  }
  .cl-new-btn:hover:not(:disabled) { background: #659B90; }
  .cl-new-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .cl-new-btn-secondary {
    width: 100%;
    background: #659B90;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    margin-top: 8px;
    font-family: 'Cabin', sans-serif;
  }
  .cl-new-btn-secondary:hover:not(:disabled) { background: #106C54; }
  .cl-new-btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
  .cl-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    background: #FFFCF6;
  }
  .cl-section-label {
    font-size: 11px;
    font-weight: 600;
    color: #B9B9B9;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 8px 4px 4px;
  }
  .cl-item {
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    margin-bottom: 2px;
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cl-item:hover { background: rgba(16,108,84,0.06); }
  .cl-item.active {
    background: rgba(16,108,84,0.1);
    border-color: rgba(16,108,84,0.25);
  }
  .cl-item-icon { font-size: 14px; flex-shrink: 0; }
  .cl-item-body { flex: 1; min-width: 0; }
  .cl-item-title {
    font-size: 13px;
    font-weight: 500;
    color: #7A7A7A;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 3px;
  }
  .cl-item.active .cl-item-title { color: #106C54; }
  .cl-item-date { font-size: 11px; color: #B9B9B9; }
  .cl-empty { padding: 12px; text-align: center; color: #B9B9B9; font-size: 12px; }
  .cl-footer {
    padding: 12px 16px;
    border-top: 1px solid #B9B9B9;
    flex-shrink: 0;
    background: #F3EFE8;
  }
  .cl-sign-out-btn {
    width: 100%;
    background: transparent;
    border: 1px solid #B9B9B9;
    border-radius: 8px;
    padding: 8px;
    font-size: 12px;
    color: #7A7A7A;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    font-family: 'Cabin', sans-serif;
  }
  .cl-sign-out-btn:hover { border-color: #106C54; color: #106C54; }
  .cl-invite-banner {
    margin: 8px;
    background: rgba(16,108,84,0.06);
    border: 1px solid rgba(16,108,84,0.25);
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .cl-invite-banner-header {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: #106C54;
  }
  .cl-invite-banner-header:hover { background: rgba(16,108,84,0.06); }
  .cl-invite-item {
    padding: 10px 12px;
    border-top: 1px solid rgba(16,108,84,0.15);
    font-size: 12px;
    color: #7A7A7A;
  }
  .cl-invite-group-name { font-weight: 600; color: #106C54; margin-bottom: 2px; }
  .cl-invite-by { font-size: 11px; color: #B9B9B9; margin-bottom: 8px; }
  .cl-invite-actions { display: flex; gap: 6px; }
  .cl-invite-btn {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: opacity 0.2s;
    font-family: 'Cabin', sans-serif;
  }
  .cl-invite-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cl-invite-btn-accept { background: #106C54; color: #fff; }
  .cl-invite-btn-accept:hover:not(:disabled) { background: #659B90; }
  .cl-invite-btn-decline { background: transparent; color: #7A7A7A; border: 1px solid #B9B9B9; }
  .cl-invite-btn-decline:hover:not(:disabled) { border-color: #7A7A7A; }
  .cl-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .cl-modal {
    background: #FFFCF6;
    border: 1px solid #B9B9B9;
    border-radius: 14px;
    padding: 28px;
    width: 340px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    font-family: 'Cabin', sans-serif;
  }
  .cl-modal-title { font-size: 16px; font-weight: 700; color: #106C54; margin-bottom: 16px; }
  .cl-modal-input {
    width: 100%;
    background: #F3EFE8;
    border: 1px solid #B9B9B9;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 14px;
    color: #7A7A7A;
    outline: none;
    font-family: 'Cabin', sans-serif;
    transition: border-color 0.15s;
    margin-bottom: 16px;
    box-sizing: border-box;
  }
  .cl-modal-input:focus { border-color: #106C54; }
  .cl-modal-input::placeholder { color: #B9B9B9; }
  .cl-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .cl-modal-btn {
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background 0.2s, opacity 0.2s;
    font-family: 'Cabin', sans-serif;
  }
  .cl-modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cl-modal-btn-cancel { background: transparent; color: #7A7A7A; border: 1px solid #B9B9B9; }
  .cl-modal-btn-cancel:hover { border-color: #7A7A7A; }
  .cl-modal-btn-create { background: #106C54; color: #fff; }
  .cl-modal-btn-create:hover:not(:disabled) { background: #659B90; }
`

function formatDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function PendingInvitesBanner({ invites, onAccept, onDecline }) {
  const [expanded, setExpanded] = useState(true)
  const [resolving, setResolving] = useState({})

  if (invites.length === 0) return null

  const handleAccept = async (inviteId) => {
    setResolving((r) => ({ ...r, [inviteId]: true }))
    await onAccept(inviteId)
    setResolving((r) => ({ ...r, [inviteId]: false }))
  }
  const handleDecline = async (inviteId) => {
    setResolving((r) => ({ ...r, [inviteId]: true }))
    await onDecline(inviteId)
    setResolving((r) => ({ ...r, [inviteId]: false }))
  }

  return (
    <div className="cl-invite-banner">
      <div className="cl-invite-banner-header" onClick={() => setExpanded((e) => !e)}>
        <span>🔔 {invites.length} pending invite{invites.length > 1 ? 's' : ''}</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && invites.map((inv) => (
        <div key={inv.id} className="cl-invite-item">
          <div className="cl-invite-group-name">{inv.group_name ?? 'Group Chat'}</div>
          <div className="cl-invite-by">Invited by {inv.inviter_display_name ?? 'a member'}</div>
          <div className="cl-invite-actions">
            <button
              className="cl-invite-btn cl-invite-btn-accept"
              disabled={resolving[inv.id]}
              onClick={() => handleAccept(inv.id)}
            >
              {resolving[inv.id] ? '...' : 'Accept'}
            </button>
            <button
              className="cl-invite-btn cl-invite-btn-decline"
              disabled={resolving[inv.id]}
              onClick={() => handleDecline(inv.id)}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function CreateGroupModal({ onCreated, onClose }) {
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    const name = groupName.trim()
    if (!name) return
    setCreating(true)
    try {
      const conv = await api.createGroupConversation(name)
      onCreated(conv.id)
    } catch (e) {
      console.error('createGroupConversation error:', e)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="cl-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cl-modal">
        <div className="cl-modal-title">New Group Chat</div>
        <input
          className="cl-modal-input"
          type="text"
          placeholder="Group name (e.g. Maui Trip 2025)"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && groupName.trim()) handleCreate() }}
          autoFocus
          disabled={creating}
        />
        <div className="cl-modal-actions">
          <button className="cl-modal-btn cl-modal-btn-cancel" onClick={onClose} disabled={creating}>Cancel</button>
          <button
            className="cl-modal-btn cl-modal-btn-create"
            onClick={handleCreate}
            disabled={!groupName.trim() || creating}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ConversationList({ user, activeConversationId, onSelect, onNew }) {
  const [soloConversations, setSoloConversations] = useState([])
  const [groupConversations, setGroupConversations] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const inviteIntervalRef = useRef(null)

  useEffect(() => {
    fetchAll()
    // Poll for new invites every 15s instead of Supabase Realtime
    inviteIntervalRef.current = setInterval(fetchInvites, 15000)
    return () => clearInterval(inviteIntervalRef.current)
  }, [user.id])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchConversations(), fetchInvites()])
    setLoading(false)
  }

  const fetchConversations = async () => {
    try {
      const { solo, groups } = await api.getConversations()
      setSoloConversations(solo ?? [])
      setGroupConversations(groups ?? [])
    } catch (e) {
      console.error('fetchConversations error:', e)
    }
  }

  const fetchInvites = async () => {
    try {
      const invites = await api.getInvites()
      setPendingInvites(invites ?? [])
    } catch (e) {
      console.error('fetchInvites error:', e)
    }
  }

  const handleNewSolo = async () => {
    setCreating(true)
    try {
      const conv = await api.createConversation()
      setSoloConversations((prev) => [conv, ...prev])
      onNew(conv.id, false)
    } catch (e) {
      console.error('createConversation error:', e)
    } finally {
      setCreating(false)
    }
  }

  const handleGroupCreated = (convId) => {
    setShowCreateGroup(false)
    fetchConversations()
    onNew(convId, true)
  }

  const handleAcceptInvite = async (inviteId) => {
    try {
      await api.acceptInvite(inviteId)
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
      await fetchConversations()
    } catch (e) {
      console.error('acceptInvite error:', e)
    }
  }

  const handleDeclineInvite = async (inviteId) => {
    try {
      await api.declineInvite(inviteId)
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
    } catch (e) {
      console.error('declineInvite error:', e)
    }
  }

  const handleSignOut = () => signOut()

  return (
    <>
      <style>{styles}</style>
      {showCreateGroup && (
        <CreateGroupModal
          user={user}
          onCreated={handleGroupCreated}
          onClose={() => setShowCreateGroup(false)}
        />
      )}
      <aside className="cl-sidebar">
        <div className="cl-header">
          <img src="/juntos-logo.png" alt="juntos" style={{ height: '32px', width: 'auto', marginBottom: '16px' }} />
          <button className="cl-new-btn" onClick={() => setShowCreateGroup(true)}>
            New Group Chat
          </button>
          <button className="cl-new-btn-secondary" onClick={handleNewSolo} disabled={creating}>
            {creating ? 'Creating...' : 'New Agent Chat'}
          </button>
        </div>

        <PendingInvitesBanner
          invites={pendingInvites}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
        />

        <div className="cl-list">
          {loading ? (
            <div className="cl-empty">Loading...</div>
          ) : (
            <>
              <div className="cl-section-label">Agent Chats</div>
              {soloConversations.length === 0 ? (
                <div className="cl-empty">No chats yet.</div>
              ) : (
                soloConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`cl-item${activeConversationId === conv.id ? ' active' : ''}`}
                    onClick={() => onSelect(conv.id, false)}
                  >
                    <span className="cl-item-icon">🤖</span>
                    <div className="cl-item-body">
                      <div className="cl-item-title">{conv.title || 'Untitled Conversation'}</div>
                      <div className="cl-item-date">{formatDate(conv.created_at)}</div>
                    </div>
                  </div>
                ))
              )}

              <div className="cl-section-label" style={{ marginTop: '8px' }}>Group Chats</div>
              {groupConversations.length === 0 ? (
                <div className="cl-empty">No groups yet. Create one!</div>
              ) : (
                groupConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`cl-item${activeConversationId === conv.id ? ' active' : ''}`}
                    onClick={() => onSelect(conv.id, true)}
                  >
                    <span className="cl-item-icon">👥</span>
                    <div className="cl-item-body">
                      <div className="cl-item-title">{conv.group_name || 'Unnamed Group'}</div>
                      <div className="cl-item-date">{formatDate(conv.created_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        <div className="cl-footer">
          <button className="cl-sign-out-btn" onClick={handleSignOut}>Sign Out</button>
        </div>
      </aside>
    </>
  )
}
