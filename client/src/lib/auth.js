import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js'

const pool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId:   import.meta.env.VITE_COGNITO_CLIENT_ID,
})

// ── Module-level listener registry ────────────────────────────────────────────

const _listeners = new Set()

function _emit(event, session) {
  for (const cb of _listeners) cb(event, session)
}

function _buildSession(cognitoSession) {
  if (!cognitoSession) return null
  return {
    access_token: cognitoSession.getAccessToken().getJwtToken(),
    user: {
      id:            cognitoSession.getIdToken().payload.sub,
      email:         cognitoSession.getIdToken().payload.email,
      user_metadata: {},
    },
  }
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export async function signUp(email, password) {
  return new Promise((resolve, reject) => {
    pool.signUp(email, password, [], null, (err) => {
      if (err) reject(err)
      else resolve({ needsVerification: true, email })
    })
  })
}

export async function confirmSignUp(email, code) {
  const user = new CognitoUser({ Username: email, Pool: pool })
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function signIn(email, password) {
  const authDetails = new AuthenticationDetails({ Username: email, Password: password })
  const user        = new CognitoUser({ Username: email, Pool: pool })

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess(cognitoSession) {
        const session = _buildSession(cognitoSession)
        _emit('SIGNED_IN', session)
        resolve(session)
      },
      onFailure(err) {
        reject(err)
      },
    })
  })
}

// Returns { data: { session } } to match the Supabase API shape used in App.jsx
export async function getSession() {
  const currentUser = pool.getCurrentUser()
  if (!currentUser) return { data: { session: null } }

  return new Promise((resolve) => {
    currentUser.getSession((err, cognitoSession) => {
      if (err || !cognitoSession?.isValid()) {
        resolve({ data: { session: null } })
      } else {
        resolve({ data: { session: _buildSession(cognitoSession) } })
      }
    })
  })
}

// Returns { data: { subscription: { unsubscribe } } } to match Supabase API shape
export function onAuthStateChange(callback) {
  _listeners.add(callback)

  // Fire immediately with current session so the initial resolveSession runs
  getSession().then(({ data: { session } }) => {
    callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session)
  })

  return {
    data: {
      subscription: {
        unsubscribe: () => _listeners.delete(callback),
      },
    },
  }
}

export function signOut() {
  const currentUser = pool.getCurrentUser()
  if (currentUser) currentUser.signOut()
  _emit('SIGNED_OUT', null)
}
