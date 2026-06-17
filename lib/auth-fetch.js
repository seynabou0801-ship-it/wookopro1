/**
 * Wrapper fetch authentifié — Lot 3b (gestion expiration session).
 *
 * - Ajoute automatiquement le header Authorization si un token est en localStorage.
 * - Intercepte les réponses 401 sur les routes /api/* nécessitant une auth.
 * - Déclenche une déconnexion automatique avec redirection vers la page de login adaptée.
 *
 * Usage :
 *   import { authFetch } from '@/lib/auth-fetch'
 *   const res = await authFetch('/api/...')
 */

const TOKEN_KEY = 'wooleen_token'
const USER_KEY = 'wooleen_user'

// Évite les redirections multiples si plusieurs requêtes échouent en parallèle.
let isHandlingExpiration = false

function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {}
}

function loginPathForUser() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    if (u?.role === 'ADMIN') return '/secure-wooleen-admin/login'
    if (u?.role === 'PROVIDER') return '/provider/login'
  } catch {}
  // Best-effort selon l'URL actuelle
  if (typeof window !== 'undefined') {
    if (window.location.pathname.startsWith('/secure-wooleen-admin')) {
      return '/secure-wooleen-admin/login'
    }
    if (window.location.pathname.startsWith('/provider')) {
      return '/provider/login'
    }
  }
  return '/provider/login'
}

function handleSessionExpired() {
  if (isHandlingExpiration) return
  isHandlingExpiration = true

  const target = loginPathForUser()
  clearSession()

  // Toast natif simple
  try {
    if (typeof window !== 'undefined') {
      const div = document.createElement('div')
      div.textContent = '⚠️ Session expirée. Veuillez vous reconnecter.'
      div.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#fef2f2;border:2px solid #fca5a5;color:#991b1b;padding:14px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:99999;font-family:system-ui'
      document.body.appendChild(div)
      setTimeout(() => {
        try { document.body.removeChild(div) } catch {}
      }, 4000)
    }
  } catch {}

  setTimeout(() => {
    try {
      if (typeof window !== 'undefined') {
        window.location.href = target
      }
    } catch {}
  }, 600)
}

export async function authFetch(input, init = {}) {
  let token = null
  try {
    token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
  } catch {}

  const headers = new Headers(init.headers || {})
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(input, { ...init, headers })

  // Intercepte les 401 SEULEMENT si on avait un token (sinon c'est juste un endpoint qui demande l'auth)
  if (res.status === 401 && token) {
    // Sauvegarde clone pour permettre au caller de lire la réponse
    let body = null
    try { body = await res.clone().json() } catch {}

    // On déclenche la déconnexion seulement si c'est une erreur de session,
    // pas une erreur métier type "Mot de passe actuel incorrect" sur change-password.
    const url = typeof input === 'string' ? input : input?.url || ''
    const isLoginEndpoint = /\/auth\/(login|provider\/login|forgot-password)\b/.test(url)
    const isChangePwd = /\/auth\/change-password\b/.test(url)

    if (!isLoginEndpoint && !isChangePwd) {
      handleSessionExpired()
    }
  }

  return res
}

export { TOKEN_KEY, USER_KEY }
