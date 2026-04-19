const styles = `
  .mb-wrapper { display: flex; margin-bottom: 16px; }
  .mb-wrapper.user { justify-content: flex-end; }
  .mb-wrapper.agent, .mb-wrapper.other { justify-content: flex-start; }
  .mb-bubble-group { max-width: 70%; display: flex; flex-direction: column; }
  .mb-wrapper.user .mb-bubble-group { align-items: flex-end; }
  .mb-wrapper.agent .mb-bubble-group, .mb-wrapper.other .mb-bubble-group { align-items: flex-start; }
  .mb-label {
    font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
    font-family: 'Cabin', sans-serif;
  }
  .mb-label.agent { color: #659B90; }
  .mb-label.other { color: #B9B9B9; }
  .mb-bubble {
    padding: 11px 15px; border-radius: 16px;
    font-size: 14px; line-height: 1.55; word-break: break-word;
    font-family: 'Cabin', sans-serif;
  }
  .mb-bubble p { margin: 0 0 10px 0; }
  .mb-bubble p:last-child { margin-bottom: 0; }
  .mb-bubble ul, .mb-bubble ol { margin: 4px 0 10px 0; padding-left: 16px; }
  .mb-bubble ul:last-child, .mb-bubble ol:last-child { margin-bottom: 0; }
  .mb-bubble li { margin-bottom: 6px; line-height: 1.5; }
  .mb-bubble li:last-child { margin-bottom: 0; }
  .mb-bubble strong { font-weight: 700; }
  .mb-wrapper.user .mb-bubble {
    background: #106C54;
    color: #fff;
    border-bottom-right-radius: 4px;
    white-space: pre-wrap;
  }
  .mb-wrapper.agent .mb-bubble, .mb-wrapper.other .mb-bubble {
    background: #F3EFE8;
    color: #7A7A7A;
    border: 1px solid #B9B9B9;
    border-bottom-left-radius: 4px;
  }
  .mb-timestamp { font-size: 11px; color: #B9B9B9; margin-top: 4px; padding: 0 2px; }
`

import ReactMarkdown from 'react-markdown'

function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function AttachmentPreview({ attachments }) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
      {attachments.map((att, i) => {
        if (att.mime_type?.startsWith('image/')) {
          return (
            <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
              <img
                src={att.url}
                alt={att.name}
                style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '8px', border: '1px solid #1f2937', display: 'block' }}
              />
            </a>
          )
        }
        return (
          <a
            key={i}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#94a3b8', textDecoration: 'none' }}
          >
            📄 {att.name}
          </a>
        )
      })}
    </div>
  )
}

export default function MessageBubble({ message, isGroup, currentUserId }) {
  const isAgent = message.is_agent || message.role === 'assistant'
  const isOwn = !isAgent && message.sender_id === currentUserId

  // In group chats: other members' messages sit on the left like agent messages.
  // In 1:1 chats (or own messages): use the original user/agent sides.
  let side
  if (isAgent) {
    side = 'agent'
  } else if (isGroup && !isOwn) {
    side = 'other'
  } else {
    side = 'user'
  }

  // Label: show "Travel Agent" for agent, sender name for other group members, nothing for own messages
  let label = null
  if (isAgent) {
    label = { text: 'Travel Agent', cls: 'agent' }
  } else if (isGroup && !isOwn && message.sender_display_name) {
    label = { text: message.sender_display_name, cls: 'other' }
  }

  return (
    <>
      <style>{styles}</style>
      <div className={`mb-wrapper ${side}`}>
        <div className="mb-bubble-group">
          {label && <div className={`mb-label ${label.cls}`}>{label.text}</div>}
          <AttachmentPreview attachments={message.attachments} />
          <div className="mb-bubble">
            {isAgent ? (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            ) : (
              message.content
            )}
          </div>
          <div className="mb-timestamp">{formatTime(message.created_at)}</div>
        </div>
      </div>
    </>
  )
}
