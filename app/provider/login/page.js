'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProviderAuthPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('login')
  const [showPassword, setShowPassword] = useState({
    login: false,
    register: false,
    confirm: false
  })
  const [formData, setFormData] = useState({
    // Login
    loginPhone: '',
    loginPassword: '',
    // Register
    name: '',
    phone: '',
    city: '',
    service: '',
    password: '',
    passwordConfirm: '',
    acceptTerms: false
  })
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/provider/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formData.loginPhone,
          password: formData.loginPassword
        })
      })

      const data = await res.json()

      if (res.ok) {
        localStorage.setItem('wooleen_token', data.token)
        localStorage.setItem('wooleen_user', JSON.stringify(data.user))
        router.push('/provider/dashboard')
      } else {
        // Gérer les différents types d'erreurs
        if (data.error === 'COMPTE_EN_ATTENTE') {
          alert('⏳ Compte en attente de validation\n\n' + data.message)
        } else if (data.error === 'COMPTE_REJETE') {
          alert('❌ Compte refusé\n\n' + data.message)
        } else if (data.error === 'COMPTE_INACTIF') {
          alert('❌ Compte inactif\n\n' + data.message)
        } else {
          alert('❌ ' + (data.message || data.error || 'Erreur de connexion'))
        }
      }
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Erreur de connexion. Veuillez réessayer.')
    }

    setLoading(false)
  }

  const handleRegister = async (e) => {
    e.preventDefault()

    // Validate password match
    if (formData.password !== formData.passwordConfirm) {
      alert('❌ Les mots de passe ne correspondent pas !')
      return
    }

    // Validate terms
    if (!formData.acceptTerms) {
      alert('❌ Vous devez accepter les conditions d\'utilisation')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/provider/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formData.phone,
          password: formData.password,
          businessName: formData.name,
          serviceCategory: formData.service,
          city: formData.city
        })
      })

      const data = await res.json()

      if (res.ok) {
        setRegistered(true)
      } else {
        alert('❌ ' + (data.error || 'Erreur lors de l\'inscription'))
      }
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Erreur de connexion. Veuillez réessayer.')
    }

    setLoading(false)
  }

  const togglePassword = (field) => {
    setShowPassword(prev => ({ ...prev, [field]: !prev[field] }))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-700 flex items-center justify-center p-5">
      <div className="w-full max-w-lg">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#FF7A00] to-orange-500 px-6 py-8 text-center text-white">
            <h1 className="text-3xl font-bold mb-2">🏢 Espace Prestataire</h1>
            <p className="text-sm opacity-95">Rejoignez Wooko et développez votre activité</p>
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-100 border-b-2 border-gray-200">
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-5 text-base font-semibold transition-all relative ${
                activeTab === 'login'
                  ? 'text-[#FF7A00] bg-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Connexion
              {activeTab === 'login' && (
                <span className="absolute bottom-0 left-0 right-0 h-1 bg-[#FF7A00]"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`flex-1 py-5 text-base font-semibold transition-all relative ${
                activeTab === 'register'
                  ? 'text-[#FF7A00] bg-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Inscription
              {activeTab === 'register' && (
                <span className="absolute bottom-0 left-0 right-0 h-1 bg-[#FF7A00]"></span>
              )}
            </button>
          </div>

          {/* Login Tab */}
          {activeTab === 'login' && (
            <div className="p-8 animate-fadeIn">
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Numéro de téléphone
                  </label>
                  <input
                    type="tel"
                    value={formData.loginPhone}
                    onChange={(e) => setFormData({ ...formData, loginPhone: e.target.value })}
                    placeholder="+221 77 123 45 67"
                    required
                    className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00] focus:ring-4 focus:ring-orange-100 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword.login ? 'text' : 'password'}
                      value={formData.loginPassword}
                      onChange={(e) => setFormData({ ...formData, loginPassword: e.target.value })}
                      placeholder="••••••••"
                      required
                      className="w-full px-4 py-3.5 pr-12 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00] focus:ring-4 focus:ring-orange-100 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => togglePassword('login')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword.login ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-[#FF7A00] to-orange-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '⏳ Connexion...' : 'Se connecter'}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => alert('Contactez l\'administrateur pour réinitialiser votre mot de passe')}
                    className="text-[#FF7A00] text-sm font-semibold hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Register Tab */}
          {activeTab === 'register' && (
            <div className="p-8 animate-fadeIn">
              {!registered ? (
                <>
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-6">
                    <p className="text-sm text-yellow-800">
                      ⚠️ <strong>Important :</strong> Toute inscription prestataire est soumise à validation par l'administrateur avant activation du compte.
                    </p>
                  </div>

                  <form onSubmit={handleRegister} className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Nom complet *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ex: Jean Dupont"
                        required
                        className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00] focus:ring-4 focus:ring-orange-100 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Numéro WhatsApp *
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+221 77 123 45 67"
                        required
                        className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00] focus:ring-4 focus:ring-orange-100 transition-all"
                      />
                      <p className="text-xs text-gray-500 mt-1.5">
                        Ce numéro sera utilisé pour toutes les communications
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Ville *
                      </label>
                      <select
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        required
                        className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00] focus:ring-4 focus:ring-orange-100 transition-all"
                      >
                        <option value="">Sélectionnez votre ville</option>
                        <option value="Dakar">Dakar</option>
                        <option value="Thiès">Thiès</option>
                        <option value="Saint-Louis">Saint-Louis</option>
                        <option value="Kaolack">Kaolack</option>
                        <option value="Ziguinchor">Ziguinchor</option>
                        <option value="Touba">Touba</option>
                        <option value="Mbour">Mbour</option>
                        <option value="Rufisque">Rufisque</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Type de service *
                      </label>
                      <select
                        value={formData.service}
                        onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                        required
                        className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00] focus:ring-4 focus:ring-orange-100 transition-all"
                      >
                        <option value="">Sélectionnez votre service</option>
                        <option value="plombier">Plomberie</option>
                        <option value="electricien">Électricité</option>
                        <option value="climatiseur">Climatisation</option>
                        <option value="menuisier">Menuiserie</option>
                        <option value="peintre">Peinture</option>
                        <option value="serrurier">Serrurerie</option>
                        <option value="nettoyage">Nettoyage</option>
                        <option value="mecanicien">Mécanique auto</option>
                        <option value="autre">Autre</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Mot de passe *
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword.register ? 'text' : 'password'}
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder="••••••••"
                          required
                          minLength={6}
                          className="w-full px-4 py-3.5 pr-12 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00] focus:ring-4 focus:ring-orange-100 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => togglePassword('register')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showPassword.register ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Confirmation mot de passe *
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword.confirm ? 'text' : 'password'}
                          value={formData.passwordConfirm}
                          onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                          placeholder="••••••••"
                          required
                          minLength={6}
                          className="w-full px-4 py-3.5 pr-12 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00] focus:ring-4 focus:ring-orange-100 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => togglePassword('confirm')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showPassword.confirm ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="terms"
                        checked={formData.acceptTerms}
                        onChange={(e) => setFormData({ ...formData, acceptTerms: e.target.checked })}
                        required
                        className="mt-1 w-4 h-4 cursor-pointer"
                      />
                      <label htmlFor="terms" className="text-sm text-gray-600 cursor-pointer">
                        J'accepte les <a href="#" className="text-[#FF7A00] font-semibold hover:underline">conditions d'utilisation</a> et la <a href="#" className="text-[#FF7A00] font-semibold hover:underline">politique de confidentialité</a>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-[#FF7A00] to-orange-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? '⏳ Création...' : 'Créer mon compte'}
                    </button>
                  </form>
                </>
              ) : (
                <div className="space-y-6">
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                    <p className="text-green-800 font-semibold text-lg mb-3">
                      ✅ Demande envoyée avec succès !
                    </p>
                    <p className="text-green-700 text-sm leading-relaxed mb-2">
                      Votre demande d'inscription est en attente de validation par l'administrateur.
                    </p>
                    <p className="text-green-700 text-sm leading-relaxed">
                      Vous recevrez une notification par WhatsApp au <strong>{formData.phone}</strong> dès que votre compte sera activé.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setRegistered(false)
                      setActiveTab('login')
                      setFormData({
                        loginPhone: '',
                        loginPassword: '',
                        name: '',
                        phone: '',
                        city: '',
                        service: '',
                        password: '',
                        passwordConfirm: '',
                        acceptTerms: false
                      })
                    }}
                    className="w-full bg-gradient-to-r from-[#FF7A00] to-orange-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
                  >
                    Retour à la connexion
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <Link href="/" className="text-white text-sm font-semibold hover:underline">
            ← Retour à l'accueil
          </Link>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
