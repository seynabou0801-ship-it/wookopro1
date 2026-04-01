'use client'

import { useState, useEffect } from 'react'
import Link from "next/link"
import { openWhatsApp, getDefaultWhatsAppNumber } from "@/lib/whatsapp"

// Catégories de services
const SERVICE_CATEGORIES = [
  { value: 'plombier', label: 'Plomberie' },
  { value: 'electricien', label: 'Électricité' },
  { value: 'climatiseur', label: 'Climatisation' },
  { value: 'menuisier', label: 'Menuiserie' },
  { value: 'peintre', label: 'Peinture' },
  { value: 'serrurier', label: 'Serrurerie' },
  { value: 'nettoyage', label: 'Nettoyage' },
  { value: 'mecanicien', label: 'Mécanique auto' },
  { value: 'autre', label: 'Autre service' }
]

const CITIES = [
  'Dakar', 'Thiès', 'Saint-Louis', 'Kaolack', 'Ziguinchor', 'Touba', 'Mbour', 'Rufisque', 'Autre'
]

export default function HomePage() {
  const phone = getDefaultWhatsAppNumber()
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    serviceCategory: '',
    city: '',
    phone: '',
    description: ''
  })

  const handleQuickWhatsApp = () => {
    openWhatsApp(phone, "Bonjour Wooko, j'ai besoin d'un prestataire.")
  }

  const handleSubmitLead = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Enregistrer la demande côté plateforme
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          source: 'homepage_form'
        })
      })

      const data = await res.json()

      // Construire le message WhatsApp prérempli
      const category = SERVICE_CATEGORIES.find(c => c.value === formData.serviceCategory)?.label || formData.serviceCategory
      const message = `Bonjour Wooko,\n\nJe cherche un prestataire.\n\n` +
        `📋 Service : ${category}\n` +
        `📍 Ville : ${formData.city}\n` +
        `📞 Téléphone : ${formData.phone}\n` +
        (formData.description ? `📝 Détails : ${formData.description}\n` : '') +
        `\nMerci !`

      // Ouvrir WhatsApp avec le message prérempli
      openWhatsApp(phone, message)

      // Reset form
      setShowForm(false)
      setFormData({ serviceCategory: '', city: '', phone: '', description: '' })
    } catch (error) {
      console.error('Error:', error)
      // En cas d'erreur, ouvrir quand même WhatsApp
      openWhatsApp(phone, "Bonjour Wooko, j'ai besoin d'un prestataire.")
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Header Dynamique */}
      <header className={`border-b sticky top-0 bg-white z-40 shadow-md transition-all duration-300 ${
        isScrolled ? 'h-[48px] sm:h-[72px]' : 'h-[100px] sm:h-[160px]'
      }`}>
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between transition-all duration-300`}>
          <Link href="/" className="flex items-center flex-shrink-0">
            <img 
              src="/wooko-logo.png" 
              alt="Wooko - Besoin d'un service ?" 
              className={`w-auto object-contain transition-all duration-300 ${
                isScrolled ? 'h-[36px] sm:h-[48px]' : 'h-[66px] sm:h-[100px]'
              }`}
            />
          </Link>
          
          <div className="flex items-center gap-2 sm:gap-4 ml-4">
            <Link
              href="/login"
              className="text-xs sm:text-base text-gray-700 hover:text-orange-600 px-2 sm:px-3 py-2 font-medium transition-colors whitespace-nowrap"
            >
              Connexion
            </Link>

            <Link
              href="/provider/login"
              className="hidden md:inline-block text-sm sm:text-base text-gray-700 hover:text-orange-600 px-2 sm:px-3 py-2 font-medium transition-colors whitespace-nowrap"
            >
              Prestataire
            </Link>

            <button
              onClick={handleQuickWhatsApp}
              className="bg-[#25D366] text-white px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-bold hover:bg-[#20BA5A] flex items-center gap-2 sm:gap-3 shadow-lg hover:shadow-xl transition-all"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span>WhatsApp</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="px-4 py-12 sm:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            Trouvez un prestataire qualifié en quelques minutes
          </h1>

          <p className="mt-4 text-gray-600 text-base sm:text-lg">
            Plombier, électricien, climatisation... Décrivez votre besoin et recevez des réponses rapidement.
          </p>

          {/* CTA Principal */}
          <div className="mt-8 space-y-3">
            <button
              onClick={() => setShowForm(true)}
              className="w-full sm:w-auto bg-[#25D366] text-white px-8 py-4 rounded-xl text-lg font-bold hover:bg-[#20BA5A] shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3"
            >
              <span className="text-2xl">💬</span>
              <span>Décrire mon besoin</span>
            </button>
            <p className="text-sm text-gray-500">
              Gratuit • Réponse rapide • Sans engagement
            </p>
          </div>
        </div>
      </div>

      {/* Lead Capture Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">Décrivez votre besoin</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitLead} className="p-4 space-y-4">
              {/* Service */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quel service recherchez-vous ? *
                </label>
                <select
                  value={formData.serviceCategory}
                  onChange={(e) => setFormData({ ...formData, serviceCategory: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  required
                >
                  <option value="">Sélectionner un service</option>
                  {SERVICE_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* Ville */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ville *
                </label>
                <select
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  required
                >
                  <option value="">Sélectionner une ville</option>
                  {CITIES.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              {/* Téléphone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Votre numéro WhatsApp *
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+221 77 000 00 00"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              {/* Description (optionnel) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Détails supplémentaires <span className="text-gray-400">(optionnel)</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Décrivez votre problème ou besoin..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#25D366] text-white py-4 rounded-xl font-bold hover:bg-[#20BA5A] disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
              >
                {loading ? (
                  'Envoi...'
                ) : (
                  <>
                    <span className="text-xl">💬</span>
                    <span>Continuer sur WhatsApp</span>
                  </>
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                Vos informations sont enregistrées pour faciliter la mise en relation.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Trust Indicators */}
      <div className="bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4">
              <p className="text-2xl font-bold text-orange-600">500+</p>
              <p className="text-sm text-gray-600">Prestataires vérifiés</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-orange-600">15 min</p>
              <p className="text-sm text-gray-600">Temps de réponse moyen</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-orange-600">4.8/5</p>
              <p className="text-sm text-gray-600">Satisfaction client</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-orange-600">100%</p>
              <p className="text-sm text-gray-600">Gratuit pour vous</p>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-center mb-8">Comment ça marche ?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center p-4">
            <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">1️⃣</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Décrivez votre besoin</h3>
            <p className="text-sm text-gray-600">Remplissez le formulaire rapide ou envoyez directement un message WhatsApp</p>
          </div>
          <div className="text-center p-4">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">2️⃣</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Recevez des réponses</h3>
            <p className="text-sm text-gray-600">Des prestataires qualifiés de votre zone vous contactent rapidement</p>
          </div>
          <div className="text-center p-4">
            <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">3️⃣</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Choisissez le meilleur</h3>
            <p className="text-sm text-gray-600">Comparez les offres et choisissez le prestataire qui vous convient</p>
          </div>
        </div>
      </div>

      {/* Provider CTA */}
      <div className="bg-gray-900 text-white py-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-3">Vous êtes prestataire ?</h2>
          <p className="text-gray-400 mb-6">Rejoignez Wooko et recevez des demandes de clients dans votre zone</p>
          <Link
            href="/provider/login"
            className="inline-block bg-white text-gray-900 px-6 py-3 rounded-xl font-semibold hover:bg-gray-100"
          >
            Devenir prestataire →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">© 2025 Wooko - Marketplace de services</p>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <Link href="/provider/login" className="hover:text-gray-700">Prestataires</Link>
              <Link href="/login" className="hover:text-gray-700">Connexion</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
