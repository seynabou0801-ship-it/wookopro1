'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X, Upload, CreditCard, Smartphone } from 'lucide-react'
import { useAuthSessionGuard } from '@/lib/use-auth-session-guard'

export default function SubscriptionPage() {
  useAuthSessionGuard()
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState([])
  const [mySubscription, setMySubscription] = useState(null)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentProof, setPaymentProof] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('wave')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    checkAuth()
    fetchPlans()
  }, [])

  const checkAuth = async () => {
    const token = localStorage.getItem('wooleen_token')
    const userData = localStorage.getItem('wooleen_user')
    
    if (!token || !userData) {
      router.push('/provider/login')
      return
    }

    const parsedUser = JSON.parse(userData)
    if (parsedUser.role !== 'PROVIDER') {
      router.push('/')
      return
    }

    setUser(parsedUser)
    await fetchMySubscription(parsedUser.id)
    setLoading(false)
  }

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/subscriptions/plans')
      const data = await res.json()
      setPlans(data.plans || [])
    } catch (error) {
      console.error('Error fetching plans:', error)
    }
  }

  const fetchMySubscription = async (providerId) => {
    try {
      const res = await fetch(`/api/subscriptions/my-subscription?providerId=${providerId}`)
      const data = await res.json()
      setMySubscription(data.subscription)
    } catch (error) {
      console.error('Error fetching subscription:', error)
    }
  }

  const handleSelectPlan = async (plan) => {
    if (!user) return

    // Si déjà en période d'essai ou actif, afficher modal paiement
    if (mySubscription && ['TRIAL', 'TRIAL_EXPIRED', 'PENDING_VALIDATION'].includes(mySubscription.status)) {
      setSelectedPlan(plan)
      setShowPaymentModal(true)
      return
    }

    // Sinon créer nouvel abonnement avec période d'essai
    try {
      setLoading(true)
      const res = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: user.id,
          plan: plan.name
        })
      })

      const data = await res.json()

      if (res.ok) {
        alert(`✅ ${data.message}`)
        await fetchMySubscription(user.id)
        setSelectedPlan(plan)
        setShowPaymentModal(true)
      } else {
        alert(`❌ ${data.error}`)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      setPaymentProof(reader.result) // Base64
    }
    reader.readAsDataURL(file)
  }

  const handleSubmitProof = async () => {
    if (!paymentProof || !mySubscription) {
      alert('Veuillez uploader une preuve de paiement')
      return
    }

    try {
      setUploading(true)
      const res = await fetch('/api/subscriptions/upload-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: mySubscription.id,
          paymentProof,
          paymentMethod
        })
      })

      const data = await res.json()

      if (res.ok) {
        alert(`✅ ${data.message}`)
        setShowPaymentModal(false)
        await fetchMySubscription(user.id)
      } else {
        alert(`❌ ${data.error}`)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    } finally {
      setUploading(false)
    }
  }

  const getStatusBadge = (status) => {
    const badges = {
      'TRIAL': { text: '🎁 Période d\'essai', color: 'bg-blue-100 text-blue-800' },
      'TRIAL_EXPIRED': { text: '⏱️ Essai expiré', color: 'bg-orange-100 text-orange-800' },
      'PENDING_VALIDATION': { text: '⏳ En attente', color: 'bg-yellow-100 text-yellow-800' },
      'ACTIVE': { text: '✅ Actif', color: 'bg-green-100 text-green-800' },
      'EXPIRED': { text: '❌ Expiré', color: 'bg-red-100 text-red-800' },
      'REJECTED': { text: '⛔ Rejeté', color: 'bg-red-100 text-red-800' }
    }
    const badge = badges[status] || { text: status, color: 'bg-gray-100 text-gray-800' }
    return <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.color}`}>{badge.text}</span>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6A00] mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              <span className="text-[#0B2A4A]">WOOKO</span><span className="text-[#FF6A00]">PRO</span>
            </h1>
            <p className="text-xs text-gray-600">Abonnements</p>
          </div>
          <Link 
            href="/provider/dashboard"
            className="text-sm text-gray-600 hover:text-[#FF6A00] font-medium"
          >
            ← Retour Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Current Subscription */}
        {mySubscription && (
          <div className="mb-8 bg-white rounded-xl border p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Mon Abonnement Actuel</h2>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-2xl font-bold text-[#FF6A00]">{mySubscription.plan}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {mySubscription.planDetails.price.toLocaleString()} FCFA/mois
                </p>
              </div>
              <div className="text-right">
                {getStatusBadge(mySubscription.status)}
                {mySubscription.status === 'TRIAL' && (
                  <p className="text-xs text-gray-600 mt-2">
                    Expire le : {new Date(mySubscription.trialEndsAt).toLocaleDateString('fr-FR')}
                  </p>
                )}
                {mySubscription.status === 'ACTIVE' && mySubscription.expiresAt && (
                  <p className="text-xs text-gray-600 mt-2">
                    Expire le : {new Date(mySubscription.expiresAt).toLocaleDateString('fr-FR')}
                  </p>
                )}
                {mySubscription.status === 'PENDING_VALIDATION' && (
                  <p className="text-xs text-gray-600 mt-2">
                    Validation sous 24h
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Plans */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Choisissez votre formule
          </h2>
          <p className="text-center text-gray-600 mb-8">
            🎁 7 jours d'essai gratuits pour tous les nouveaux prestataires
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`bg-white rounded-2xl border-2 p-6 shadow-lg hover:shadow-xl transition-shadow ${
                  plan.name === 'PRO' ? 'border-[#FF6A00] relative' : 'border-gray-200'
                }`}
              >
                {plan.name === 'PRO' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF6A00] text-white px-4 py-1 rounded-full text-xs font-bold">
                    POPULAIRE
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <p className="text-4xl font-bold text-[#FF6A00] mb-1">
                    {plan.price.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600">FCFA / mois</p>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={loading || (mySubscription?.status === 'ACTIVE' && mySubscription?.plan === plan.name)}
                  className={`w-full py-3 rounded-xl font-bold transition-colors ${
                    mySubscription?.status === 'ACTIVE' && mySubscription?.plan === plan.name
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : plan.name === 'PRO'
                      ? 'bg-[#FF6A00] text-white hover:bg-[#E55F00]'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {mySubscription?.status === 'ACTIVE' && mySubscription?.plan === plan.name
                    ? 'Formule actuelle'
                    : mySubscription?.status === 'TRIAL'
                    ? 'Souscrire maintenant'
                    : 'Essayer 7 jours gratuits'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <h3 className="font-bold text-blue-900 mb-2">💳 Paiement par Mobile Money</h3>
          <p className="text-sm text-blue-800">
            Paiement sécurisé via Wave ou Orange Money • Activation sous 24h après validation
          </p>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Paiement Abonnement</h2>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            {selectedPlan && (
              <>
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <p className="text-sm text-gray-600 mb-1">Formule sélectionnée</p>
                  <p className="text-2xl font-bold text-[#FF6A00]">{selectedPlan.name}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {selectedPlan.price.toLocaleString()} FCFA
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Paiement pour 30 jours</p>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="border-2 border-[#FF6A00] rounded-xl p-4 bg-orange-50">
                    <p className="font-bold text-gray-900 mb-2">📱 Numéro de paiement :</p>
                    <p className="text-2xl font-bold text-[#FF6A00] text-center py-3 bg-white rounded-lg">
                      77 338 90 95
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
                    <p className="font-bold text-blue-900 mb-2">Instructions :</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-800">
                      <li>Envoyez <strong>{selectedPlan.price.toLocaleString()} FCFA</strong> au <strong>77 338 90 95</strong></li>
                      <li>Via Wave ou Orange Money</li>
                      <li>Prenez une capture d'écran de la confirmation</li>
                      <li>Uploadez la preuve ci-dessous</li>
                    </ol>
                  </div>

                  {/* Payment Method */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Méthode de paiement
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setPaymentMethod('wave')}
                        className={`p-3 rounded-xl border-2 font-semibold transition-colors ${
                          paymentMethod === 'wave'
                            ? 'border-blue-600 bg-blue-50 text-blue-900'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        <CreditCard className="w-6 h-6 mx-auto mb-1" />
                        Wave
                      </button>
                      <button
                        onClick={() => setPaymentMethod('orange_money')}
                        className={`p-3 rounded-xl border-2 font-semibold transition-colors ${
                          paymentMethod === 'orange_money'
                            ? 'border-orange-600 bg-orange-50 text-orange-900'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        <Smartphone className="w-6 h-6 mx-auto mb-1" />
                        Orange Money
                      </button>
                    </div>
                  </div>

                  {/* Upload Proof */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Preuve de paiement
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-[#FF6A00] transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="payment-proof"
                      />
                      <label htmlFor="payment-proof" className="cursor-pointer">
                        {paymentProof ? (
                          <div>
                            <img src={paymentProof} alt="Preuve" className="max-h-40 mx-auto rounded mb-2" />
                            <p className="text-sm text-green-600 font-medium">✓ Image uploadée</p>
                          </div>
                        ) : (
                          <div>
                            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">Cliquez pour uploader</p>
                            <p className="text-xs text-gray-500 mt-1">PNG, JPG jusqu'à 5MB</p>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSubmitProof}
                  disabled={!paymentProof || uploading}
                  className="w-full bg-[#25D366] text-white py-4 rounded-xl font-bold hover:bg-[#20BA5A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {uploading ? 'Envoi en cours...' : 'Envoyer la preuve'}
                </button>

                <p className="text-xs text-gray-500 text-center mt-3">
                  Validation sous 24h • Vous serez notifié par WhatsApp
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
