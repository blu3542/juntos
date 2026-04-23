import { getSession } from './auth.js'

const BASE = import.meta.env.VITE_API_GATEWAY_URL

async function getToken() {
  const { data: { session } } = await getSession()
  return session?.access_token ?? null
}

async function apiFetch(path, options = {}) {
  const token = await getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Profile
  getProfile:     ()       => apiFetch('/profile'),
  getProfileById: (userId) => apiFetch(`/profile/${userId}`),
  putProfile:     (data)   => apiFetch('/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // Conversations
  getConversations:        ()          => apiFetch('/conversations'),
  createConversation:      ()          => apiFetch('/conversations', { method: 'POST' }),
  createGroupConversation: (groupName) => apiFetch('/conversations/group', { method: 'POST', body: JSON.stringify({ group_name: groupName }) }),

  // Messages
  getMessages:   (convId) => apiFetch(`/messages/${convId}`),
  createMessage: (data)   => apiFetch('/messages', { method: 'POST', body: JSON.stringify(data) }),

  // Group
  getGroupMembers:   (convId) => apiFetch(`/group-members/${convId}`),
  lookupUserByEmail: (email)  => apiFetch('/users/lookup', { method: 'POST', body: JSON.stringify({ email }) }),

  // Invites
  getInvites:    ()    => apiFetch('/invites'),
  createInvite:  (d)   => apiFetch('/invites', { method: 'POST', body: JSON.stringify(d) }),
  acceptInvite:  (id)  => apiFetch(`/invites/${id}/accept`,  { method: 'POST' }),
  declineInvite: (id)  => apiFetch(`/invites/${id}/decline`, { method: 'POST' }),

  // Upload
  getUploadUrl: (filename, mimeType) =>
    apiFetch('/upload', { method: 'POST', body: JSON.stringify({ filename, mime_type: mimeType }) }),

  // Agent
  invokeAgent: (data) => apiFetch('/agent', { method: 'POST', body: JSON.stringify(data) }),
}
