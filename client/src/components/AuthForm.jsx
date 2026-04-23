import { useState } from 'react'
import { signUp, confirmSignUp, signIn } from '../lib/auth'

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
  .auth-hint {
    font-size: 12px;
    color: #B9B9B9;
    text-align: center;
    margin-top: 12px;
  }
`

// view: 'login' | 'signup' | 'verify'
export default function AuthForm() {
  const [view, setView]           = useState('login')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [code, setCode]           = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [error, setError]         = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading]     = useState(false)

  const reset = () => { setError(''); setSuccessMsg('') }

  const handleSignUp = async () => {
    if (!email || !password) { setError('Please enter your email and password.'); return }
    reset(); setLoading(true)
    try {
      await signUp(email, password)
      setPendingEmail(email)
      setView('verify')
      setSuccessMsg('Account created! Check your email for a verification code.')
    } catch (e) {
      setError(e.message ?? 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!code) { setError('Please enter the verification code.'); return }
    reset(); setLoading(true)
    try {
      await confirmSignUp(pendingEmail, code)
      setView('login')
      setEmail(pendingEmail)
      setPassword('')
      setCode('')
      setSuccessMsg('Email verified! You can now log in.')
    } catch (e) {
      setError(e.message ?? 'Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogIn = async () => {
    if (!email || !password) { setError('Please enter your email and password.'); return }
    reset(); setLoading(true)
    try {
      await signIn(email, password)
      // App.jsx picks up the session via onAuthStateChange listener
    } catch (e) {
      setError(e.message ?? 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (view === 'verify') handleVerify()
      else handleLogIn()
    }
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

          {error      && <div className="auth-error">{error}</div>}
          {successMsg && <div className="auth-success">{successMsg}</div>}

          {/* ── Verify email ── */}
          {view === 'verify' && (
            <>
              <p style={{ fontSize: 14, color: '#7A7A7A', marginBottom: 16 }}>
                We sent a code to <strong>{pendingEmail}</strong>. Enter it below to verify your account.
              </p>
              <label className="auth-label">Verification Code</label>
              <input
                className="auth-input"
                type="text"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoComplete="one-time-code"
              />
              <button className="auth-btn-primary" onClick={handleVerify} disabled={loading}>
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>
              <p className="auth-hint">
                <span
                  style={{ cursor: 'pointer', color: '#106C54' }}
                  onClick={() => { reset(); setView('login') }}
                >
                  Back to log in
                </span>
              </p>
            </>
          )}

          {/* ── Login / Sign-up ── */}
          {view !== 'verify' && (
            <>
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
                  autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>

              {view === 'login' ? (
                <>
                  <button className="auth-btn-primary" onClick={handleLogIn} disabled={loading}>
                    {loading ? 'Please wait...' : 'Log In'}
                  </button>
                  <div className="auth-divider">
                    <div className="auth-divider-line" />
                    <div className="auth-divider-text">or</div>
                    <div className="auth-divider-line" />
                  </div>
                  <button className="auth-btn-secondary" onClick={() => { reset(); setView('signup') }} disabled={loading}>
                    Create Account
                  </button>
                </>
              ) : (
                <>
                  <button className="auth-btn-primary" onClick={handleSignUp} disabled={loading}>
                    {loading ? 'Creating account...' : 'Create Account'}
                  </button>
                  <div className="auth-divider">
                    <div className="auth-divider-line" />
                    <div className="auth-divider-text">or</div>
                    <div className="auth-divider-line" />
                  </div>
                  <button className="auth-btn-secondary" onClick={() => { reset(); setView('login') }} disabled={loading}>
                    Back to Log In
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
