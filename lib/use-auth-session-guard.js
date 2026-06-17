'use client'

import { useEffect } from 'react'

/**
 * Hook Lot 3b — Gestion expiration de session.
 *
 * Monte un intercepteur global sur `window.fetch` qui :
 *  - Détecte les réponses 401 sur les routes /api/*
 *  - Déclenche la déconnexion + redirection vers la page de login adaptée
 *  - Ignore les endpoints d'auth (login / forgot / change-password)
 *
 * Usage : importer ce hook dans le composant racine des pages PROTÉGÉES :
 *   - /provider/dashboard
 *   - /provider/subscription
 *   - /secure-wooleen-admin
 *   - /secure-wooleen-admin/wookotv
 *
 * Idempotent : si déjà installé, ne le ré-installe pas.
 */
export function useAuthSessionGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.__wookoAuthGuardInstalled) return
    window.__wookoAuthGuardInstalled = true

    const originalFetch = window.fetch.bind(window)
    let handling = false

    const handleExpired = () => {
      if (handling) return
      handling = true

      // Détermine la page de login cible
      let target = '/provider/login'
      try {
        const u = JSON.parse(localStorage.getItem('wooleen_user') || 'null')
        if (u?.role === 'ADMIN') target = '/secure-wooleen-admin/login'
        else if (u?.role === 'PROVIDER') target = '/provider/login'
      } catch (e) { void e }
      if (!target) {
        if (window.location.pathname.startsWith('/secure-wooleen-admin')) {
          target = '/secure-wooleen-admin/login'
        } else if (window.location.pathname.startsWith('/provider')) {
          target = '/provider/login'
        }
      }

      try {
        localStorage.removeItem('wooleen_token')
        localStorage.removeItem('wooleen_user')
      } catch (e) { void e }

      // Toast natif
      try {
        const div = document.createElement('div')
        div.textContent = '⚠️ Session expirée. Veuillez vous reconnecter.'
        div.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#fef2f2;border:2px solid #fca5a5;color:#991b1b;padding:14px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:99999;font-family:system-ui;max-width:90vw;text-align:center'
        document.body.appendChild(div)
        setTimeout(() => { try { document.body.removeChild(div) } catch (e) { void e } }, 4000)
      } catch (e) { void e }

      setTimeout(() => {
        try { window.location.href = target } catch (e) { void e }
      }, 800)
    }

    window.fetch = async function patchedFetch(input, init) {
      const res = await originalFetch(input, init)

      try {
        const url = typeof input === 'string' ? input : (input && input.url) || ''
        // Seulement pour nos endpoints API
        if (!url.includes('/api/')) return res
        // Ignore les endpoints qui retournent 401 pour des raisons légitimes (login, forgot, change-pwd)
        if (/\/auth\/(login|provider\/login|forgot-password|change-password)\b/.test(url)) return res

        if (res.status === 401) {
          const hasToken = !!localStorage.getItem('wooleen_token')
          if (hasToken) {
            handleExpired()
          }
        }
      } catch (e) { void e }

      return res
    }

    return () => {
      // En dev, on garde le patch installé (window.__wookoAuthGuardInstalled = true)
      // pour éviter les soucis HMR.
    }
  }, [])
}
