const WS_URL = import.meta.env.VITE_WEBSOCKET_URL

export function openConversationSocket(conversationId, accessToken, onMessage) {
  const url = `${WS_URL}?conversation_id=${encodeURIComponent(conversationId)}&token=${encodeURIComponent(accessToken)}`
  const ws = new WebSocket(url)

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
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
    },
  }
}
