import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import MessageBubble from './MessageBubble'

const AGENT_FUNCTION_URL =
  'https://nigvyotnrlgbqeeyueql.supabase.co/functions/v1/agent'

const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pZ3Z5b3RucmxnYnFlZXl1ZXFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mjc1MDUsImV4cCI6MjA5MTEwMzUwNX0.d4BeEIwilSpG5etMUQyr-PnusnI5bCm6tcPwVwaagj4'

// Palette for member avatar initials
const AVATAR_COLORS = [
  '#4f46e5', '#0e7490', '#059669', '#d97706',
  '#dc2626', '#7c3aed', '#db2777', '#0284c7',
]
function avatarColor(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const styles = `
  /* ── Outer shell: row layout so drawer pushes chat ── */
  .cw-outer {
    display: flex;
    flex-direction: row;
    height: 100vh;
    overflow: hidden;
    background: #0f172a;
  }

  /* ── Main chat column ── */
  .cw-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .cw-header {
    padding: 0 16px 0 20px;
    height: 66px;
    border-bottom: 1px solid #1f2937;
    background: #111827;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .cw-header-clickable {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    cursor: pointer;
    border-radius: 8px;
    padding: 6px 8px;
    margin: -6px -8px;
    transition: background 0.15s;
  }
  .cw-header-clickable:hover { background: rgba(255,255,255,0.04); }
  .cw-header-icon {
    width: 34px;
    height: 34px;
    background: rgba(14, 116, 144, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }
  .cw-header-info { flex: 1; min-width: 0; }
  .cw-header-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }
  .cw-header-sub { font-size: 12px; color: #0e7490; margin-top: 1px; }
  .cw-header-sub-group { font-size: 12px; color: #94a3b8; margin-top: 1px; }
  .cw-invite-btn {
    background: #4f46e5;
    border: none;
    border-radius: 8px;
    padding: 7px 13px;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .cw-invite-btn:hover { background: #4338ca; }

  .cw-messages {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }
  .cw-thinking {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 16px;
    border-bottom-left-radius: 4px;
    width: fit-content;
    margin-bottom: 16px;
  }
  .cw-thinking-label {
    font-size: 12px;
    font-weight: 600;
    color: #0e7490;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .cw-dots { display: flex; gap: 4px; align-items: center; }
  .cw-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #94a3b8;
    animation: dotBounce 1.2s infinite ease-in-out;
  }
  .cw-dot:nth-child(2) { animation-delay: 0.2s; }
  .cw-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dotBounce {
    0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }
  .cw-composer {
    padding: 16px 20px;
    border-top: 1px solid #1f2937;
    background: #111827;
    display: flex;
    gap: 10px;
    align-items: flex-end;
    flex-shrink: 0;
  }
  .cw-input {
    flex: 1;
    background: #0f172a;
    border: 1px solid #1f2937;
    border-radius: 12px;
    padding: 11px 14px;
    font-size: 14px;
    color: #e2e8f0;
    outline: none;
    resize: none;
    min-height: 44px;
    max-height: 140px;
    font-family: inherit;
    transition: border-color 0.2s;
    line-height: 1.5;
  }
  .cw-input:focus { border-color: #4f46e5; }
  .cw-input::placeholder { color: #475569; }
  .cw-send-btn {
    background: #4f46e5;
    border: none;
    border-radius: 10px;
    width: 42px; height: 42px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s, opacity 0.2s;
  }
  .cw-send-btn:hover:not(:disabled) { background: #4338ca; }
  .cw-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cw-error {
    margin: 0 24px 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
  }
  .cw-empty {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100%; color: #475569;
    text-align: center; gap: 8px;
  }
  .cw-empty-icon { font-size: 36px; margin-bottom: 4px; }
  .cw-empty-title { font-size: 16px; font-weight: 600; color: #64748b; }
  .cw-empty-sub { font-size: 13px; }
  .cw-attachments-preview {
    display: flex; flex-wrap: wrap; gap: 8px;
    padding: 0 20px 12px; background: #111827;
  }
  .cw-attachment-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: #0f172a; border: 1px solid #1f2937;
    border-radius: 999px; padding: 5px 10px 5px 8px;
    font-size: 12px; color: #cbd5e1; max-width: 200px;
  }
  .cw-attachment-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-attachment-chip-remove {
    border: none; background: transparent; color: #64748b;
    cursor: pointer; font-size: 15px; line-height: 1; padding: 0;
    display: flex; align-items: center; flex-shrink: 0;
    transition: color 0.15s; -webkit-appearance: none; appearance: none;
  }
  .cw-attachment-chip-remove:hover { color: #f87171; }
  .cw-attach-btn {
    background: transparent; border: 1px solid #1f2937;
    border-radius: 10px; width: 42px; height: 42px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: border-color 0.2s, background 0.2s;
    color: #64748b; -webkit-appearance: none; appearance: none; padding: 0;
  }
  .cw-attach-btn:hover:not(:disabled) { border-color: #374151; background: #1f2937; color: #94a3b8; }
  .cw-attach-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Members / Invite drawer ── */
  .cw-drawer {
    width: 272px;
    min-width: 272px;
    background: #0b1220;
    border-left: 1px solid #1f2937;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.22s ease, min-width 0.22s ease, opacity 0.22s ease;
    opacity: 1;
  }
  .cw-drawer.closed {
    width: 0;
    min-width: 0;
    opacity: 0;
    pointer-events: none;
  }
  .cw-drawer-header {
    padding: 18px 16px 14px;
    border-bottom: 1px solid #1f2937;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .cw-drawer-title { font-size: 13px; font-weight: 700; color: #e2e8f0; white-space: nowrap; }
  .cw-drawer-close {
    background: transparent; border: none; color: #475569;
    cursor: pointer; font-size: 20px; line-height: 1; padding: 0;
    transition: color 0.15s; flex-shrink: 0;
  }
  .cw-drawer-close:hover { color: #94a3b8; }
  .cw-drawer-body { flex: 1; overflow-y: auto; padding: 16px; }
  .cw-drawer-section-label {
    font-size: 10px; font-weight: 700; color: #475569;
    text-transform: uppercase; letter-spacing: 0.8px;
    margin-bottom: 10px; white-space: nowrap;
  }

  /* Member rows */
  .cw-member-row {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 0; min-width: 0;
  }
  .cw-member-avatar {
    width: 30px; height: 30px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: #fff;
    flex-shrink: 0;
  }
  .cw-member-name {
    font-size: 13px; color: #cbd5e1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1; min-width: 0;
  }
  .cw-member-you {
    font-size: 10px; font-weight: 600; color: #475569;
    background: #1f2937; border-radius: 4px; padding: 1px 5px;
    flex-shrink: 0; white-space: nowrap;
  }

  /* Invite form inside drawer */
  .cw-drawer-divider { border: none; border-top: 1px solid #1f2937; margin: 16px 0; }
  .cw-inv-input {
    width: 100%; background: #0f172a;
    border: 1px solid #1f2937; border-radius: 8px;
    padding: 9px 12px; font-size: 13px; color: #e2e8f0;
    outline: none; font-family: inherit;
    transition: border-color 0.15s; margin-bottom: 8px;
    box-sizing: border-box;
  }
  .cw-inv-input:focus { border-color: #4f46e5; }
  .cw-inv-input::placeholder { color: #475569; }
  .cw-inv-lookup-btn {
    width: 100%; background: #1f2937; border: 1px solid #374151;
    border-radius: 8px; padding: 8px; font-size: 13px; font-weight: 600;
    color: #94a3b8; cursor: pointer;
    transition: background 0.2s, color 0.2s; margin-bottom: 10px;
  }
  .cw-inv-lookup-btn:hover:not(:disabled) { background: #374151; color: #e2e8f0; }
  .cw-inv-lookup-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cw-inv-found {
    background: rgba(79, 70, 229, 0.1); border: 1px solid rgba(79, 70, 229, 0.3);
    border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
    font-size: 13px; color: #a5b4fc;
  }
  .cw-inv-send-btn {
    width: 100%; background: #4f46e5; border: none;
    border-radius: 8px; padding: 9px; font-size: 13px; font-weight: 600;
    color: #fff; cursor: pointer; transition: background 0.2s, opacity 0.2s;
  }
  .cw-inv-send-btn:hover:not(:disabled) { background: #4338ca; }
  .cw-inv-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cw-inv-msg {
    font-size: 12px; margin-top: 8px; padding: 7px 10px; border-radius: 6px;
  }
  .cw-inv-msg.success {
    background: rgba(16, 185, 129, 0.1); color: #6ee7b7;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }
  .cw-inv-msg.error {
    background: rgba(239, 68, 68, 0.1); color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }
`

function fileIcon(fileType) {
  if (fileType?.startsWith('image/')) return '🖼️'
  if (fileType === 'application/pdf') return '📄'
  return '📎'
}

function MembersDrawer({ open, onClose, conversationId, user, members, onMembersUpdated }) {
  const [emailInput, setEmailInput] = useState('')
  const [looking, setLooking] = useState(false)
  const [foundUser, setFoundUser] = useState(null)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState(null)

  // Reset invite form whenever drawer opens
  useEffect(() => {
    if (open) { setEmailInput(''); setFoundUser(null); setMsg(null) }
  }, [open])

  const handleLookup = async () => {
    const email = emailInput.trim().toLowerCase()
    if (!email) return
    setLooking(true); setFoundUser(null); setMsg(null)
    const { data, error } = await supabase.rpc('lookup_user_by_email', { p_email: email })
    setLooking(false)
    if (error || !data?.length) { setMsg({ type: 'error', text: 'No account found with that email.' }); return }
    const found = data[0]
    if (found.user_id === user.id) { setMsg({ type: 'error', text: "That's you!" }); return }
    if (members.some((m) => m.user_id === found.user_id)) { setMsg({ type: 'error', text: 'Already a member.' }); return }
    setFoundUser(found)
  }

  const handleInvite = async () => {
    if (!foundUser) return
    setSending(true)
    const { error } = await supabase.from('group_invites').insert({
      conversation_id: conversationId,
      invited_by: user.id,
      invited_user_id: foundUser.user_id,
    })
    setSending(false)
    if (error) {
      setMsg({ type: 'error', text: error.code === '23505' ? 'Invite already sent.' : error.message })
    } else {
      setMsg({ type: 'success', text: `Invite sent to ${foundUser.display_name}!` })
      setFoundUser(null); setEmailInput('')
    }
  }

  return (
    <div className={`cw-drawer${open ? '' : ' closed'}`}>
      <div className="cw-drawer-header">
        <span className="cw-drawer-title">Group Info</span>
        <button className="cw-drawer-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="cw-drawer-body">
        {/* Members list */}
        <div className="cw-drawer-section-label">
          Members — {members.length}
        </div>
        {members.map((m) => {
          const name = m.display_name ?? '?'
          const isYou = m.user_id === user.id
          return (
            <div key={m.user_id} className="cw-member-row">
              <div
                className="cw-member-avatar"
                style={{ background: avatarColor(name) }}
              >
                {name[0]?.toUpperCase()}
              </div>
              <span className="cw-member-name">{name}</span>
              {isYou && <span className="cw-member-you">you</span>}
            </div>
          )
        })}

        {/* Invite section */}
        <hr className="cw-drawer-divider" />
        <div className="cw-drawer-section-label">Invite by Email</div>
        <input
          className="cw-inv-input"
          type="email"
          placeholder="Enter email address"
          value={emailInput}
          onChange={(e) => { setEmailInput(e.target.value); setFoundUser(null); setMsg(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleLookup() }}
          disabled={looking || sending}
        />
        <button
          className="cw-inv-lookup-btn"
          onClick={handleLookup}
          disabled={!emailInput.trim() || looking || sending}
        >
          {looking ? 'Looking up...' : 'Look Up User'}
        </button>
        {foundUser && (
          <>
            <div className="cw-inv-found">Found: <strong>{foundUser.display_name}</strong></div>
            <button className="cw-inv-send-btn" onClick={handleInvite} disabled={sending}>
              {sending ? 'Sending...' : 'Send Invite'}
            </button>
          </>
        )}
        {msg && <div className={`cw-inv-msg ${msg.type}`}>{msg.text}</div>}
      </div>
    </div>
  )
}

export default function ChatWindow({ user, conversationId, isGroup }) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [sendError, setSendError] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploadError, setUploadError] = useState('')

  const [groupMeta, setGroupMeta] = useState(null)
  const [members, setMembers] = useState([])
  const [userDisplayName, setUserDisplayName] = useState('')
  const [showDrawer, setShowDrawer] = useState(false)

  const bottomRef = useRef(null)
  const channelRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!conversationId) return
    setMessages([])
    setIsThinking(false)
    setSendError('')
    setUploadError('')
    setPendingFiles([])
    setShowDrawer(false)
    setLoadingMessages(true)
    fetchMessages()
    if (isGroup) fetchGroupContext()
  }, [conversationId, isGroup])

  useEffect(() => {
    if (!conversationId) return
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMessage = payload.new
          setMessages((prev) => prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage])
          if (newMessage.is_agent || newMessage.role === 'assistant') setIsThinking(false)
        }
      )
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel); channelRef.current = null }
  }, [conversationId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isThinking])

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages').select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) console.error('fetchMessages error:', error)
      else if (data) setMessages(data)
    } catch (e) {
      console.error('fetchMessages threw:', e)
    } finally {
      setLoadingMessages(false)
    }
  }

  const fetchGroupContext = async () => {
    const [convRes, membersRes, profileRes] = await Promise.all([
      supabase.from('conversations').select('group_name').eq('id', conversationId).single(),
      supabase.rpc('get_group_members', { p_conversation_id: conversationId }),
      supabase.from('user_profiles').select('display_name').eq('id', user.id).maybeSingle(),
    ])
    if (!convRes.error && convRes.data) setGroupMeta(convRes.data)
    if (!membersRes.error && membersRes.data) {
      setMembers(membersRes.data.map((m) => ({ user_id: m.user_id, display_name: m.display_name ?? null })))
    }
    setUserDisplayName(profileRes.data?.display_name ?? user.email.split('@')[0])
  }

  const handleAttachClick = () => fileInputRef.current?.click()

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) { setPendingFiles((prev) => [...prev, ...files]); setUploadError('') }
    e.target.value = ''
  }

  const removePendingFile = (i) => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))

  const uploadFilesToStorage = async () => {
    const attachments = []
    for (const file of pendingFiles) {
      const safeName = `${crypto.randomUUID()}-${file.name}`
      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .upload(safeName, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`)
      const { data: pub } = supabase.storage.from('chat-attachments').getPublicUrl(data.path)
      attachments.push({ name: file.name, path: data.path, url: pub.publicUrl, mime_type: file.type || 'application/octet-stream', size: file.size })
    }
    return attachments
  }

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text) return
    setSendError(''); setUploadError(''); setInputText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    if (isGroup) await handleGroupSend(text)
    else await handleSoloSend(text)
  }

  const handleSoloSend = async (text) => {
    setIsThinking(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      if (!s?.access_token) throw new Error('Not authenticated')
      let attachments = []
      if (pendingFiles.length > 0) {
        try { attachments = await uploadFilesToStorage(); setPendingFiles([]) }
        catch (e) { setUploadError(e.message || 'File upload failed.'); setIsThinking(false); return }
      }
      const res = await fetch(AGENT_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ conversation_id: conversationId, user_message: text, access_token: s.access_token, attachments }),
      })
      if (!res.ok) throw new Error((await res.text()) || `Status ${res.status}`)
    } catch (err) {
      setSendError(err.message || 'Failed to send message.')
      setIsThinking(false)
    }
  }

  const handleGroupSend = async (text) => {
    const isAgentCommand = /^@travel-agent\b/i.test(text)
    const displayName = userDisplayName || user.email.split('@')[0]
    const { error: insertErr } = await supabase.from('messages').insert({
      conversation_id: conversationId, role: 'user', content: text,
      is_agent: false, sender_id: user.id, sender_display_name: displayName,
    })
    if (insertErr) { setSendError(insertErr.message || 'Failed to send.'); return }
    if (isAgentCommand) {
      setIsThinking(true)
      try {
        const { data: { session: s } } = await supabase.auth.getSession()
        if (!s?.access_token) throw new Error('Not authenticated')
        const res = await fetch(AGENT_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ conversation_id: conversationId, user_message: text, access_token: s.access_token, is_group: true, sender_display_name: displayName }),
        })
        if (!res.ok) throw new Error((await res.text()) || `Status ${res.status}`)
      } catch (err) { setSendError(err.message || 'Failed to invoke agent.'); setIsThinking(false) }
    }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  const handleTextareaChange = (e) => {
    setInputText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  const groupName = groupMeta?.group_name ?? 'Group Chat'
  const placeholder = isGroup
    ? 'Message the group, or @travel-agent to invoke AI...'
    : 'Ask about destinations, hotels, itineraries...'

  return (
    <>
      <style>{styles}</style>
      <div className="cw-outer">
        {/* ── Main chat column ── */}
        <div className="cw-main">
          <div className="cw-header">
            {/* Clickable zone: icon + title + subtitle */}
            <div
              className="cw-header-clickable"
              onClick={() => isGroup && setShowDrawer((v) => !v)}
              title={isGroup ? 'View group info' : undefined}
              style={{ cursor: isGroup ? 'pointer' : 'default' }}
            >
              <div className="cw-header-icon">{isGroup ? '👥' : '✈️'}</div>
              <div className="cw-header-info">
                <div className="cw-header-title">{isGroup ? groupName : 'Travel Agent'}</div>
                {isGroup ? (
                  <div className="cw-header-sub-group">
                    {members.length > 0 ? `${members.length} member${members.length !== 1 ? 's' : ''}` : 'Group'}
                    {' · '}Use <strong>@travel-agent</strong> to invoke AI
                  </div>
                ) : (
                  <div className="cw-header-sub">AI-powered travel planning</div>
                )}
              </div>
            </div>

            {/* Invite button — opens drawer scrolled to invite form */}
            {isGroup && (
              <button className="cw-invite-btn" onClick={() => setShowDrawer(true)}>
                + Invite
              </button>
            )}
          </div>

          <div className="cw-messages">
            {loadingMessages ? (
              <div className="cw-empty"><div style={{ color: '#475569', fontSize: '14px' }}>Loading messages...</div></div>
            ) : messages.length === 0 && !isThinking ? (
              <div className="cw-empty">
                <div className="cw-empty-icon">{isGroup ? '👥' : '🗺️'}</div>
                <div className="cw-empty-title">{isGroup ? 'Group chat started' : 'Start planning your trip'}</div>
                <div className="cw-empty-sub">
                  {isGroup
                    ? 'Everyone in the group can chat here. Type @travel-agent to get AI help.'
                    : 'Ask me anything about destinations, itineraries, budgets, and more.'}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} isGroup={isGroup} currentUserId={user.id} />
                ))}
                {isThinking && (
                  <div>
                    <div className="cw-thinking-label">Travel Agent</div>
                    <div className="cw-thinking">
                      <div className="cw-dots">
                        <div className="cw-dot" /><div className="cw-dot" /><div className="cw-dot" />
                      </div>
                      <span style={{ fontSize: '13px', color: '#94a3b8' }}>Thinking...</span>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {(uploadError || sendError) && (
            <div className="cw-error">{uploadError || sendError}</div>
          )}

          {pendingFiles.length > 0 && (
            <div className="cw-attachments-preview">
              {pendingFiles.map((file, i) => (
                <div key={i} className="cw-attachment-chip">
                  <span>{fileIcon(file.type)}</span>
                  <span className="cw-attachment-chip-name">{file.name}</span>
                  <button className="cw-attachment-chip-remove" onClick={() => removePendingFile(i)}>×</button>
                </div>
              ))}
            </div>
          )}

          <div className="cw-composer">
            <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx,.txt,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
            {!isGroup && (
              <button className="cw-attach-btn" onClick={handleAttachClick} disabled={isThinking} aria-label="Attach file">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
            )}
            <textarea
              ref={textareaRef}
              className="cw-input"
              placeholder={placeholder}
              value={inputText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={isThinking && !isGroup}
              rows={1}
            />
            <button
              className="cw-send-btn"
              onClick={handleSend}
              disabled={!inputText.trim() || (isThinking && !isGroup)}
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Members / Invite drawer ── */}
        {isGroup && (
          <MembersDrawer
            open={showDrawer}
            onClose={() => setShowDrawer(false)}
            conversationId={conversationId}
            user={user}
            members={members}
          />
        )}
      </div>
    </>
  )
}
