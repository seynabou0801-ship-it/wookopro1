'use client'

import { getYouTubeThumbnail } from '@/lib/wookotv'

/**
 * VideoTable — Admin table for WookoTV videos.
 * Shows: thumbnail, title, category, duration, status, date, actions.
 */
export default function VideoTable({ videos, busyId, onEdit, onTogglePublish, onDelete }) {
  const formatDuration = (sec) => {
    if (!Number.isFinite(sec) || sec <= 0) return '—'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const formatDate = (d) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      })
    } catch {
      return '—'
    }
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <div className="text-5xl mb-4">📺</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Aucune vidéo pour le moment
        </h2>
        <p className="text-sm text-gray-500">
          Clique sur « + Nouvelle vidéo » pour ajouter ta première vidéo WookoproTV.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold text-gray-700">Aperçu</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Titre</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Catégorie</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Durée</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Statut</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Date</th>
              <th className="px-4 py-3 font-semibold text-gray-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {videos.map((v) => {
              const thumb = v.thumbnailUrl || getYouTubeThumbnail(v.videoUrl)
              return (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div
                    className="w-24 h-14 rounded-md overflow-hidden bg-black flex items-center justify-center"
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={v.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-white/40 text-xl">▶</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 line-clamp-2 max-w-xs">{v.title}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">{v.category || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{formatDuration(v.duration)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      v.status === 'published'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {v.status === 'published' ? 'Publiée' : 'Brouillon'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDate(v.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(v)}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    >
                      Éditer
                    </button>
                    <button
                      type="button"
                      onClick={() => onTogglePublish(v)}
                      disabled={busyId === v.id}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-60 ${
                        v.status === 'published'
                          ? 'text-amber-700 hover:bg-amber-50'
                          : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {v.status === 'published' ? 'Dépublier' : 'Publier'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(v)}
                      disabled={busyId === v.id}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-60"
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
