import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import MessageBubble from './MessageBubble'

const AGENT_FUNCTION_URL =
  'https://nigvyotnrlgbqeeyueql.supabase.co/functions/v1/agent'

// Anon key used as the gateway-facing Bearer token (HS256, always accepted).
// The user's actual JWT is passed in the request body and validated server-side.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pZ3Z5b3RucmxnYnFlZXl1ZXFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mjc1MDUsImV4cCI6MjA5MTEwMzUwNX0.d4BeEIwilSpG5etMUQyr-PnusnI5bCm6tcPwVwaagj4'

const styles = `
  .cw-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0f172a;
  }
  .cw-header {
    padding: 16px 24px;
    border-bottom: 1px solid #1f2937;
    background: #111827;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .cw-header-icon {
    width: 34px;
    height: 34px;
    background: rgba(14, 116, 144, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }
  .cw-header-title {
    font-size: 15px;
    font-weight: 600;
    color: #e2e8f0;
  }
  .cw-header-sub {
    font-size: 12px;
    color: #0e7490;
    margin-top: 1px;
  }
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
  .cw-dots {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .cw-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
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
  .cw-input:focus {
    border-color: #4f46e5;
  }
  .cw-input::placeholder {
    color: #475569;
  }
  .cw-send-btn {
    background: #4f46e5;
    border: none;
    border-radius: 10px;
    width: 42px;
    height: 42px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s, opacity 0.2s;
  }
  .cw-send-btn:hover:not(:disabled) {
    background: #4338ca;
  }
  .cw-send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #475569;
    text-align: center;
    gap: 8px;
  }
  .cw-empty-icon {
    font-size: 36px;
    margin-bottom: 4px;
  }
  .cw-empty-title {
    font-size: 16px;
    font-weight: 600;
    color: #64748b;
  }
  .cw-empty-sub {
    font-size: 13px;
  }
`

export default function ChatWindow({ user, conversationId }) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [sendError, setSendError] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(true)
  const bottomRef = useRef(null)
  const channelRef = useRef(null)
  const textareaRef = useRef(null)

  // Fetch messages whenever conversation changes
  useEffect(() => {
    if (!conversationId) return
    setMessages([])
    setIsThinking(false)
    setSendError('')
    setLoadingMessages(true)
    fetchMessages()
  }, [conversationId])

  // Subscribe to Realtime on this conversation
  useEffect(() => {
    if (!conversationId) return

    // Unsubscribe from previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMessage.id)) return prev
            return [...prev, newMessage]
          })
          // If agent message arrives, stop thinking indicator
          if (newMessage.is_agent || newMessage.role === 'assistant') {
            setIsThinking(false)
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [conversationId])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
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

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || isThinking) return

    setSendError('')
    setInputText('')
    setIsThinking(true)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession()
      const token = freshSession?.access_token
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(AGENT_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_message: text,
          access_token: token,
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(body || `Request failed with status ${response.status}`)
      }
      // Agent response will arrive via Realtime; isThinking cleared there
    } catch (err) {
      setSendError(err.message || 'Failed to send message. Please try again.')
      setIsThinking(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaChange = (e) => {
    setInputText(e.target.value)
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  return (
    <>
      <style>{styles}</style>
      <div className="cw-container">
        <div className="cw-header">
          <div className="cw-header-icon">✈️</div>
          <div>
            <div className="cw-header-title">Travel Agent</div>
            <div className="cw-header-sub">AI-powered travel planning</div>
          </div>
        </div>

        <div className="cw-messages">
          {loadingMessages ? (
            <div className="cw-empty">
              <div style={{ color: '#475569', fontSize: '14px' }}>Loading messages...</div>
            </div>
          ) : messages.length === 0 && !isThinking ? (
            <div className="cw-empty">
              <div className="cw-empty-icon">🗺️</div>
              <div className="cw-empty-title">Start planning your trip</div>
              <div className="cw-empty-sub">
                Ask me anything about destinations, itineraries, budgets, and more.
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isThinking && (
                <div>
                  <div className="cw-thinking-label">Travel Agent</div>
                  <div className="cw-thinking">
                    <div className="cw-dots">
                      <div className="cw-dot" />
                      <div className="cw-dot" />
                      <div className="cw-dot" />
                    </div>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>Thinking...</span>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {sendError && (
          <div className="cw-error">{sendError}</div>
        )}

        <div className="cw-composer">
          <textarea
            ref={textareaRef}
            className="cw-input"
            placeholder="Ask about destinations, hotels, itineraries..."
            value={inputText}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={isThinking}
            rows={1}
          />
          <button
            className="cw-send-btn"
            onClick={handleSend}
            disabled={!inputText.trim() || isThinking}
            aria-label="Send message"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}
