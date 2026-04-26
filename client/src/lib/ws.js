const WS_URL = import.meta.env.VITE_WEBSOCKET_URL

export function openConversationSocket(conversationId, accessToken, onMessage, onOpen) {
  const url = `${WS_URL}?conversation_id=${encodeURIComponent(conversationId)}&token=${encodeURIComponent(accessToken)}`
  const ws = new WebSocket(url)
  const queue = []

  ws.onopen = () => {
    queue.splice(0).forEach(msg => ws.send(msg))
    onOpen?.()
  }

  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data))
    } catch (e) {
      console.error('WS parse error:', e)
    }
  }

  ws.onerror = (err) => console.error('WebSocket error:', err)

  return {
    close: () => ws.close(),
    send:  (data) => {
      const msg = JSON.stringify(data)
      if (ws.readyState === WebSocket.OPEN) ws.send(msg)
      else if (ws.readyState === WebSocket.CONNECTING) queue.push(msg)
    },
  }
}
