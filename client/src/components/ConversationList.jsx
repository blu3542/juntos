import { useEffect, useState } from 'react'
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
  .cl-new-btn:hover:not(:disabled) {
    background: #4338ca;
  }
  .cl-new-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .cl-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  .cl-item {
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    margin-bottom: 2px;
    border: 1px solid transparent;
  }
  .cl-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .cl-item.active {
    background: rgba(79, 70, 229, 0.12);
    border-color: rgba(79, 70, 229, 0.3);
  }
  .cl-item-title {
    font-size: 13px;
    font-weight: 500;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 3px;
  }
  .cl-item.active .cl-item-title {
    color: #a5b4fc;
  }
  .cl-item-date {
    font-size: 11px;
    color: #475569;
  }
  .cl-empty {
    padding: 24px 12px;
    text-align: center;
    color: #475569;
    font-size: 13px;
  }
  .cl-footer {
    padding: 12px 16px;
    border-top: 1px solid #1f2937;
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
  .cl-sign-out-btn:hover {
    border-color: #374151;
    color: #94a3b8;
  }
`

function formatDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

export default function ConversationList({ user, activeConversationId, onSelect, onNew }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchConversations()
  }, [user.id])

  const fetchConversations = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setConversations(data)
    }
    setLoading(false)
  }

  const handleNewConversation = async () => {
    setCreating(true)
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ user_id: user.id, title: 'New Conversation' }])
      .select()
      .single()

    if (!error && data) {
      setConversations((prev) => [data, ...prev])
      onNew(data.id)
    }
    setCreating(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <>
      <style>{styles}</style>
      <aside className="cl-sidebar">
        <div className="cl-header">
          <div className="cl-header-title">Conversations</div>
          <button
            className="cl-new-btn"
            onClick={handleNewConversation}
            disabled={creating}
          >
            <span style={{ fontSize: '16px' }}>+</span>
            {creating ? 'Creating...' : 'New Conversation'}
          </button>
        </div>

        <div className="cl-list">
          {loading ? (
            <div className="cl-empty">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="cl-empty">No conversations yet. Start a new one!</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`cl-item${activeConversationId === conv.id ? ' active' : ''}`}
                onClick={() => onSelect(conv.id)}
              >
                <div className="cl-item-title">
                  {conv.title || 'Untitled Conversation'}
                </div>
                <div className="cl-item-date">{formatDate(conv.created_at)}</div>
              </div>
            ))
          )}
        </div>

        <div className="cl-footer">
          <button className="cl-sign-out-btn" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
