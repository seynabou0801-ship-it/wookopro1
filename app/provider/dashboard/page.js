'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Phone, MessageCircle, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { useAuthSessionGuard } from '@/lib/use-auth-session-guard'

export default function ProviderDashboard() {
  useAuthSessionGuard()
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [provider, setProvider] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState(null)
  const [leads, setLeads] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  // ⚡ NOUVEAU Lot 3c — Historique des connexions
  const [loginHistory, setLoginHistory] = useState([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  const fetchLoginHistory = async () => {
    try {
      const token = localStorage.getItem('wooleen_token')
      const res = await fetch('/api/auth/login-history', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setLoginHistory(data.history || [])
      }
    } catch (err) {
      console.error('Erreur historique:', err)
    }
  }

  // ⚡ NOUVEAU : modal "Changer mon mot de passe"
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew] = useState('')
  const [cpConfirm, setCpConfirm] = useState('')
  const [cpShowPwd, setCpShowPwd] = useState(false)
  const [cpLoading, setCpLoading] = useState(false)
  const [cpError, setCpError] = useState('')
  const [cpSuccess, setCpSuccess] = useState(false)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setCpError('')

    if (cpNew !== cpConfirm) {
      setCpError('La confirmation ne correspond pas au nouveau mot de passe')
      return
    }
    if (cpNew.length < 8 || !/[A-Z]/.test(cpNew) || !/[a-z]/.test(cpNew) || !/\d/.test(cpNew)) {
      setCpError('Le mot de passe doit contenir au moins 8 caractères, 1 majuscule, 1 minuscule et 1 chiffre')
      return
    }

    setCpLoading(true)
    try {
      const token = localStorage.getItem('wooleen_token')
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew })
      })
      const data = await res.json()

      if (res.ok && data.success) {
        // Conserve la session actuelle : remplace le token par le nouveau
        if (data.token) {
          localStorage.setItem('wooleen_token', data.token)
        }
        setCpSuccess(true)
        setCpCurrent('')
        setCpNew('')
        setCpConfirm('')
      } else {
        setCpError(data.error || data.message || 'Erreur lors du changement de mot de passe')
      }
    } catch (err) {
      setCpError('Erreur réseau. Veuillez réessayer.')
    } finally {
      setCpLoading(false)
    }
  }

  useEffect(() => {
    const storedUser = localStorage.getItem('wooleen_user')
    if (!storedUser) {
      router.push('/provider/login')
      return
    }
    const userData = JSON.parse(storedUser)
    if (userData.role !== 'PROVIDER') {
      router.push('/provider/login')
      return
    }
    setUser(userData)
    fetchProviderData(userData.id)
  }, [])

  const fetchProviderData = async (userId) => {
    try {
      const res = await fetch('/api/providers')
      if (res.ok) {
        const providers = await res.json()
        const myProvider = providers.find(p => p.userId === userId)
        if (myProvider) {
          setProvider(myProvider)
          
          // Vérifier si le compte est désactivé
          if (myProvider.accountStatus && myProvider.accountStatus !== 'ACTIVE') {
            // Compte désactivé, on charge quand même mais on affichera un banner
            console.log('⚠️ Compte désactivé:', myProvider.accountStatus)
          }
          
          await fetchSubscription(userId)
          await fetchLeads(userId)
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
    setLoading(false)
  }

  const fetchSubscription = async (userId) => {
    try {
      const res = await fetch(`/api/subscriptions/my-subscription?providerId=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setSubscription(data.subscription)
      }
    } catch (error) {
      console.error('Error fetching subscription:', error)
    }
  }

  const fetchLeads = async (userId) => {
    try {
      const res = await fetch(`/api/provider/leads?providerId=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setLeads(data.leads || [])
      }
    } catch (error) {
      console.error('Error fetching leads:', error)
    }
  }

  const handleContactClient = async (match) => {
    try {
      setRefreshing(true)
      const res = await fetch(`/api/requests/${match.requestId}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: user.id })
      })

      if (res.ok) {
        alert('✅ Contact confirmé !')
        await fetchLeads(user.id)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const openWhatsApp = (phone, name, service) => {
    const cleanPhone = phone.replace(/[^\d]/g, '')
    const message = `Bonjour ${name || ''} 👋\n\nJe suis ${provider?.businessName || 'un prestataire'} sur WookoPRO.\n\nJ'ai vu votre demande de ${service}. Je peux vous aider !\n\nQuand êtes-vous disponible pour discuter ?`
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
    handleContactClient({ requestId: phone, providerId: user?.id })
  }

  const handleCallClient = (phone) => {
    window.location.href = `tel:${phone}`
  }

  const handleLogout = () => {
    localStorage.removeItem('wooleen_token')
    localStorage.removeItem('wooleen_user')
    router.push('/provider/login')
  }

  const canViewClientPhone = () => {
    return subscription && ['TRIAL', 'ACTIVE'].includes(subscription.status)
  }

  const getStatusBadge = (status) => {
    const badges = {
      'SENT': { text: '🆕 Nouveau', color: 'bg-blue-100 text-blue-800' },
      'CONTACTED': { text: '✅ Contacté', color: 'bg-green-100 text-green-800' },
      'WON': { text: '🏆 Gagné', color: 'bg-purple-100 text-purple-800' }
    }
    const badge = badges[status] || { text: status, color: 'bg-gray-100 text-gray-800' }
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.color}`}>{badge.text}</span>
  }

  const getTimeAgo = (date) => {
    const now = new Date()
    const then = new Date(date)
    const diffMs = now - then
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'À l\'instant'
    if (diffMins < 60) return `Il y a ${diffMins} min`
    if (diffHours < 24) return `Il y a ${diffHours}h`
    return `Il y a ${diffDays}j`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              <span className="text-[#0B2A4A]">WOOKO</span><span className="text-[#FF6A00]">PRO</span>
            </h1>
            <p className="text-xs text-gray-600">Espace Prestataire</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:inline">{provider?.businessName}</span>
            <button
              onClick={() => { fetchLoginHistory(); setShowHistoryModal(true) }}
              className="text-sm text-gray-700 hover:text-[#FF6A00] font-medium border border-gray-200 px-3 py-1.5 rounded-lg hover:border-[#FF6A00] transition hidden sm:inline-flex items-center gap-1"
              title="Mes dernières connexions"
            >
              🕒 Connexions
            </button>
            <button
              onClick={() => setShowChangePasswordModal(true)}
              className="text-sm text-gray-700 hover:text-[#FF6A00] font-medium border border-gray-200 px-3 py-1.5 rounded-lg hover:border-[#FF6A00] transition"
              title="Changer mon mot de passe"
            >
              🔐 Mon compte
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* ⚡ BANNER COMPTE DÉSACTIVÉ */}
        {provider?.accountStatus && provider.accountStatus !== 'ACTIVE' && (
          <div className={`rounded-xl border-2 p-6 mb-6 ${
            provider.accountStatus === 'SUSPENDED' ? 'bg-red-50 border-red-300' :
            provider.accountStatus === 'INACTIVE' ? 'bg-gray-50 border-gray-300' :
            'bg-yellow-50 border-yellow-300'
          }`}>
            <div className="flex items-start gap-4">
              <div className="text-4xl">
                {provider.accountStatus === 'SUSPENDED' ? '🔴' : 
                 provider.accountStatus === 'INACTIVE' ? '⚫' : '🟡'}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {provider.accountStatus === 'SUSPENDED' && '🚫 Compte Suspendu'}
                  {provider.accountStatus === 'INACTIVE' && '⛔ Compte Désactivé'}
                  {provider.accountStatus === 'PENDING' && '⏳ Compte En Attente'}
                </h3>
                <p className="text-gray-700 mb-3">
                  {provider.accountStatus === 'SUSPENDED' && 
                    'Votre compte a été suspendu par l\'administration. Vous ne pouvez plus recevoir de nouvelles demandes.'}
                  {provider.accountStatus === 'INACTIVE' && 
                    'Votre compte a été désactivé par l\'administration. Vous ne recevez plus de nouvelles demandes.'}
                  {provider.accountStatus === 'PENDING' && 
                    'Votre compte est en attente de validation par l\'administration.'}
                </p>
                {provider.disabledReason && (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Raison :</p>
                    <p className="text-sm text-gray-600">{provider.disabledReason}</p>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span>Contactez le support au <strong className="text-[#FF6A00]">+33 7 77 36 94 62</strong> pour plus d'informations</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subscription Widget */}
        {subscription ? (
          <div className={`rounded-xl border-2 p-5 mb-6 ${
            subscription.status === 'ACTIVE' ? 'bg-green-50 border-green-200' :
            subscription.status === 'TRIAL' ? 'bg-blue-50 border-blue-200' :
            subscription.status === 'PENDING_VALIDATION' ? 'bg-yellow-50 border-yellow-200' :
            'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  {subscription.status === 'ACTIVE' && '✅ Abonnement Actif'}
                  {subscription.status === 'TRIAL' && '🎁 Période d\'essai'}
                  {subscription.status === 'TRIAL_EXPIRED' && '⏱️ Essai expiré'}
                  {subscription.status === 'PENDING_VALIDATION' && '⏳ En attente de validation'}
                  {subscription.status === 'EXPIRED' && '❌ Abonnement expiré'}
                  {subscription.status === 'REJECTED' && '⛔ Paiement rejeté'}
                </h3>
                <p className="text-2xl font-bold text-[#FF6A00]">{subscription.plan}</p>
                {subscription.status === 'ACTIVE' && subscription.expiresAt && (
                  <p className="text-sm text-gray-600 mt-1">
                    Expire le : {new Date(subscription.expiresAt).toLocaleDateString('fr-FR')}
                  </p>
                )}
                {subscription.status === 'TRIAL' && subscription.trialEndsAt && (
                  <p className="text-sm text-gray-600 mt-1">
                    Essai jusqu'au : {new Date(subscription.trialEndsAt).toLocaleDateString('fr-FR')}
                  </p>
                )}
              </div>
              <Link
                href="/provider/subscription"
                className="px-6 py-3 bg-[#FF6A00] text-white rounded-xl font-bold hover:bg-[#E55F00] transition-colors"
              >
                {subscription.status === 'ACTIVE' ? 'Améliorer' : 
                 subscription.status === 'TRIAL' ? 'Souscrire' :
                 'Gérer abonnement'}
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-[#FF6A00] to-orange-600 rounded-xl p-6 mb-6 text-white">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-xl font-bold mb-1">🎁 Essayez WookoPRO gratuitement !</h3>
                <p className="text-sm opacity-90">7 jours d'essai • Recevez des leads automatiquement</p>
              </div>
              <Link
                href="/provider/subscription"
                className="px-6 py-3 bg-white text-[#FF6A00] rounded-xl font-bold hover:bg-gray-100 transition-colors"
              >
                Découvrir
              </Link>
            </div>
          </div>
        )}

        {/* Leads Section */}
        <div className="bg-white rounded-xl border shadow-sm">
          {/* ⚡ BANNER si compte désactivé */}
          {provider?.accountStatus && provider.accountStatus !== 'ACTIVE' ? (
            <div className="p-12 text-center">
              <div className="max-w-md mx-auto">
                <div className="text-6xl mb-4">🔒</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Accès aux demandes bloqué</h3>
                <p className="text-gray-600 mb-4">
                  Votre compte étant {provider.accountStatus === 'SUSPENDED' ? 'suspendu' : 
                                      provider.accountStatus === 'INACTIVE' ? 'désactivé' : 
                                    'en attente'}, vous ne pouvez plus accéder aux demandes.
                </p>
                {provider.disabledReason && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 text-left">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Raison :</p>
                    <p className="text-sm text-gray-600">{provider.disabledReason}</p>
                  </div>
                )}
                <p className="text-sm text-gray-500">
                  Contactez le support au <strong className="text-[#FF6A00]">+33 7 77 36 94 62</strong>
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Demandes Reçues</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {canViewClientPhone() 
                    ? 'Contactez directement les clients'
                    : '⚠️ Abonnement requis pour voir les numéros'}
                </p>
              </div>
              <button
                onClick={() => fetchLeads(user?.id)}
                disabled={refreshing}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                {refreshing ? '⏳' : '🔄'} Actualiser
              </button>
            </div>

            {leads.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium mb-2">Aucune demande pour le moment</p>
                <p className="text-sm">Les clients qui cherchent vos services apparaîtront ici automatiquement.</p>
              </div>
            ) : (
              <div className="divide-y">
                {leads.map((lead) => (
                  <div key={lead.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(lead.status)}
                        <span className="text-xs text-gray-500">{getTimeAgo(lead.createdAt)}</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        {lead.request?.category || 'Service'}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        📍 {lead.request?.city || 'Ville non spécifiée'}
                      </p>
                      {lead.request?.description && (
                        <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                          {lead.request.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {canViewClientPhone() ? (
                    <div className="space-y-3">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs text-blue-700 mb-1">Contact client</p>
                        <p className="text-lg font-bold text-blue-900">
                          {lead.request?.clientPhone || 'Non disponible'}
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleCallClient(lead.request?.clientPhone)}
                          className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Phone className="w-5 h-5" />
                          Appeler
                        </button>
                        <button
                          onClick={() => openWhatsApp(
                            lead.request?.clientPhone, 
                            'Client',
                            lead.request?.category
                          )}
                          className="flex-1 px-4 py-3 bg-[#25D366] text-white rounded-xl font-bold hover:bg-[#20BA5A] transition-colors flex items-center justify-center gap-2"
                        >
                          <MessageCircle className="w-5 h-5" />
                          WhatsApp
                        </button>
                      </div>

                      {lead.status === 'SENT' && (
                        <p className="text-xs text-gray-500 text-center">
                          ⚡ Premier qui contacte = gagne le client
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                      <p className="text-sm text-yellow-800 font-medium mb-2">
                        🔒 Abonnement requis pour voir le numéro
                      </p>
                      <Link
                        href="/provider/subscription"
                        className="text-sm text-yellow-900 underline font-bold"
                      >
                        Activer mon abonnement →
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
            </>
          )
          }
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="font-bold text-blue-900 mb-2">💡 Comment ça marche ?</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✅ Vous recevez automatiquement les demandes qui matchent votre profil</li>
            <li>⚡ Premier arrivé, premier servi - Contactez rapidement !</li>
            <li>📞 Appelez ou envoyez un WhatsApp au client directement</li>
            <li>🎯 Quota : {subscription?.planDetails?.leadsPerDay === -1 ? 'Illimité' : `${subscription?.planDetails?.leadsPerDay || 5} leads/jour`}</li>
          </ul>
        </div>
      </main>

      {/* ⚡ Modal "Mes dernières connexions" — Lot 3c */}
      {showHistoryModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowHistoryModal(false) }}
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-start justify-between p-6 border-b">
              <div>
                <h3 className="text-xl font-bold text-gray-900">🕒 Mes dernières connexions</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Historique des 20 derniers événements de connexion (réussites & échecs).
                </p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loginHistory.length === 0 ? (
                <p className="text-center text-gray-500 py-12">Aucun historique disponible.</p>
              ) : (
                <div className="space-y-2">
                  {loginHistory.map((h) => (
                    <div
                      key={h.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        h.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="text-2xl flex-shrink-0">
                        {h.success ? '✅' : '❌'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className={`font-semibold text-sm ${h.success ? 'text-emerald-900' : 'text-red-900'}`}>
                            {h.success ? 'Connexion réussie' : `Tentative échouée${h.reason ? ' — ' + (h.reason === 'WRONG_PASSWORD' ? 'mot de passe incorrect' : h.reason === 'USER_NOT_FOUND' ? 'utilisateur introuvable' : h.reason) : ''}`}
                          </p>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {new Date(h.createdAt).toLocaleString('fr-FR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 truncate">
                          <span className="font-mono">IP: {h.ip}</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate" title={h.userAgent}>
                          {h.userAgent}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t p-4 bg-gray-50 text-center">
              <p className="text-xs text-gray-500 mb-2">
                💡 Si vous voyez une connexion suspecte, changez votre mot de passe immédiatement.
              </p>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="bg-gradient-to-r from-[#FF7A00] to-orange-500 text-white px-6 py-2 rounded-xl font-semibold shadow-md"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚡ Modal "Changer mon mot de passe" */}
      {showChangePasswordModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowChangePasswordModal(false)
              setCpSuccess(false)
              setCpError('')
            }
          }}
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">🔐 Changer mon mot de passe</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Saisissez votre mot de passe actuel et un nouveau mot de passe sécurisé.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowChangePasswordModal(false)
                  setCpSuccess(false)
                  setCpError('')
                }}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {cpSuccess ? (
              <div className="space-y-4">
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                  <p className="text-sm text-green-900 font-semibold mb-2">
                    ✅ Mot de passe modifié avec succès
                  </p>
                  <p className="text-xs text-green-800">
                    Votre session actuelle est conservée. Toutes les autres sessions actives (autres appareils ou navigateurs) ont été automatiquement déconnectées.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowChangePasswordModal(false)
                    setCpSuccess(false)
                  }}
                  className="w-full bg-gradient-to-r from-[#FF7A00] to-orange-500 text-white py-3 rounded-xl font-bold shadow-lg"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Mot de passe actuel *
                  </label>
                  <input
                    type={cpShowPwd ? 'text' : 'password'}
                    value={cpCurrent}
                    onChange={(e) => setCpCurrent(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Nouveau mot de passe *
                  </label>
                  <input
                    type={cpShowPwd ? 'text' : 'password'}
                    value={cpNew}
                    onChange={(e) => setCpNew(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00]"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Min. 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Confirmer le nouveau mot de passe *
                  </label>
                  <input
                    type={cpShowPwd ? 'text' : 'password'}
                    value={cpConfirm}
                    onChange={(e) => setCpConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF7A00]"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cpShowPwd}
                    onChange={(e) => setCpShowPwd(e.target.checked)}
                  />
                  Afficher les mots de passe
                </label>

                {cpError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    {cpError}
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                  ℹ️ Après changement, votre session actuelle reste active. Toutes les autres sessions actives seront automatiquement déconnectées.
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChangePasswordModal(false)}
                    className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={cpLoading}
                    className="flex-1 bg-gradient-to-r from-[#FF7A00] to-orange-500 text-white py-3 rounded-xl font-bold shadow-lg disabled:opacity-50"
                  >
                    {cpLoading ? '⏳ Modification...' : 'Modifier'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
