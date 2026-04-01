'use client'

import { useState } from 'react'
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
      {/* Header */}
      <header className="border-b sticky top-0 bg-white z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src="/wooko-logo.png" alt="Wooko" className="h-10 sm:h-12" />
          </Link>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-black px-2 py-1"
            >
              Connexion
            </Link>

            <Link
              href="/provider/login"
              className="hidden sm:inline-block text-sm text-gray-600 hover:text-black px-2 py-1"
            >
              Espace prestataire
            </Link>

            <button
              onClick={handleQuickWhatsApp}
              className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1"
            >
              <span>💬</span>
              <span className="hidden sm:inline">WhatsApp</span>
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
              className="w-full sm:w-auto bg-green-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-green-700 shadow-lg hover:shadow-xl transition-all"
            >
              💬 Décrire mon besoin
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 text-white py-4 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  'Envoi...'
                ) : (
                  <>
                    <span>💬</span>
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
              <p className="text-2xl font-bold text-green-600">500+</p>
              <p className="text-sm text-gray-600">Prestataires vérifiés</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-green-600">15 min</p>
              <p className="text-sm text-gray-600">Temps de réponse moyen</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-green-600">4.8/5</p>
              <p className="text-sm text-gray-600">Satisfaction client</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-green-600">100%</p>
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
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
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
