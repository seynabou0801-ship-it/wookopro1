'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import VideoTable from '@/components/admin/VideoTable'
import VideoForm from '@/components/admin/VideoForm'
import { useAuthSessionGuard } from '@/lib/use-auth-session-guard'

/**
 * WookoTV admin — Video management page.
 * Reuses the existing admin auth pattern : localStorage `wooleen_token` + `wooleen_user`.
 * Non-destructive : separate route, no edit to existing admin dashboard logic.
 */
export default function WookoTVAdminPage() {
  useAuthSessionGuard()
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null = closed, {} = new, video object = edit
  const [toast, setToast] = useState(null)
  const [busyId, setBusyId] = useState(null)

  // Reuse existing admin auth
  useEffect(() => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('wooleen_token')
    const raw = localStorage.getItem('wooleen_user')
    const user = raw ? JSON.parse(raw) : null
    if (!token || !user || user.role !== 'ADMIN') {
      router.replace('/secure-wooleen-admin/login')
      return
    }

    // ✅ Patch global fetch : injection automatique du Bearer JWT
    if (!window.__wpro_fetch_patched) {
      const originalFetch = window.fetch.bind(window)
      window.fetch = (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url || ''
        if (url.startsWith('/api/')) {
          const t = localStorage.getItem('wooleen_token')
          if (t) {
            const headers = new Headers(init.headers || {})
            if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${t}`)
            init = { ...init, headers }
          }
        }
        return originalFetch(input, init)
      }
      window.__wpro_fetch_patched = true
    }

    setAuthChecked(true)
  }, [router])

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const loadVideos = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/videos', { cache: 'no-store' })
      const d = await r.json()
      setVideos(Array.isArray(d?.videos) ? d.videos : [])
    } catch (e) {
      showToast('error', `Erreur de chargement : ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authChecked) loadVideos()
  }, [authChecked])

  const handleSave = async (payload, id) => {
    try {
      const url = id ? `/api/admin/videos/${id}` : '/api/admin/videos'
      const method = id ? 'PATCH' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      showToast('success', id ? 'Vidéo mise à jour' : 'Vidéo créée')
      setEditing(null)
      await loadVideos()
    } catch (e) {
      showToast('error', e.message)
    }
  }

  const handleTogglePublish = async (video) => {
    setBusyId(video.id)
    try {
      const nextStatus = video.status === 'published' ? 'draft' : 'published'
      const r = await fetch(`/api/admin/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d?.error || `HTTP ${r.status}`)
      }
      showToast(
        'success',
        nextStatus === 'published' ? 'Vidéo publiée' : 'Vidéo dépubliée'
      )
      await loadVideos()
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (video) => {
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer définitivement « ${video.title} » ?`)) return
    setBusyId(video.id)
    try {
      const r = await fetch(`/api/admin/videos/${video.id}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d?.error || `HTTP ${r.status}`)
      }
      showToast('success', 'Vidéo supprimée')
      await loadVideos()
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Vérification...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              📺 WookoproTV — Gestion des vidéos
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Section publique affichée sur la home (uniquement les vidéos « Publiées »).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/secure-wooleen-admin')}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Retour au dashboard
            </button>
            <button
              type="button"
              onClick={() => setEditing({})}
              className="px-4 py-2 bg-[#FF6B00] hover:bg-[#E55D00] text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2 shadow-sm transition-colors"
            >
              + Nouvelle vidéo
            </button>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-20 right-4 z-[100] px-5 py-3 rounded-xl shadow-2xl border max-w-sm ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl leading-none">
              {toast.type === 'success' ? '✅' : '⚠️'}
            </span>
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 sm:px-8 py-8">
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
            Chargement des vidéos...
          </div>
        ) : (
          <VideoTable
            videos={videos}
            busyId={busyId}
            onEdit={(v) => setEditing(v)}
            onTogglePublish={handleTogglePublish}
            onDelete={handleDelete}
          />
        )}
      </main>

      {/* Form modal */}
      {editing !== null && (
        <VideoForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
