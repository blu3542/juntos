import { useState } from 'react'
import { supabase } from '../lib/supabase'

const styles = `
  .auth-container {
    min-height: 100vh;
    background: #F3EFE8;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    font-family: 'Cabin', sans-serif;
  }
  .auth-card {
    background: #FFFCF6;
    border: 1px solid #B9B9B9;
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.08);
  }
  .auth-logo {
    text-align: center;
    margin-bottom: 28px;
  }
  .auth-logo-icon { font-size: 40px; margin-bottom: 10px; }
  .auth-logo-title {
    font-size: 24px;
    font-weight: 700;
    color: #106C54;
    letter-spacing: -0.5px;
  }
  .auth-logo-sub {
    font-size: 13px;
    color: #7A7A7A;
    margin-top: 4px;
  }
  .auth-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #7A7A7A;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .auth-input {
    width: 100%;
    background: #F3EFE8;
    border: 1px solid #B9B9B9;
    border-radius: 8px;
    padding: 11px 14px;
    font-size: 15px;
    color: #7A7A7A;
    outline: none;
    transition: border-color 0.2s;
    margin-bottom: 16px;
    font-family: 'Cabin', sans-serif;
    box-sizing: border-box;
  }
  .auth-input:focus { border-color: #106C54; }
  .auth-input::placeholder { color: #B9B9B9; }
  .auth-btn-primary {
    width: 100%;
    background: #106C54;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
    margin-bottom: 10px;
    font-family: 'Cabin', sans-serif;
  }
  .auth-btn-primary:hover:not(:disabled) { background: #659B90; }
  .auth-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .auth-btn-secondary {
    width: 100%;
    background: transparent;
    color: #106C54;
    border: 1px solid #B9B9B9;
    border-radius: 8px;
    padding: 12px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    font-family: 'Cabin', sans-serif;
  }
  .auth-btn-secondary:hover:not(:disabled) { border-color: #106C54; color: #106C54; }
  .auth-btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
  .auth-error {
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.3);
    color: #dc2626;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    margin-bottom: 16px;
  }
  .auth-success {
    background: rgba(16,108,84,0.08);
    border: 1px solid rgba(16,108,84,0.3);
    color: #106C54;
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
  .auth-divider-line { flex: 1; height: 1px; background: #B9B9B9; }
  .auth-divider-text { font-size: 12px; color: #B9B9B9; text-transform: uppercase; letter-spacing: 0.5px; }
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
