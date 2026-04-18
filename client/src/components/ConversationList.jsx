import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const styles = `
  .cl-sidebar {
    width: 260px;
    min-width: 260px;
    background: #0b1220;
    border-right: 1px solid #1f2937;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .cl-header {
    padding: 20px 16px 12px;
    border-bottom: 1px solid #1f2937;
    flex-shrink: 0;
  }
  .cl-header-title {
    font-size: 13px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 12px;
  }
  .cl-new-btn {
    width: 100%;
    background: #4f46e5;
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
  }
  .cl-new-btn:hover:not(:disabled) { background: #4338ca; }
  .cl-new-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .cl-new-btn-secondary {
    width: 100%;
    background: transparent;
    color: #94a3b8;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    margin-top: 8px;
  }
  .cl-new-btn-secondary:hover:not(:disabled) {
    border-color: #374151;
    color: #e2e8f0;
  }
  .cl-new-btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
  .cl-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  .cl-section-label {
    font-size: 10px;
    font-weight: 700;
    color: #475569;
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
  .cl-item:hover { background: rgba(255, 255, 255, 0.04); }
  .cl-item.active {
    background: rgba(79, 70, 229, 0.12);
    border-color: rgba(79, 70, 229, 0.3);
  }
  .cl-item-icon { font-size: 14px; flex-shrink: 0; }
  .cl-item-body { flex: 1; min-width: 0; }
  .cl-item-title {
    font-size: 13px;
    font-weight: 500;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 3px;
  }
  .cl-item.active .cl-item-title { color: #a5b4fc; }
  .cl-item-date { font-size: 11px; color: #475569; }
  .cl-empty { padding: 12px; text-align: center; color: #475569; font-size: 12px; }
  .cl-footer {
    padding: 12px 16px;
    border-top: 1px solid #1f2937;
    flex-shrink: 0;
  }
  .cl-sign-out-btn {
    width: 100%;
    background: transparent;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 8px;
    font-size: 12px;
    color: #475569;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .cl-sign-out-btn:hover { border-color: #374151; color: #94a3b8; }

  /* Invite banner */
  .cl-invite-banner {
    margin: 8px;
    background: rgba(79, 70, 229, 0.1);
    border: 1px solid rgba(79, 70, 229, 0.3);
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
    color: #a5b4fc;
  }
  .cl-invite-banner-header:hover { background: rgba(79, 70, 229, 0.08); }
  .cl-invite-item {
    padding: 10px 12px;
    border-top: 1px solid rgba(79, 70, 229, 0.2);
    font-size: 12px;
    color: #94a3b8;
  }
  .cl-invite-group-name { font-weight: 600; color: #e2e8f0; margin-bottom: 2px; }
  .cl-invite-by { font-size: 11px; color: #475569; margin-bottom: 8px; }
  .cl-invite-actions { display: flex; gap: 6px; }
  .cl-invite-btn {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: opacity 0.2s;
  }
  .cl-invite-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cl-invite-btn-accept { background: #4f46e5; color: #fff; }
  .cl-invite-btn-accept:hover:not(:disabled) { background: #4338ca; }
  .cl-invite-btn-decline { background: transparent; color: #94a3b8; border: 1px solid #1f2937; }
  .cl-invite-btn-decline:hover:not(:disabled) { border-color: #374151; color: #e2e8f0; }

  /* Create group modal overlay */
  .cl-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .cl-modal {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 14px;
    padding: 28px;
    width: 340px;
    box-shadow: 0 25px 50px rgba(0,0,0,0.5);
  }
  .cl-modal-title {
    font-size: 16px;
    font-weight: 700;
    color: #e2e8f0;
    margin-bottom: 16px;
  }
  .cl-modal-input {
    width: 100%;
    background: #0f172a;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 14px;
    color: #e2e8f0;
    outline: none;
    font-family: inherit;
    transition: border-color 0.15s;
    margin-bottom: 16px;
  }
  .cl-modal-input:focus { border-color: #4f46e5; }
  .cl-modal-input::placeholder { color: #475569; }
  .cl-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .cl-modal-btn {
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background 0.2s, opacity 0.2s;
  }
  .cl-modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cl-modal-btn-cancel { background: transparent; color: #94a3b8; border: 1px solid #1f2937; }
  .cl-modal-btn-cancel:hover { border-color: #374151; color: #e2e8f0; }
  .cl-modal-btn-create { background: #4f46e5; color: #fff; }
  .cl-modal-btn-create:hover:not(:disabled) { background: #4338ca; }
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
          <div className="cl-invite-group-name">{inv.conversations?.group_name ?? 'Group Chat'}</div>
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

function CreateGroupModal({ user, onCreated, onClose }) {
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    const name = groupName.trim()
    if (!name) return
    setCreating(true)
    const { data: convId, error } = await supabase.rpc('create_group_conversation', { p_group_name: name })
    setCreating(false)
    if (!error && convId) {
      onCreated(convId)
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
  const inviteChannelRef = useRef(null)

  useEffect(() => {
    fetchAll()
    subscribeToInvites()
    return () => {
      if (inviteChannelRef.current) {
        supabase.removeChannel(inviteChannelRef.current)
      }
    }
  }, [user.id])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchSolo(), fetchGroups(), fetchInvites()])
    setLoading(false)
  }

  const fetchSolo = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_group', false)
      .order('created_at', { ascending: false })
    if (!error && data) setSoloConversations(data)
  }

  const fetchGroups = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*, group_members!inner(user_id)')
      .eq('group_members.user_id', user.id)
      .eq('is_group', true)
      .order('created_at', { ascending: false })
    if (!error && data) setGroupConversations(data)
  }

  const fetchInvites = async () => {
    const { data, error } = await supabase
      .from('group_invites')
      .select('*, conversations(group_name, id)')
      .eq('invited_user_id', user.id)
      .eq('status', 'pending')
    if (!error && data) {
      // Enrich with inviter display names
      const enriched = await Promise.all(data.map(async (inv) => {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('id', inv.invited_by)
          .maybeSingle()
        return {
          ...inv,
          inviter_display_name: profile?.display_name ?? null,
        }
      }))
      setPendingInvites(enriched)
    }
  }

  const subscribeToInvites = () => {
    const channel = supabase
      .channel(`invites-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_invites',
          filter: `invited_user_id=eq.${user.id}`,
        },
        () => fetchInvites()
      )
      .subscribe()
    inviteChannelRef.current = channel
  }

  const handleNewSolo = async () => {
    setCreating(true)
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ user_id: user.id, title: 'New Conversation' }])
      .select()
      .single()
    if (!error && data) {
      setSoloConversations((prev) => [data, ...prev])
      onNew(data.id, false)
    }
    setCreating(false)
  }

  const handleGroupCreated = (convId) => {
    setShowCreateGroup(false)
    fetchGroups()
    onNew(convId, true)
  }

  const handleAcceptInvite = async (inviteId) => {
    const { error } = await supabase.rpc('accept_group_invite', { p_invite_id: inviteId })
    if (!error) {
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
      await fetchGroups()
    }
  }

  const handleDeclineInvite = async (inviteId) => {
    const { error } = await supabase.rpc('decline_group_invite', { p_invite_id: inviteId })
    if (!error) {
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

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
          <div className="cl-header-title">Conversations</div>
          <button className="cl-new-btn" onClick={handleNewSolo} disabled={creating}>
            <span style={{ fontSize: '16px' }}>+</span>
            {creating ? 'Creating...' : 'New Chat'}
          </button>
          <button className="cl-new-btn-secondary" onClick={() => setShowCreateGroup(true)}>
            <span style={{ fontSize: '14px' }}>👥</span>
            New Group
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
