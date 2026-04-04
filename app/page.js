'use client'

import { useState, useEffect } from 'react'
import Link from "next/link"
import { openWhatsApp, getDefaultWhatsAppNumber } from "@/lib/whatsapp"
import { Wrench, Zap, Wind, Sparkles, Home, Phone, CheckCircle2, Clock, Shield, Users, Hammer } from 'lucide-react'

// Catégories de services
const SERVICE_CATEGORIES = [
  { value: 'plombier', label: 'Plomberie', icon: Wrench },
  { value: 'electricien', label: 'Électricité', icon: Zap },
  { value: 'climatiseur', label: 'Climatisation', icon: Wind },
  { value: 'menuisier', label: 'Menuiserie', icon: Hammer },
  { value: 'peintre', label: 'Peinture', icon: Sparkles },
  { value: 'serrurier', label: 'Serrurerie', icon: Home },
  { value: 'nettoyage', label: 'Nettoyage', icon: Sparkles },
  { value: 'mecanicien', label: 'Mécanique auto', icon: Wrench },
  { value: 'autre', label: 'Autre service', icon: Hammer }
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
    <main className="min-h-screen bg-gradient-to-b from-white via-gray-50 to-white">
      {/* Header Premium - Logo Dominant */}
      <header className={`border-b sticky top-0 bg-white/98 backdrop-blur-md z-40 transition-all duration-300 ${
        isScrolled ? 'shadow-lg h-[80px] sm:h-[100px]' : 'shadow-sm h-[100px] sm:h-[140px]'
      }`}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center flex-shrink-0 py-3">
            <img 
              src="/wooko-logo.png" 
              alt="Wooko.sn - Marketplace de services" 
              className={`w-auto object-contain transition-all duration-300 ${
                isScrolled ? 'h-[60px] sm:h-[70px]' : 'h-[70px] sm:h-[100px]'
              }`}
              style={{ imageRendering: '-webkit-optimize-contrast', imageRendering: 'crisp-edges' }}
            />
          </Link>
          
          <div className="flex items-center gap-2 sm:gap-8 ml-4 sm:ml-6">
            <Link
              href="/login"
              className="text-xs sm:text-base text-gray-700 hover:text-[#FF7A00] font-medium transition-colors"
            >
              Connexion
            </Link>

            <Link
              href="/provider/login"
              className="text-xs sm:text-base text-gray-700 hover:text-[#FF7A00] font-medium transition-colors"
            >
              Prestataire
            </Link>

            <button
              onClick={handleQuickWhatsApp}
              className="bg-[#25D366] hover:bg-[#20BA5A] text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-base flex items-center gap-1.5 sm:gap-2 shadow-lg hover:shadow-xl transition-all whitespace-nowrap"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span className="text-xs sm:text-base">WhatsApp</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section Premium */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#FF7A00]/5 via-transparent to-blue-500/5 pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-16 sm:py-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Content */}
            <div className="space-y-8">
              <div className="space-y-6">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                  Trouvez un prestataire qualifié en{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF7A00] to-orange-600">
                    quelques minutes
                  </span>
                </h1>
                
                <p className="text-lg sm:text-xl text-gray-600 leading-relaxed">
                  Des professionnels fiables, disponibles près de chez vous. Simple, rapide et sans engagement.
                </p>
              </div>

              {/* CTA Button */}
              <div className="space-y-4">
                <button
                  onClick={() => setShowForm(true)}
                  className="group w-full sm:w-auto bg-[#25D366] hover:bg-[#20BA5A] text-white px-8 py-5 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">💬</span>
                  <span>Décrire mon besoin</span>
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                
                {/* Trust badges */}
                <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-[#25D366]" />
                    <span>Réponse rapide</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-[#FF7A00]" />
                    <span>Prestataires vérifiés</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                    <span>Service gratuit</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right - Visual with professional images */}
            <div className="relative hidden lg:block">
              <div className="relative h-[500px]">
                {/* Image composite des professionnels */}
                <div className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl border-4 border-white transform hover:scale-[1.02] transition-transform">
                  <img 
                    src="/wooko-professionals.png" 
                    alt="Professionnels africains - Plombier, Électricien, Technicien, Menuisier, Peintre, Serrurier"
                    className="w-full h-full object-cover object-center"
                  />
                </div>
                
                {/* Floating stats card */}
                <div className="absolute bottom-6 right-6 bg-white rounded-2xl shadow-2xl p-6 border border-gray-100 z-10 hover:shadow-3xl transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#25D366]/10 rounded-xl flex items-center justify-center">
                      <Users className="w-6 h-6 text-[#25D366]" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">500+</p>
                      <p className="text-sm text-gray-600">Prestataires actifs</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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

      {/* Stats Section Premium */}
      <section className="bg-white border-y py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FF7A00]/10 mb-4">
                <Users className="w-8 h-8 text-[#FF7A00]" />
              </div>
              <p className="text-4xl font-bold bg-gradient-to-r from-[#FF7A00] to-orange-600 bg-clip-text text-transparent">2000+</p>
              <p className="text-sm font-medium text-gray-600">Demandes traitées</p>
            </div>
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#25D366]/10 mb-4">
                <Shield className="w-8 h-8 text-[#25D366]" />
              </div>
              <p className="text-4xl font-bold bg-gradient-to-r from-[#25D366] to-green-600 bg-clip-text text-transparent">500+</p>
              <p className="text-sm font-medium text-gray-600">Prestataires actifs</p>
            </div>
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 mb-4">
                <Clock className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">7j/7</p>
              <p className="text-sm font-medium text-gray-600">Disponibilité</p>
            </div>
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
                <CheckCircle2 className="w-8 h-8 text-purple-600" />
              </div>
              <p className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-500 bg-clip-text text-transparent">4.8/5</p>
              <p className="text-sm font-medium text-gray-600">Satisfaction client</p>
            </div>
          </div>
        </div>
      </section>

      {/* Comment ça marche Section */}
      <section className="py-16 sm:py-24 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Comment ça marche ?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Trois étapes simples pour trouver le prestataire idéal
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            <div className="relative group">
              <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all border border-gray-100">
                <div className="w-16 h-16 bg-gradient-to-br from-[#FF7A00] to-orange-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-3xl font-bold text-white">1</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Décrivez votre besoin</h3>
                <p className="text-gray-600 leading-relaxed">
                  Remplissez le formulaire rapide en quelques secondes ou contactez-nous directement sur WhatsApp.
                </p>
              </div>
            </div>

            <div className="relative group">
              <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all border border-gray-100">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-3xl font-bold text-white">2</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Nous trouvons les prestataires</h3>
                <p className="text-gray-600 leading-relaxed">
                  Notre algorithme sélectionne les meilleurs professionnels de votre zone, disponibles et qualifiés.
                </p>
              </div>
            </div>

            <div className="relative group">
              <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all border border-gray-100">
                <div className="w-16 h-16 bg-gradient-to-br from-[#25D366] to-green-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-3xl font-bold text-white">3</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Recevez des réponses</h3>
                <p className="text-gray-600 leading-relaxed">
                  Les prestataires intéressés vous contactent rapidement sur WhatsApp. Comparez et choisissez !
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Populaires Section */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Services populaires
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Trouvez rapidement le professionnel dont vous avez besoin
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {SERVICE_CATEGORIES.slice(0, 8).map((service) => {
              const Icon = service.icon
              return (
                <button
                  key={service.value}
                  onClick={() => {
                    setFormData({ ...formData, serviceCategory: service.value })
                    setShowForm(true)
                  }}
                  className="group bg-gray-50 hover:bg-gradient-to-br hover:from-[#FF7A00]/10 hover:to-orange-100/50 rounded-2xl p-6 transition-all hover:shadow-lg border border-transparent hover:border-[#FF7A00]/20"
                >
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                      <Icon className="w-7 h-7 text-[#FF7A00]" />
                    </div>
                    <span className="font-semibold text-gray-900 text-sm sm:text-base">{service.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Section Confiance */}
      <section className="py-16 sm:py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Pourquoi choisir Wooko ?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Une plateforme de confiance pour tous vos besoins de services
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-[#25D366] to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Prestataires vérifiés</h3>
              <p className="text-gray-600">
                Tous nos professionnels sont vérifiés et évalués par la communauté
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-[#FF7A00] to-orange-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Intervention rapide</h3>
              <p className="text-gray-600">
                Des réponses en quelques minutes, disponibles 7 jours sur 7
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
                <Phone className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Support WhatsApp</h3>
              <p className="text-gray-600">
                Communication simple et directe via WhatsApp avec les prestataires
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Sans engagement</h3>
              <p className="text-gray-600">
                Gratuit pour vous, comparez les offres et choisissez librement
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final WhatsApp */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-[#25D366] to-green-600 text-white">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Besoin d'une réponse rapide ?
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Contactez-nous directement sur WhatsApp et recevez une assistance immédiate
          </p>
          <button
            onClick={handleQuickWhatsApp}
            className="inline-flex items-center gap-3 bg-white text-[#25D366] px-8 py-4 rounded-2xl text-lg font-bold shadow-2xl hover:scale-105 transition-transform"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span>Ouvrir WhatsApp</span>
          </button>
        </div>
      </section>

      {/* Provider CTA Section */}
      <section className="py-16 sm:py-20 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="flex-1 text-center lg:text-left">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Vous êtes prestataire ?
              </h2>
              <p className="text-xl text-gray-300 leading-relaxed">
                Rejoignez Wooko et recevez des demandes de clients qualifiés dans votre zone. 
                Développez votre activité facilement et gratuitement.
              </p>
            </div>
            <div className="flex-shrink-0">
              <Link
                href="/provider/login"
                className="inline-flex items-center gap-3 bg-white text-gray-900 px-8 py-4 rounded-2xl text-lg font-bold hover:bg-gray-100 shadow-2xl transition-all"
              >
                <span>Devenir prestataire</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Premium */}
      <footer className="bg-white border-t py-12">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Logo & Description */}
            <div className="space-y-4">
              <img src="/wooko-logo.png" alt="Wooko" className="h-12 w-auto" />
              <p className="text-gray-600 text-sm">
                La marketplace n°1 des services au Sénégal. Connectez-vous aux meilleurs professionnels près de chez vous.
              </p>
            </div>

            {/* Links Clients */}
            <div>
              <h3 className="font-bold text-gray-900 mb-4">Pour les clients</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <button onClick={() => setShowForm(true)} className="text-gray-600 hover:text-[#FF7A00] transition-colors">
                    Trouver un prestataire
                  </button>
                </li>
                <li>
                  <Link href="/login" className="text-gray-600 hover:text-[#FF7A00] transition-colors">
                    Connexion
                  </Link>
                </li>
              </ul>
            </div>

            {/* Links Providers */}
            <div>
              <h3 className="font-bold text-gray-900 mb-4">Pour les prestataires</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/provider/login" className="text-gray-600 hover:text-[#FF7A00] transition-colors">
                    Devenir prestataire
                  </Link>
                </li>
                <li>
                  <Link href="/provider/login" className="text-gray-600 hover:text-[#FF7A00] transition-colors">
                    Connexion prestataire
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              © 2025 Wooko - Marketplace de services au Sénégal. Tous droits réservés.
            </p>
            <div className="flex items-center gap-6">
              <button 
                onClick={handleQuickWhatsApp}
                className="text-sm text-[#25D366] hover:text-[#20BA5A] font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Support WhatsApp
              </button>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
