import { useState } from 'react'
import { supabase } from '../lib/supabase'

const styles = `
  .auth-container {
    min-height: 100vh;
    background: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .auth-card {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
  }
  .auth-logo {
    text-align: center;
    margin-bottom: 28px;
  }
  .auth-logo-icon {
    font-size: 40px;
    margin-bottom: 10px;
  }
  .auth-logo-title {
    font-size: 24px;
    font-weight: 700;
    color: #e2e8f0;
    letter-spacing: -0.5px;
  }
  .auth-logo-sub {
    font-size: 13px;
    color: #94a3b8;
    margin-top: 4px;
  }
  .auth-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #94a3b8;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .auth-input {
    width: 100%;
    background: #0f172a;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 11px 14px;
    font-size: 15px;
    color: #e2e8f0;
    outline: none;
    transition: border-color 0.2s;
    margin-bottom: 16px;
  }
  .auth-input:focus {
    border-color: #4f46e5;
  }
  .auth-input::placeholder {
    color: #475569;
  }
  .auth-btn-primary {
    width: 100%;
    background: #4f46e5;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
    margin-bottom: 10px;
  }
  .auth-btn-primary:hover:not(:disabled) {
    background: #4338ca;
  }
  .auth-btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .auth-btn-secondary {
    width: 100%;
    background: transparent;
    color: #94a3b8;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 12px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .auth-btn-secondary:hover:not(:disabled) {
    border-color: #374151;
    color: #e2e8f0;
  }
  .auth-btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .auth-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    margin-bottom: 16px;
  }
  .auth-success {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    margin-bottom: 16px;
  }
  .auth-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 20px 0;
  }
  .auth-divider-line {
    flex: 1;
    height: 1px;
    background: #1f2937;
  }
  .auth-divider-text {
    font-size: 12px;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`

export default function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignUp = async () => {
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setError('')
    setSuccessMsg('')
    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) {
        setError(signUpError.message)
      } else {
        setSuccessMsg('Account created! Check your email to confirm, then log in.')
      }
    } catch (e) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogIn = async () => {
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setError('')
    setSuccessMsg('')
    setLoading(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message)
        console.error('Login error:', signInError)
      } else {
        console.log('Login success, session:', data.session?.user?.email)
        setSuccessMsg('Logged in! Loading your account...')
      }
    } catch (e) {
      console.error('Login threw:', e)
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogIn()
  }

  return (
    <>
      <style>{styles}</style>
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">✈️</div>
            <div className="auth-logo-title">Travel Agent</div>
            <div className="auth-logo-sub">Your AI-powered travel planning assistant</div>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {successMsg && <div className="auth-success">{successMsg}</div>}

          <div style={{ marginBottom: 0 }}>
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              autoComplete="email"
            />

            <label className="auth-label">Password</label>
            <input
              className="auth-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button
            className="auth-btn-primary"
            onClick={handleLogIn}
            disabled={loading}
          >
            {loading ? 'Please wait...' : 'Log In'}
          </button>

          <div className="auth-divider">
            <div className="auth-divider-line" />
            <div className="auth-divider-text">or</div>
            <div className="auth-divider-line" />
          </div>

          <button
            className="auth-btn-secondary"
            onClick={handleSignUp}
            disabled={loading}
          >
            Create Account
          </button>
        </div>
      </div>
    </>
  )
}
