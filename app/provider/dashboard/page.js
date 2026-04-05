'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProviderDashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [provider, setProvider] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // ⚡ NOUVEAU : States pour le modal de paiement
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [paymentProcessing, setPaymentProcessing] = useState(false)

  useEffect(() => {
    const storedUser = localStorage.getItem('wooleen_user')
    if (!storedUser) {
      router.push('/login')
      return
    }
    const userData = JSON.parse(storedUser)
    if (userData.role !== 'PROVIDER') {
      router.push('/login')
      return
    }
    setUser(userData)
    fetchProviderData(userData.id)
  }, [])

  const fetchProviderData = async (userId) => {
    try {
      // Get providers to find this user's provider profile
      const res = await fetch('/api/providers')
      if (res.ok) {
        const providers = await res.json()
        const myProvider = providers.find(p => p.userId === userId)
        if (myProvider) {
          setProvider(myProvider)
          // Fetch dashboard data
          const dashRes = await fetch(`/api/provider/dashboard/${myProvider.id}`)
          if (dashRes.ok) {
            setDashboard(await dashRes.json())
          }
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
    setLoading(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('wooleen_token')
    localStorage.removeItem('wooleen_user')
    router.push('/')
  }

  const toggleAvailability = async () => {
    if (!provider) return
    try {
      const res = await fetch(`/api/provider/${provider.id}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !provider.isAvailable })
      })
      if (res.ok) {
        setProvider(prev => ({ ...prev, isAvailable: !prev.isAvailable }))
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const respondToLead = async (matchId, response) => {
    if (!provider) return
    
    const isAccept = response.toLowerCase().includes('accept')
    
    // ⚡ NOUVEAU : Si c'est une acceptation, montrer le modal de paiement d'abord
    if (isAccept) {
      setSelectedMatch(matchId)
      setShowPaymentModal(true)
      return
    }
    
    // Pour les refus, procéder normalement
    try {
      const res = await fetch(`/api/provider/${provider.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, response })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        alert('✅ Demande refusée.')
        
        // Refresh dashboard
        const dashRes = await fetch(`/api/provider/dashboard/${provider.id}`)
        if (dashRes.ok) {
          setDashboard(await dashRes.json())
        }
      } else {
        alert('❌ Erreur : ' + (data.error || 'Impossible de traiter la demande'))
      }
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Erreur de connexion. Veuillez réessayer.')
    }
  }

  // ⚡ Fonction pour confirmer le paiement manuel
  const confirmManualPayment = async () => {
    if (!selectedMatch || !provider) return
    
    setPaymentProcessing(true)
    
    try {
      // Envoyer la confirmation avec flag paymentConfirmed
      const res = await fetch(`/api/provider/${provider.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          matchId: selectedMatch, 
          response: 'ACCEPTED',
          paymentConfirmed: true  // Indique que le prestataire a confirmé le paiement
        })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        alert('✅ Paiement enregistré ! Votre demande est en attente de vérification. Vous serez notifié une fois validée.')
        setShowPaymentModal(false)
        setSelectedMatch(null)
        
        // Refresh dashboard
        const dashRes = await fetch(`/api/provider/dashboard/${provider.id}`)
        if (dashRes.ok) {
          setDashboard(await dashRes.json())
        }
      } else {
        alert('❌ Erreur : ' + (data.error || data.message || 'Impossible de traiter la demande'))
      }
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Erreur de connexion. Veuillez réessayer.')
    }
    
    setPaymentProcessing(false)
  }

  const getStatusColor = (status) => {
    const colors = {
      SENT: 'bg-blue-100 text-blue-800',
      ACCEPTED: 'bg-orange-100 text-orange-800',
      DECLINED: 'bg-red-100 text-red-800',
      PAYMENT_PENDING: 'bg-yellow-100 text-yellow-800'  // Nouveau statut
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getStatusLabel = (status) => {
    const labels = {
      SENT: 'Envoyé',
      ACCEPTED: 'Accepté',
      DECLINED: 'Refusé',
      PAYMENT_PENDING: 'Paiement en attente'  // Nouveau label
    }
    return labels[status] || status
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">WookoPRO</h1>
            <p className="text-sm text-gray-500">Espace Prestataire</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{provider?.businessName}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Provider Info */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{provider?.businessName}</h2>
              <p className="text-gray-600">{provider?.serviceCategory} • {provider?.city}</p>
              <p className="text-sm text-gray-500 mt-1">Zones: {provider?.zones?.join(', ')}</p>
            </div>
            <div className="text-right">
              <button
                onClick={toggleAvailability}
                className={`px-4 py-2 rounded-lg font-medium ${
                  provider?.isAvailable
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {provider?.isAvailable ? '✅ Disponible' : '❌ Indisponible'}
              </button>
              <p className="text-sm text-gray-500 mt-2">⭐ {provider?.rating?.toFixed(1)}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Total leads</p>
            <p className="text-2xl font-bold text-gray-900">{dashboard?.stats?.totalLeads || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">En attente</p>
            <p className="text-2xl font-bold text-orange-600">{dashboard?.stats?.pending || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Acceptés</p>
            <p className="text-2xl font-bold text-orange-600">{dashboard?.stats?.accepted || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Refusés</p>
            <p className="text-2xl font-bold text-red-600">{dashboard?.stats?.declined || 0}</p>
          </div>
        </div>

        {/* Leads List */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Mes demandes</h2>
            <p className="text-sm text-gray-500">Gérez vos demandes de services</p>
          </div>
          
          {!dashboard?.matches?.length ? (
            <div className="p-8 text-center text-gray-500">
              <p>Aucune demande pour le moment</p>
              <p className="text-sm mt-2">Les nouvelles demandes apparaîtront ici</p>
            </div>
          ) : (
            <div className="divide-y">
              {dashboard.matches.map((match) => (
                <div key={match.requestId} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 capitalize">
                          {match.request?.serviceCategory}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(match.status)}`}>
                          {getStatusLabel(match.status)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {match.request?.normalizedText || match.request?.rawMessage}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                        <span>📍 {match.request?.zone || match.request?.city}</span>
                        <span>⚡ {match.request?.urgency}</span>
                        <span>Score: {match.score}</span>
                      </div>
                    </div>
                    
                    {match.status === 'SENT' && (
                      match.request?.status === 'VALIDEE_PAR_ADMIN' ? (
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => respondToLead(match.id, 'accept')}
                            className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700"
                          >
                            ✓ Accepter
                          </button>
                          <button
                            onClick={() => respondToLead(match.id, 'decline')}
                            className="px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
                          >
                            ✗ Refuser
                          </button>
                        </div>
                      ) : (
                        <div className="ml-4 px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
                          ⏳ En attente de validation admin
                        </div>
                      )
                    )}
                  </div>
                  
                  {/* Message pour paiement en attente */}
                  {match.status === 'PAYMENT_PENDING' && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800 font-medium">
                        ⏳ Paiement en cours de vérification (24-48h)
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Les coordonnées seront débloquées après validation
                      </p>
                    </div>
                  )}
                  
                  {/* Coordonnées visibles uniquement si ACCEPTÉ */}
                  {match.status === 'ACCEPTED' && match.request?.clientPhone && (
                    <div className="mt-3 p-3 bg-orange-50 rounded-lg">
                      <p className="text-sm text-orange-800">📞 Contact client: {match.request.clientPhone}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ⚡ MODAL DE PAIEMENT MANUEL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">💰 Paiement requis</h3>
            
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-5 mb-6">
              <p className="text-gray-800 text-lg font-semibold mb-3">
                Envoyez 500 FCFA via :
              </p>
              
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-3 bg-white p-3 rounded-lg">
                  <span className="text-2xl">📱</span>
                  <div>
                    <p className="text-sm text-gray-600">Wave / Orange Money</p>
                    <p className="text-xl font-bold text-gray-900">77 338 90 95</p>
                  </div>
                </div>
              </div>

              <div className="bg-orange-100 rounded-lg p-3">
                <p className="text-sm text-orange-900 font-medium">
                  ⚠️ Important : Conservez votre preuve de paiement
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-6 text-sm text-gray-600">
              <p>• Après paiement, cliquez sur "J'ai payé"</p>
              <p>• Votre demande sera vérifiée sous 24h</p>
              <p>• Les coordonnées seront débloquées après validation</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPaymentModal(false)
                  setSelectedMatch(null)
                }}
                disabled={paymentProcessing}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Annuler
              </button>
              <button
                onClick={confirmManualPayment}
                disabled={paymentProcessing}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all"
              >
                {paymentProcessing ? '⏳ Envoi...' : '✅ J\'ai payé'}
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center mt-4">
              Paiement manuel • Vérification sous 24h
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
