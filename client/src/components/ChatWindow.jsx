import { useEffect, useRef, useState } from 'react'
import { supabase, supabaseAnonKey } from '../lib/supabase'
import MessageBubble from './MessageBubble'

const AGENT_FUNCTION_URL =
  'https://nigvyotnrlgbqeeyueql.supabase.co/functions/v1/agent'

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

function TodosModal({ open, onClose, conversationId, user, members, userDisplayName, messages }) {
  const [text, setText] = useState('')
  const [assigneeInput, setAssigneeInput] = useState('')
  const [assigneeId, setAssigneeId] = useState(null)
  const [assigneeActiveIndex, setAssigneeActiveIndex] = useState(0)
  const [dueDate, setDueDate] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setText('')
    setAssigneeInput('')
    setAssigneeId(null)
    setAssigneeActiveIndex(0)
    setDueDate('')
    setErr('')
  }, [open])

  const memberOptions = (members || []).map((m) => ({
    user_id: m.user_id,
    display_name: m.display_name ?? 'Unknown',
  }))

  const normalize = (s) => (s || '').trim().toLowerCase()
  const assigneeQuery = assigneeInput.startsWith('@') ? normalize(assigneeInput.slice(1)) : ''
  const assigneeMatches = assigneeInput.startsWith('@')
    ? memberOptions
        .filter((m) => normalize(m.display_name).includes(assigneeQuery))
        .slice(0, 8)
    : []

  useEffect(() => {
    // If user types an exact name (case-insensitive), auto-select the assignee.
    if (!assigneeInput.startsWith('@')) return
    const exact = memberOptions.find((m) => normalize(m.display_name) === assigneeQuery)
    if (exact) setAssigneeId(exact.user_id)
    if (assigneeActiveIndex >= assigneeMatches.length) setAssigneeActiveIndex(0)
  }, [assigneeInput, members])

  const todoCreates = messages.filter((m) => (m?.content || '').startsWith('__TODO__'))
  const todoEvents = messages.filter((m) => (m?.content || '').startsWith('__TODO_'))

  const stateById = new Map()
  for (const m of todoCreates) {
    try {
      const t = JSON.parse((m.content || '').replace(/^__TODO__/, ''))
      if (!t?.todo_id || !t?.text) continue
      stateById.set(t.todo_id, {
        todo_id: t.todo_id,
        text: t.text,
        created_at: t.created_at || m.created_at,
        created_by: t.created_by || m.sender_id,
        created_by_name: t.created_by_name || m.sender_display_name || null,
        completed: false,
        assignee_user_id: t.assignee_user_id || null,
        assignee_display_name: t.assignee_display_name || null,
        due_date: t.due_date || null,
      })
    } catch {
      // ignore
    }
  }

  const eventsOrdered = [...todoEvents].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  for (const m of eventsOrdered) {
    const c = m?.content || ''
    try {
      if (c.startsWith('__TODO_TOGGLE__')) {
        const ev = JSON.parse(c.replace(/^__TODO_TOGGLE__/, ''))
        const st = stateById.get(ev?.todo_id)
        if (!st) continue
        st.completed = !!ev?.completed
      } else if (c.startsWith('__TODO_UPDATE__')) {
        const ev = JSON.parse(c.replace(/^__TODO_UPDATE__/, ''))
        const st = stateById.get(ev?.todo_id)
        if (!st) continue
        if (Object.prototype.hasOwnProperty.call(ev, 'assignee_user_id')) {
          st.assignee_user_id = ev.assignee_user_id || null
          st.assignee_display_name = ev.assignee_display_name || null
        }
        if (Object.prototype.hasOwnProperty.call(ev, 'due_date')) {
          st.due_date = ev.due_date || null
        }
      }
    } catch {
      // ignore
    }
  }

  const todos = Array.from(stateById.values()).sort((a, b) => {
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    if (aDue !== bDue) return aDue - bDue
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const insertTodoCreate = async (payload) => {
    const displayName = userDisplayName || user.email.split('@')[0]
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: `__TODO__${JSON.stringify(payload)}`,
      is_agent: false,
      sender_id: user.id,
      sender_display_name: displayName,
    })
    if (error) {
      setErr(error.message || 'Failed to add to-do.')
      return false
    }

    // Also post a visible, human-readable message so the chat has an activity trail.
    const assigneePart = payload.assignee_display_name ? ` (assigned to @${payload.assignee_display_name})` : ''
    const duePart = payload.due_date ? ` (due ${payload.due_date})` : ''
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: `✅ Added to-do: ${payload.text}${assigneePart}${duePart}`,
      is_agent: false,
      sender_id: user.id,
      sender_display_name: displayName,
    })
    return true
  }

  const insertTodoEvent = async (prefix, payload) => {
    const displayName = userDisplayName || user.email.split('@')[0]
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: `${prefix}${JSON.stringify(payload)}`,
      is_agent: false,
      sender_id: user.id,
      sender_display_name: displayName,
    })
    if (error) setErr(error.message || 'Failed to update to-do.')
  }

  const addTodo = async () => {
    const t = text.trim()
    if (!t) { setErr('Please enter a task.') ; return }
    const assignee = assigneeId
      ? memberOptions.find((m) => m.user_id === assigneeId)
      : null
    const payload = {
      todo_id: crypto.randomUUID(),
      text: t,
      created_at: new Date().toISOString(),
      created_by: user.id,
      created_by_name: userDisplayName || user.email.split('@')[0],
      assignee_user_id: assignee?.user_id || null,
      assignee_display_name: assignee?.display_name || null,
      due_date: dueDate || null,
    }
    const ok = await insertTodoCreate(payload)
    if (!ok) return
    setText('')
    setAssigneeInput('')
    setAssigneeId(null)
    setDueDate('')
    setErr('')
    onClose()
  }

  const toggleTodo = async (todoId, completed) => {
    await insertTodoEvent('__TODO_TOGGLE__', {
      todo_id: todoId,
      completed,
      updated_at: new Date().toISOString(),
    })
  }

  const updateTodo = async (todoId, updates) => {
    await insertTodoEvent('__TODO_UPDATE__', {
      todo_id: todoId,
      ...updates,
      updated_at: new Date().toISOString(),
    })
  }

  if (!open) return null

  return (
    <div className="cw-modal-backdrop" onClick={onClose}>
      <div className="cw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cw-modal-title">Shared to-dos</div>

        <div className="cw-modal-label">New task</div>
        <input
          className="cw-modal-input"
          value={text}
          onChange={(e) => { setText(e.target.value); setErr('') }}
          placeholder="e.g., Book snorkeling tour"
          onKeyDown={(e) => { if (e.key === 'Enter') addTodo() }}
        />

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="cw-modal-label">Assign (type @name)</div>
            <input
              className="cw-modal-input"
              value={assigneeInput}
              onChange={(e) => {
                const v = e.target.value
                setAssigneeInput(v)
                setErr('')
                if (!v.trim()) setAssigneeId(null)
                if (v.trim() === '@') setAssigneeActiveIndex(0)
              }}
              onKeyDown={(e) => {
                if (!assigneeInput.startsWith('@')) return
                if (assigneeMatches.length === 0) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setAssigneeActiveIndex((i) => Math.min(i + 1, assigneeMatches.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setAssigneeActiveIndex((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Tab' || e.key === 'Enter') {
                  e.preventDefault()
                  const m = assigneeMatches[assigneeActiveIndex] || assigneeMatches[0]
                  if (!m) return
                  setAssigneeId(m.user_id)
                  setAssigneeInput(`@${m.display_name}`)
                  setAssigneeActiveIndex(0)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setAssigneeActiveIndex(0)
                  setAssigneeInput('')
                  setAssigneeId(null)
                }
              }}
              placeholder="@alex"
            />
            {assigneeMatches.length > 0 && (
              <div style={{ marginTop: '6px', border: '1px solid #B9B9B9', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
                {assigneeMatches.map((m, idx) => (
                  <button
                    key={m.user_id}
                    onClick={() => { setAssigneeId(m.user_id); setAssigneeInput(`@${m.display_name}`) }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      border: 'none',
                      background: idx === assigneeActiveIndex ? 'rgba(16,108,84,0.08)' : '#fff',
                      cursor: 'pointer',
                      fontFamily: 'Cabin, sans-serif',
                      fontSize: '13px',
                    }}
                  >
                    {m.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ width: '170px' }}>
            <div className="cw-modal-label">Due date</div>
            <input
              className="cw-modal-input"
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); setErr('') }}
            />
          </div>
        </div>

        <div className="cw-modal-actions">
          <button className="cw-modal-btn" onClick={onClose}>Close</button>
          <button className="cw-modal-btn primary" onClick={addTodo}>Add</button>
        </div>
        {err && <div className="cw-modal-error">{err}</div>}

        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {todos.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#64748b' }}>No to-dos yet.</div>
          ) : (
            todos.map((t) => (
              <div key={t.todo_id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 10px', border: '1px solid #B9B9B9', borderRadius: '12px', background: '#fff' }}>
                <input
                  type="checkbox"
                  checked={!!t.completed}
                  onChange={(e) => toggleTodo(t.todo_id, e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', color: '#0f172a', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.text}</div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <span>Created by {t.created_by_name || 'someone'}</span>
                    {t.assignee_display_name && <span>Assigned to @{t.assignee_display_name}</span>}
                    {t.due_date && <span>Due {t.due_date}</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <select
                    value={t.assignee_user_id || ''}
                    onChange={(e) => {
                      const uid = e.target.value || null
                      const m = uid ? memberOptions.find((mm) => mm.user_id === uid) : null
                      updateTodo(t.todo_id, { assignee_user_id: uid, assignee_display_name: m?.display_name || null })
                    }}
                    style={{ border: '1px solid #B9B9B9', borderRadius: '10px', padding: '7px 10px', fontSize: '12px', fontFamily: 'Cabin, sans-serif' }}
                  >
                    <option value="">Unassigned</option>
                    {memberOptions.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                    ))}
                  </select>

                  <input
                    type="date"
                    value={t.due_date || ''}
                    onChange={(e) => updateTodo(t.todo_id, { due_date: e.target.value || null })}
                    style={{ border: '1px solid #B9B9B9', borderRadius: '10px', padding: '7px 10px', fontSize: '12px', fontFamily: 'Cabin, sans-serif' }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function PollBubble({ pollMessage, messages, conversationId, currentUserId, currentUserDisplayName }) {
  let poll
  try {
    poll = JSON.parse((pollMessage?.content || '').replace(/^__POLL__/, ''))
  } catch {
    poll = null
  }
  if (!poll?.poll_id || !poll?.question || !Array.isArray(poll?.options)) {
    return <MessageBubble message={pollMessage} isGroup={true} currentUserId={currentUserId} />
  }

  const voteMessages = messages.filter((m) => (m?.content || '').startsWith('__POLL_VOTE__'))
  const votes = []
  for (const m of voteMessages) {
    try {
      const v = JSON.parse((m.content || '').replace(/^__POLL_VOTE__/, ''))
      if (v?.poll_id === poll.poll_id && typeof v?.option_index === 'number') {
        votes.push({ user_id: m.sender_id, option_index: v.option_index })
      }
    } catch {
      // ignore
    }
  }

  const myVote = votes.find((v) => v.user_id === currentUserId)
  const counts = poll.options.map((_, idx) => votes.filter((v) => v.option_index === idx).length)
  const total = counts.reduce((a, b) => a + b, 0)

  const castVote = async (optionIndex) => {
    if (myVote) return
    const vote = { poll_id: poll.poll_id, option_index: optionIndex, created_at: new Date().toISOString() }
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: `__POLL_VOTE__${JSON.stringify(vote)}`,
      is_agent: false,
      sender_id: currentUserId,
      sender_display_name: currentUserDisplayName,
    })
  }

  return (
    <div style={{ display: 'flex', marginBottom: '16px', justifyContent: 'flex-start' }}>
      <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {pollMessage?.sender_display_name && (
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontFamily: 'Cabin, sans-serif', color: '#B9B9B9' }}>
            {pollMessage.sender_display_name}
          </div>
        )}
        <div style={{ background: '#F3EFE8', color: '#7A7A7A', border: '1px solid #B9B9B9', borderRadius: '16px', borderBottomLeftRadius: '4px', padding: '11px 15px', fontFamily: 'Cabin, sans-serif' }}>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>{poll.question}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {poll.options.map((opt, idx) => {
              const isMine = myVote?.option_index === idx
              const pct = total > 0 ? Math.round((counts[idx] / total) * 100) : 0
              return (
                <button
                  key={idx}
                  onClick={() => castVote(idx)}
                  disabled={!!myVote}
                  style={{
                    textAlign: 'left',
                    cursor: myVote ? 'default' : 'pointer',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    border: '1px solid #B9B9B9',
                    background: isMine ? '#106C54' : '#fff',
                    color: isMine ? '#fff' : '#0f172a',
                    opacity: myVote && !isMine ? 0.75 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>{opt}</span>
                    <span style={{ fontSize: '12px', opacity: 0.8 }}>{counts[idx]} · {pct}%</span>
                  </div>
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#64748b' }}>
            {total} vote{total === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: '#B9B9B9', marginTop: '4px', padding: '0 2px' }}>{formatTime(pollMessage.created_at)}</div>
      </div>
    </div>
  )
}

const styles = `
  .cw-outer {
    display: flex;
    flex-direction: row;
    height: 100vh;
    overflow: hidden;
    background: #FFFCF6;
    font-family: 'Cabin', sans-serif;
  }
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
    border-bottom: 1px solid #B9B9B9;
    background: #F3EFE8;
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
  .cw-header-clickable:hover { background: rgba(16,108,84,0.05); }
  .cw-header-icon {
    width: 34px;
    height: 34px;
    background: rgba(101,155,144,0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }
  .cw-header-info { flex: 1; min-width: 0; }
  .cw-header-title { font-size: 15px; font-weight: 600; color: #106C54; }
  .cw-header-sub { font-size: 12px; color: #659B90; margin-top: 1px; }
  .cw-header-sub-group { font-size: 12px; color: #7A7A7A; margin-top: 1px; }
  .cw-invite-btn {
    background: #106C54;
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
    font-family: 'Cabin', sans-serif;
  }
  .cw-invite-btn:hover { background: #659B90; }
  .cw-messages {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    background: #FFFCF6;
  }
  .cw-thinking {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #F3EFE8;
    border: 1px solid #B9B9B9;
    border-radius: 16px;
    border-bottom-left-radius: 4px;
    width: fit-content;
    margin-bottom: 16px;
  }
  .cw-thinking-label {
    font-size: 12px;
    font-weight: 600;
    color: #659B90;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .cw-dots { display: flex; gap: 4px; align-items: center; }
  .cw-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #659B90;
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
    border-top: 1px solid #B9B9B9;
    background: #F3EFE8;
    display: flex;
    gap: 10px;
    align-items: flex-end;
    flex-shrink: 0;
  }
  .cw-input {
    flex: 1;
    background: #FFFCF6;
    border: 1px solid #B9B9B9;
    border-radius: 12px;
    padding: 11px 14px;
    font-size: 14px;
    color: #7A7A7A;
    outline: none;
    resize: none;
    min-height: 44px;
    max-height: 140px;
    font-family: 'Cabin', sans-serif;
    transition: border-color 0.2s;
    line-height: 1.5;
  }
  .cw-input:focus { border-color: #106C54; }
  .cw-input::placeholder { color: #B9B9B9; }
  .cw-attach-btn {
    background: transparent;
    border: 1px solid #B9B9B9;
    border-radius: 10px;
    width: 42px; height: 42px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: border-color 0.2s, background 0.2s;
    color: #659B90;
    -webkit-appearance: none; appearance: none; padding: 0;
  }
  .cw-attach-btn:hover:not(:disabled) { border-color: #106C54; background: rgba(16,108,84,0.06); }
  .cw-attach-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cw-send-btn {
    background: #106C54;
    border: none;
    border-radius: 10px;
    width: 42px; height: 42px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s, opacity 0.2s;
    -webkit-appearance: none; appearance: none; padding: 0;
  }
  .cw-send-btn:hover:not(:disabled) { background: #659B90; }
  .cw-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cw-error {
    margin: 0 24px 12px;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.3);
    color: #dc2626;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
  }
  .cw-empty {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100%; text-align: center; gap: 8px;
  }
  .cw-empty-icon { font-size: 36px; margin-bottom: 4px; }
  .cw-empty-title { font-size: 16px; font-weight: 600; color: #106C54; }
  .cw-empty-sub { font-size: 13px; color: #7A7A7A; }
  .cw-attachments-preview {
    display: flex; flex-wrap: wrap; gap: 8px;
    padding: 0 20px 12px; background: #F3EFE8;
  }
  .cw-attachment-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: #FFFCF6; border: 1px solid #B9B9B9;
    border-radius: 999px; padding: 5px 10px 5px 8px;
    font-size: 12px; color: #7A7A7A; max-width: 200px;
  }
  .cw-attachment-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-attachment-chip-remove {
    border: none; background: transparent; color: #B9B9B9;
    cursor: pointer; font-size: 15px; line-height: 1; padding: 0;
    display: flex; align-items: center; flex-shrink: 0;
    transition: color 0.15s; -webkit-appearance: none; appearance: none;
  }
  .cw-attachment-chip-remove:hover { color: #dc2626; }
  .cw-drawer {
    width: 272px; min-width: 272px;
    background: #FFFCF6;
    border-left: 1px solid #B9B9B9;
    display: flex; flex-direction: column;
    overflow: hidden;
    transition: width 0.22s ease, min-width 0.22s ease, opacity 0.22s ease;
    opacity: 1;
  }
  .cw-drawer.closed { width: 0; min-width: 0; opacity: 0; pointer-events: none; }
  .cw-drawer-header {
    padding: 18px 16px 14px;
    border-bottom: 1px solid #B9B9B9;
    background: #F3EFE8;
    display: flex; align-items: center; justify-content: space-between;
    flex-shrink: 0;
  }
  .cw-drawer-title { font-size: 13px; font-weight: 700; color: #106C54; white-space: nowrap; }
  .cw-drawer-close {
    background: transparent; border: none; color: #B9B9B9;
    cursor: pointer; font-size: 20px; line-height: 1; padding: 0;
    transition: color 0.15s; flex-shrink: 0;
  }
  .cw-drawer-close:hover { color: #7A7A7A; }
  .cw-drawer-body { flex: 1; overflow-y: auto; padding: 16px; }
  .cw-drawer-section-label {
    font-size: 10px; font-weight: 700; color: #B9B9B9;
    text-transform: uppercase; letter-spacing: 0.8px;
    margin-bottom: 10px; white-space: nowrap;
  }
  .cw-member-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; min-width: 0; }
  .cw-member-avatar {
    width: 30px; height: 30px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0;
  }
  .cw-member-name {
    font-size: 13px; color: #7A7A7A;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1; min-width: 0;
  }
  .cw-member-you {
    font-size: 10px; font-weight: 600; color: #B9B9B9;
    background: #F3EFE8; border-radius: 4px; padding: 1px 5px;
    flex-shrink: 0; white-space: nowrap;
  }
  .cw-drawer-divider { border: none; border-top: 1px solid #B9B9B9; margin: 16px 0; }
  .cw-inv-input {
    width: 100%; background: #F3EFE8;
    border: 1px solid #B9B9B9; border-radius: 8px;
    padding: 9px 12px; font-size: 13px; color: #7A7A7A;
    outline: none; font-family: 'Cabin', sans-serif;
    transition: border-color 0.15s; margin-bottom: 8px; box-sizing: border-box;
  }
  .cw-inv-input:focus { border-color: #106C54; }
  .cw-inv-input::placeholder { color: #B9B9B9; }
  .cw-inv-lookup-btn {
    width: 100%; background: #F3EFE8; border: 1px solid #B9B9B9;
    border-radius: 8px; padding: 8px; font-size: 13px; font-weight: 600;
    color: #7A7A7A; cursor: pointer;
    transition: background 0.2s, color 0.2s; margin-bottom: 10px;
    font-family: 'Cabin', sans-serif;
  }
  .cw-inv-lookup-btn:hover:not(:disabled) { background: #F3EFE8; border-color: #106C54; color: #106C54; }
  .cw-inv-lookup-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cw-inv-found {
    background: rgba(16,108,84,0.08); border: 1px solid rgba(16,108,84,0.25);
    border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
    font-size: 13px; color: #106C54;
  }
  .cw-inv-send-btn {
    width: 100%; background: #106C54; border: none;
    border-radius: 8px; padding: 9px; font-size: 13px; font-weight: 600;
    color: #fff; cursor: pointer; transition: background 0.2s, opacity 0.2s;
    font-family: 'Cabin', sans-serif;
  }
  .cw-inv-send-btn:hover:not(:disabled) { background: #659B90; }
  .cw-inv-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cw-inv-msg { font-size: 12px; margin-top: 8px; padding: 7px 10px; border-radius: 6px; }
  .cw-inv-msg.success {
    background: rgba(16,108,84,0.08); color: #106C54;
    border: 1px solid rgba(16,108,84,0.2);
  }
  .cw-inv-msg.error {
    background: rgba(239,68,68,0.08); color: #dc2626;
    border: 1px solid rgba(239,68,68,0.2);
  }

  .cw-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 18px;
  }
  .cw-modal {
    width: 100%;
    max-width: 520px;
    background: #FFFCF6;
    border: 1px solid #B9B9B9;
    border-radius: 14px;
    padding: 16px;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
  }
  .cw-modal-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 10px;
  }
  .cw-modal-label {
    font-size: 12px;
    color: #475569;
    margin-bottom: 6px;
  }
  .cw-modal-input {
    width: 100%;
    border: 1px solid #B9B9B9;
    background: #fff;
    border-radius: 10px;
    padding: 10px 11px;
    font-size: 14px;
    outline: none;
    font-family: 'Cabin', sans-serif;
    color: #0f172a;
  }
  .cw-modal-textarea {
    width: 100%;
    border: 1px solid #B9B9B9;
    background: #fff;
    border-radius: 10px;
    padding: 10px 11px;
    font-size: 14px;
    outline: none;
    font-family: 'Cabin', sans-serif;
    color: #0f172a;
    resize: vertical;
    min-height: 110px;
  }
  .cw-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 12px;
  }
  .cw-modal-btn {
    border-radius: 10px;
    padding: 9px 12px;
    border: 1px solid #B9B9B9;
    background: #fff;
    color: #0f172a;
    cursor: pointer;
    font-family: 'Cabin', sans-serif;
  }
  .cw-modal-btn.primary {
    background: #106C54;
    color: #fff;
    border-color: #106C54;
  }
  .cw-modal-error {
    margin-top: 10px;
    color: #b91c1c;
    font-size: 12px;
  }

  .cw-todos-banner {
    margin: 0 24px 10px;
    background: rgba(16,108,84,0.08);
    border: 1px solid rgba(16,108,84,0.25);
    color: #106C54;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }
  .cw-todos-banner:hover {
    background: rgba(16,108,84,0.12);
  }
  .cw-todos-banner-title {
    font-weight: 700;
  }
  .cw-todos-banner-meta {
    font-size: 12px;
    color: rgba(16,108,84,0.85);
    white-space: nowrap;
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

  const [pollOpen, setPollOpen] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptionsText, setPollOptionsText] = useState('')
  const [pollError, setPollError] = useState('')

  const [todosOpen, setTodosOpen] = useState(false)

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
    setPollOpen(false)
    setPollQuestion('')
    setPollOptionsText('')
    setPollError('')
    setTodosOpen(false)
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
        try {
          attachments = await uploadFilesToStorage()
          setPendingFiles([])
        } catch (e) {
          setUploadError(e.message || 'File upload failed.')
          setIsThinking(false)
          return
        }
      }

      const res = await fetch(AGENT_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_message: text,
          access_token: s.access_token,
          attachments,
        }),
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
    let attachments = []
    if (pendingFiles.length > 0) {
      try {
        attachments = await uploadFilesToStorage()
        setPendingFiles([])
      } catch (e) {
        setUploadError(e.message || 'File upload failed.')
        return
      }
    }
    const { error: insertErr } = await supabase.from('messages').insert({
      conversation_id: conversationId, role: 'user', content: text,
      is_agent: false, sender_id: user.id, sender_display_name: displayName,
      attachments,
    })
    if (insertErr) { setSendError(insertErr.message || 'Failed to send.'); return }
    if (isAgentCommand) {
      setIsThinking(true)
      try {
        const { data: { session: s } } = await supabase.auth.getSession()
        if (!s?.access_token) throw new Error('Not authenticated')
        const res = await fetch(AGENT_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({ conversation_id: conversationId, user_message: text, access_token: s.access_token, is_group: true, sender_display_name: displayName, attachments }),
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

  const visibleMessages = messages.filter((m) => !(m?.content || '').startsWith('__POLL_VOTE__'))
    .filter((m) => !(m?.content || '').startsWith('__TODO__'))
    .filter((m) => !(m?.content || '').startsWith('__TODO_'))

  // Quick derived count for banner (full state is built inside TodosModal)
  const openTodoCount = (() => {
    const creates = messages.filter((m) => (m?.content || '').startsWith('__TODO__'))
    const toggles = messages.filter((m) => (m?.content || '').startsWith('__TODO_TOGGLE__'))
    const completedById = new Map()
    for (const m of toggles) {
      try {
        const ev = JSON.parse((m.content || '').replace(/^__TODO_TOGGLE__/, ''))
        if (ev?.todo_id) completedById.set(ev.todo_id, !!ev.completed)
      } catch {
        // ignore
      }
    }
    let openCount = 0
    for (const m of creates) {
      try {
        const t = JSON.parse((m.content || '').replace(/^__TODO__/, ''))
        if (!t?.todo_id) continue
        if (!completedById.get(t.todo_id)) openCount += 1
      } catch {
        // ignore
      }
    }
    return openCount
  })()

  const openPoll = () => {
    if (!isGroup) return
    setPollError('')
    setPollQuestion('')
    setPollOptionsText('')
    setPollOpen(true)
  }

  const closePoll = () => {
    setPollOpen(false)
    setPollError('')
  }

  const submitPoll = async () => {
    if (!isGroup) return
    const displayName = userDisplayName || user.email.split('@')[0]
    const question = (pollQuestion || '').trim()
    const options = (pollOptionsText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10)

    if (!question) {
      setPollError('Please enter a question.')
      return
    }
    if (options.length < 2) {
      setPollError('Please enter at least 2 options (one per line).')
      return
    }

    const poll = {
      poll_id: crypto.randomUUID(),
      question,
      options,
      created_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: `__POLL__${JSON.stringify(poll)}`,
      is_agent: false,
      sender_id: user.id,
      sender_display_name: displayName,
    })
    if (error) {
      setPollError(error.message || 'Failed to create poll.')
      return
    }
    closePoll()
  }

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
            {isGroup && (
              <div className="cw-todos-banner" onClick={() => setTodosOpen(true)}>
                <div>
                  <div className="cw-todos-banner-title">Shared to-dos</div>
                  <div className="cw-todos-banner-meta">{openTodoCount} open</div>
                </div>
                <div className="cw-todos-banner-meta">Click to view</div>
              </div>
            )}
            {loadingMessages ? (
              <div className="cw-empty"><div style={{ color: '#475569', fontSize: '14px' }}>Loading messages...</div></div>
            ) : visibleMessages.length === 0 && !isThinking ? (
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
                {visibleMessages.map((msg) => (
                  (msg?.content || '').startsWith('__POLL__') ? (
                    <PollBubble key={msg.id} pollMessage={msg} messages={messages} conversationId={conversationId} currentUserId={user.id} currentUserDisplayName={userDisplayName || user.email.split('@')[0]} />
                  ) : (
                    <MessageBubble key={msg.id} message={msg} isGroup={isGroup} currentUserId={user.id} />
                  )
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
            {isGroup && (
              <button className="cw-attach-btn" onClick={openPoll} aria-label="Create poll" title="Create poll">
                📊
              </button>
            )}
            {isGroup && (
              <button className="cw-attach-btn" onClick={() => setTodosOpen(true)} aria-label="Open to-dos" title="Shared to-dos">
                ✅
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
        {pollOpen && (
          <div className="cw-modal-backdrop" onClick={closePoll}>
            <div className="cw-modal" onClick={(e) => e.stopPropagation()}>
              <div className="cw-modal-title">Create poll</div>

              <div className="cw-modal-label">Question</div>
              <input
                className="cw-modal-input"
                value={pollQuestion}
                onChange={(e) => { setPollQuestion(e.target.value); setPollError('') }}
                placeholder="e.g., Where should we stay?"
              />

              <div className="cw-modal-label" style={{ marginTop: '12px' }}>Options (one per line)</div>
              <textarea
                className="cw-modal-textarea"
                value={pollOptionsText}
                onChange={(e) => { setPollOptionsText(e.target.value); setPollError('') }}
                placeholder={`Wailea\nKihei\nKa'anapali`}
              />

              {pollError && <div className="cw-modal-error">{pollError}</div>}

              <div className="cw-modal-actions">
                <button className="cw-modal-btn" onClick={closePoll}>Cancel</button>
                <button className="cw-modal-btn primary" onClick={submitPoll}>Create</button>
              </div>
            </div>
          </div>
        )}

        {isGroup && (
          <TodosModal
            open={todosOpen}
            onClose={() => setTodosOpen(false)}
            conversationId={conversationId}
            user={user}
            members={members}
            userDisplayName={userDisplayName || user.email.split('@')[0]}
            messages={messages}
          />
        )}
      </div>
    </>
  )
}
