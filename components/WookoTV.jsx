'use client'

import { useEffect, useState, useRef } from 'react'
import { isYouTubeUrl, toYouTubeEmbedUrl, getYouTubeThumbnail } from '@/lib/wookotv'

/**
 * WookoTV — Public video section
 * Fetches published videos from /api/videos/published.
 * If no published video exists, returns null (section hidden, homepage unchanged).
 * Non-destructive : isolated component, no shared state with other sections.
 */
export default function WookoTV() {
  const [videos, setVideos] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fadeKey, setFadeKey] = useState(0)
  const videoRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/videos/published', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { videos: [] }))
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data?.videos) ? data.videos : []
        setVideos(list)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Hidden while loading and when there is no published video — safe default
  if (loading) return null
  if (!videos || videos.length === 0) return null

  const active = videos[activeIndex] || videos[0]

  const handleSelect = (idx) => {
    if (idx === activeIndex) return
    setActiveIndex(idx)
    setFadeKey((k) => k + 1) // remount <video> for smooth fade-in
  }

  const handleShare = (video) => {
    const text = encodeURIComponent(
      `${video.title}\n\nRegardez cette vidéo WookoproTV : ${video.videoUrl}`
    )
    const url = `https://wa.me/?text=${text}`
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section
      id="wookotv"
      className="py-16 sm:py-24"
      style={{ backgroundColor: '#0a1628' }}
      aria-label="WookoproTV"
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        {/* Heading */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-semibold uppercase tracking-wider mb-4">
            📺 WookoproTV
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            Découvrez nos vidéos
          </h2>
          <p className="text-base sm:text-lg text-white/70 max-w-2xl mx-auto">
            Tutoriels, témoignages et nouveautés WookoPRO
          </p>
        </div>

        {/* Main player */}
        <div className="flex justify-center">
          <div
            className="w-full"
            style={{ maxWidth: '860px' }}
          >
            <div
              className="relative w-full overflow-hidden rounded-2xl shadow-2xl bg-black"
              style={{ aspectRatio: '16 / 9' }}
            >
              {isYouTubeUrl(active?.videoUrl) ? (
                <iframe
                  key={fadeKey}
                  src={toYouTubeEmbedUrl(active.videoUrl)}
                  title={active?.title || 'WookoproTV'}
                  className="absolute inset-0 w-full h-full wpro-fade-video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <video
                  key={fadeKey}
                  ref={videoRef}
                  controls
                  playsInline
                  poster={active?.thumbnailUrl || undefined}
                  className="absolute inset-0 w-full h-full object-contain wpro-fade-video"
                  preload="metadata"
                >
                  <source src={active?.videoUrl} />
                  Votre navigateur ne supporte pas la lecture vidéo HTML5.
                </video>
              )}
            </div>

            {/* Title + share */}
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg sm:text-xl font-semibold text-white">
                  {active?.title}
                </h3>
                {active?.category && (
                  <p className="text-sm text-white/60 mt-0.5">
                    {active.category}
                  </p>
                )}
                {active?.description && (
                  <p className="text-sm text-white/70 mt-2 max-w-2xl">
                    {active.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleShare(active)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20BA5A] text-white text-sm font-semibold transition-colors shadow-md flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
                </svg>
                Partager sur WhatsApp
              </button>
            </div>
          </div>
        </div>

        {/* Playlist thumbnails */}
        {videos.length > 1 && (
          <div className="mt-10">
            <div
              className="flex gap-3 overflow-x-auto pb-2 wpro-scroll-x snap-x snap-mandatory"
            >
              {videos.map((v, idx) => {
                const isActive = idx === activeIndex
                const thumb = v.thumbnailUrl || getYouTubeThumbnail(v.videoUrl)
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelect(idx)}
                    className={`group relative flex-shrink-0 snap-start text-left rounded-xl overflow-hidden transition-all ${
                      isActive
                        ? 'ring-4 ring-[#FF6B00] shadow-lg'
                        : 'ring-1 ring-white/10 hover:ring-white/30'
                    }`}
                    style={{ width: '200px' }}
                    aria-pressed={isActive}
                  >
                    <div
                      className="bg-black relative w-full"
                      style={{ aspectRatio: '16 / 9' }}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={v.title}
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-3xl">
                          ▶
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute inset-0 bg-[#FF6B00]/20 flex items-center justify-center">
                          <span className="text-white text-3xl drop-shadow-lg">▶</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2 bg-white/5">
                      <p className="text-xs font-medium text-white line-clamp-2 leading-snug">
                        {v.title}
                      </p>
                      {v.category && (
                        <p className="text-[10px] text-white/50 mt-0.5 uppercase">
                          {v.category}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .wpro-fade-video {
          animation: wpro-tv-fade 0.35s ease-out;
        }
        @keyframes wpro-tv-fade {
          from { opacity: 0.2; transform: scale(0.99); }
          to   { opacity: 1;   transform: scale(1); }
        }
        .wpro-scroll-x::-webkit-scrollbar { height: 6px; }
        .wpro-scroll-x::-webkit-scrollbar-track { background: transparent; }
        .wpro-scroll-x::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 999px;
        }
      `}</style>
    </section>
  )
}
