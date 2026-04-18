import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import AuthForm from './components/AuthForm'
import Onboarding from './components/Onboarding'
import ConversationList from './components/ConversationList'
import ChatWindow from './components/ChatWindow'

const globalStyles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0f172a;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
    height: 100vh;
    overflow: hidden;
  }
  #root { height: 100vh; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0b1220; }
  ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #374151; }
`

export default function App() {
  const [appState, setAppState] = useState('loading')
  const [session, setSession] = useState(null)
  const [activeConversation, setActiveConversation] = useState(null) // { id, isGroup }

  const resolving = useRef(false)

  const withTimeout = async (promise, ms, label) => {
    let timeoutId
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out`))
      }, ms)
    })
    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const resolveSession = async (newSession) => {
    if (resolving.current) return
    resolving.current = true
    try {
      setSession(newSession)
      if (!newSession) {
        setAppState('auth')
        setActiveConversation(null)
        return
      }

      const onboardingComplete = newSession.user.user_metadata?.onboarding_complete
      if (onboardingComplete) {
        setAppState('chat')
      } else {
        // Fallback for users who onboarded before the metadata flag was introduced.
        // One-time DB check.
        try {
          const { data: profile, error: profileError } = await withTimeout(
            supabase
              .from('user_profiles')
              .select('id')
              .eq('id', newSession.user.id)
              .maybeSingle(),
            10000,
            'Loading profile'
          )
          if (profileError) {
            console.error('[resolveSession] profile check error:', profileError)
            setAppState('onboarding')
          } else if (profile) {
            setAppState('chat')
          } else {
            setAppState('onboarding')
          }
        } catch (e) {
          console.error('[resolveSession] profile check threw:', e)
          setAppState('onboarding')
        }
      }
    } catch (e) {
      console.error('[resolveSession] error:', e)
      setAppState('auth')
    } finally {
      resolving.current = false
    }
  }

  useEffect(() => {
    // Safety net: never stay on loading screen beyond 3 seconds
    const timeout = setTimeout(() => setAppState('auth'), 10000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      resolveSession(session)
    }).catch(() => {
      clearTimeout(timeout)
      setAppState('auth')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => resolveSession(newSession)
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const handleOnboardingComplete = () => {
    setAppState('chat')
  }

  const handleSelectConversation = (id, isGroup = false) => {
    setActiveConversation({ id, isGroup })
  }

  const handleNewConversation = (id, isGroup = false) => {
    setActiveConversation({ id, isGroup })
  }

  if (appState === 'loading') {
    return (
      <>
        <style>{globalStyles}</style>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0f172a',
          color: '#94a3b8',
          gap: '12px',
        }}>
          <div style={{ fontSize: '32px' }}>✈️</div>
          <div style={{ fontSize: '15px' }}>Loading Travel Agent...</div>
          <div style={{ fontSize: '12px', color: '#475569' }}>Connecting to server</div>
        </div>
      </>
    )
  }

  if (appState === 'auth') {
    return (
      <>
        <style>{globalStyles}</style>
        <AuthForm />
      </>
    )
  }

  if (appState === 'onboarding') {
    return (
      <>
        <style>{globalStyles}</style>
        <Onboarding user={session.user} onComplete={handleOnboardingComplete} />
      </>
    )
  }

  // chat state
  return (
    <>
      <style>{globalStyles}</style>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <ConversationList
          user={session.user}
          activeConversationId={activeConversation?.id}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {activeConversation ? (
            <ChatWindow
              user={session.user}
              session={session}
              conversationId={activeConversation.id}
              isGroup={activeConversation.isGroup ?? false}
            />
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#94a3b8',
              gap: '12px',
            }}>
              <div style={{ fontSize: '48px' }}>✈️</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#e2e8f0' }}>
                Welcome to Travel Agent
              </div>
              <div style={{ fontSize: '14px' }}>
                Select a conversation or start a new one
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
