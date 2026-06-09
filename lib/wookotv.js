/**
 * Helpers pour WookoproTV — supporte fichiers vidéo classiques (mp4/webm)
 * et URLs YouTube (youtube.com/watch, youtu.be, youtube.com/embed, youtube.com/shorts).
 */

/**
 * Extrait l'ID d'une vidéo YouTube depuis n'importe quelle variante d'URL.
 * @param {string} url
 * @returns {string|null} l'ID YouTube (11 caractères) ou null si non reconnu.
 */
export function getYouTubeId(url) {
  if (!url || typeof url !== 'string') return null
  // 11 chars : lettres, chiffres, _ et -
  const idPattern = /[\w-]{11}/

  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i,
    /youtu\.be\/([\w-]{11})/i,
    /youtube\.com\/embed\/([\w-]{11})/i,
    /youtube\.com\/shorts\/([\w-]{11})/i,
    /youtube\.com\/v\/([\w-]{11})/i
  ]

  for (const p of patterns) {
    const m = url.match(p)
    if (m && m[1] && idPattern.test(m[1])) return m[1]
  }
  return null
}

export function isYouTubeUrl(url) {
  return !!getYouTubeId(url)
}

/**
 * Renvoie l'URL d'embed YouTube (pour iframe) à partir d'une URL YouTube quelconque.
 * Ajoute des paramètres pour une meilleure UX : rel=0 (pas de suggestions),
 * modestbranding=1, playsinline=1.
 */
export function toYouTubeEmbedUrl(url) {
  const id = getYouTubeId(url)
  if (!id) return null
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`
}

/**
 * Renvoie l'URL d'une miniature YouTube standard.
 * variant: 'default' | 'hq' | 'maxres' (défaut : hq qui existe pour toutes les vidéos)
 */
export function getYouTubeThumbnail(url, variant = 'hq') {
  const id = getYouTubeId(url)
  if (!id) return null
  const file = variant === 'maxres' ? 'maxresdefault.jpg'
            : variant === 'default' ? 'default.jpg'
            : 'hqdefault.jpg'
  return `https://img.youtube.com/vi/${id}/${file}`
}
