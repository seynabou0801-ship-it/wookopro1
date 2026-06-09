'use client'

import { useEffect, useRef, useState } from 'react'
import { isYouTubeUrl, toYouTubeEmbedUrl } from '@/lib/wookotv'

const CATEGORIES = ['Pub', 'Tutoriel', 'Témoignage']

/**
 * VideoForm — Modal form to create or edit a WookoTV video.
 * Storage strategy: paste a public URL (mp4/webm hosted elsewhere).
 * Compatible with stateless production deployment.
 */
export default function VideoForm({ initial, onClose, onSave }) {
  const isEditing = !!initial?.id
  const [form, setForm] = useState({
    title: initial?.title || '',
    category: initial?.category || 'Pub',
    videoUrl: initial?.videoUrl || '',
    thumbnailUrl: initial?.thumbnailUrl || '',
    description: initial?.description || '',
    duration: initial?.duration || null,
    status: initial?.status || 'draft'
  })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [previewDuration, setPreviewDuration] = useState(initial?.duration || null)
  const videoRef = useRef(null)

  // Auto-extract duration from the URL preview
  const handleLoadedMetadata = () => {
    const d = videoRef.current?.duration
    if (Number.isFinite(d) && d > 0) {
      setPreviewDuration(Math.round(d))
      setForm((f) => ({ ...f, duration: Math.round(d) }))
    }
  }

  // ESC + body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    const title = form.title.trim()
    const videoUrl = form.videoUrl.trim()
    if (!title) return setError('Le titre est obligatoire')
    if (!videoUrl) return setError("L'URL de la vidéo est obligatoire")
    if (!/^https?:\/\//i.test(videoUrl) && !videoUrl.startsWith('data:')) {
      return setError("L'URL doit commencer par https:// ou http://")
    }
    setSubmitting(true)
    try {
      await onSave({
        title,
        category: form.category,
        videoUrl,
        thumbnailUrl: form.thumbnailUrl.trim() || null,
        description: form.description.trim() || null,
        duration: form.duration,
        status: form.status
      }, initial?.id)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="videoform-title"
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 sm:p-4 wpro-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl wpro-scale"
      >
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 id="videoform-title" className="text-lg font-semibold">
            {isEditing ? 'Éditer la vidéo' : 'Nouvelle vidéo WookoproTV'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="vf-title" className="block text-sm font-medium text-gray-700 mb-1">
              Titre *
            </label>
            <input
              id="vf-title"
              autoFocus
              type="text"
              maxLength={255}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="vf-cat" className="block text-sm font-medium text-gray-700 mb-1">
              Catégorie
            </label>
            <select
              id="vf-cat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Video URL */}
          <div>
            <label htmlFor="vf-url" className="block text-sm font-medium text-gray-700 mb-1">
              URL de la vidéo *
              <span className="text-xs text-gray-500 font-normal ml-2">
                (YouTube, ou mp4 / webm hébergée sur S3, Cloudinary, Bunny, etc.)
              </span>
            </label>
            <input
              id="vf-url"
              type="url"
              value={form.videoUrl}
              onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
              placeholder="https://youtu.be/... ou https://exemple.com/ma-video.mp4"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
            {form.videoUrl && /^https?:\/\//i.test(form.videoUrl) && (
              <div className="mt-2 rounded-lg overflow-hidden bg-black" style={{ aspectRatio: '16 / 9' }}>
                {isYouTubeUrl(form.videoUrl) ? (
                  <iframe
                    src={toYouTubeEmbedUrl(form.videoUrl)}
                    title="Aperçu YouTube"
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={form.videoUrl}
                    controls
                    preload="metadata"
                    onLoadedMetadata={handleLoadedMetadata}
                    className="w-full h-full"
                  />
                )}
              </div>
            )}
            {isYouTubeUrl(form.videoUrl) && (
              <p className="text-xs text-emerald-700 mt-1">
                ✅ Vidéo YouTube détectée — lecture via iframe officiel YouTube.
              </p>
            )}
            {previewDuration && !isYouTubeUrl(form.videoUrl) && (
              <p className="text-xs text-gray-500 mt-1">
                Durée détectée automatiquement : {Math.floor(previewDuration / 60)}m {previewDuration % 60}s
              </p>
            )}
          </div>

          {/* Thumbnail */}
          <div>
            <label htmlFor="vf-thumb" className="block text-sm font-medium text-gray-700 mb-1">
              URL de la miniature
              <span className="text-xs text-gray-500 font-normal ml-2">(jpg / png — optionnel)</span>
            </label>
            <input
              id="vf-thumb"
              type="url"
              value={form.thumbnailUrl}
              onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
              placeholder="https://exemple.com/miniature.jpg"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="vf-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="vf-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              placeholder="Quelques mots sur le contenu..."
            />
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
            <div>
              <p className="font-medium text-gray-900">Statut</p>
              <p className="text-xs text-gray-500">
                Une vidéo en « brouillon » n'apparaît pas sur la home.
              </p>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.status === 'published'}
                onChange={(e) => setForm({ ...form, status: e.target.checked ? 'published' : 'draft' })}
                className="sr-only peer"
              />
              <div className="relative w-12 h-7 bg-gray-300 peer-checked:bg-emerald-500 rounded-full transition-colors">
                <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${form.status === 'published' ? 'translate-x-5' : ''}`} />
              </div>
              <span className={`ml-3 text-sm font-medium ${form.status === 'published' ? 'text-emerald-700' : 'text-gray-600'}`}>
                {form.status === 'published' ? 'Publiée' : 'Brouillon'}
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-[#FF6B00] hover:bg-[#E55D00] text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Enregistrement...' : (isEditing ? 'Enregistrer' : 'Créer la vidéo')}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .wpro-fade { animation: vf-fade 0.18s ease-out; }
        .wpro-scale { animation: vf-scale 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes vf-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vf-scale {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  )
}
