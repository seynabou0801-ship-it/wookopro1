'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SecureAdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState(null)
  const [providers, setProviders] = useState([])
  const [requests, setRequests] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [showProviderModal, setShowProviderModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  
  // ⚡ NOUVEAU : State pour les paiements en attente
  const [pendingPayments, setPendingPayments] = useState([])
  
  // ⚡ NOUVEAU : State pour les inscriptions en attente
  const [pendingProviders, setPendingProviders] = useState([])
  
  // ⚡ NOUVEAU : State pour les abonnements
  const [subscriptions, setSubscriptions] = useState([])
  const [pendingSubscriptions, setPendingSubscriptions] = useState([])

  useEffect(() => {
    const storedUser = localStorage.getItem('wooleen_user')
    if (!storedUser) {
      router.push('/secure-wooleen-admin/login')
      return
    }
    const userData = JSON.parse(storedUser)
    if (userData.role !== 'ADMIN') {
      router.push('/secure-wooleen-admin/login')
      return
    }
    setUser(userData)
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [statsRes, providersRes, requestsRes, paymentsRes, pendingRes, subsRes, pendingSubsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/providers'),
        fetch('/api/requests'),
        fetch('/api/admin/payments/pending'),  
        fetch('/api/admin/providers/pending'),  // ⚡ NOUVEAU
        fetch('/api/admin/subscriptions/all'),  // ⚡ NOUVEAU
        fetch('/api/admin/subscriptions/pending')  // ⚡ NOUVEAU
      ])
      
      if (statsRes.ok) setStats(await statsRes.json())
      if (providersRes.ok) setProviders(await providersRes.json())
      if (requestsRes.ok) setRequests(await requestsRes.json())
      if (paymentsRes.ok) setPendingPayments(await paymentsRes.json())
      if (pendingRes.ok) setPendingProviders(await pendingRes.json())  // ⚡ NOUVEAU
      if (subsRes.ok) {
        const data = await subsRes.json()
        setSubscriptions(data.subscriptions || [])
      }
      if (pendingSubsRes.ok) {
        const data = await pendingSubsRes.json()
        setPendingSubscriptions(data.subscriptions || [])
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

  const seedDatabase = async () => {
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      if (res.ok) {
        fetchData()
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      EN_ATTENTE_VALIDATION_ADMIN: 'bg-orange-100 text-orange-800',
      VALIDEE_PAR_ADMIN: 'bg-blue-100 text-blue-800',
      REJETEE_PAR_ADMIN: 'bg-red-100 text-red-800',
      MATCHING: 'bg-blue-100 text-blue-800',
      ASSIGNED: 'bg-orange-100 text-orange-800',
      COMPLETED: 'bg-emerald-100 text-emerald-800',
      CANCELLED: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const handleValidateRequest = async (requestId) => {
    if (!confirm('Valider cette demande ?')) return
    
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/validate`, {
        method: 'POST'
      })
      
      if (res.ok) {
        alert('Demande validée ! Les prestataires ont été notifiés.')
        await fetchData()
        setShowRequestModal(false)
      } else {
        const error = await res.json()
        alert(error.error || 'Erreur lors de la validation')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
  }

  const handleRejectRequest = async (requestId) => {
    if (!confirm('Rejeter cette demande ? Le client sera notifié.')) return
    
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/reject`, {
        method: 'POST'
      })
      
      if (res.ok) {
        alert('Demande rejetée.')
        await fetchData()
        setShowRequestModal(false)
      } else {
        const error = await res.json()
        alert(error.error || 'Erreur lors du rejet')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
  }

  // ⚡ NOUVEAU : Valider un paiement manuel
  const handleValidatePayment = async (paymentId) => {
    if (!confirm('Confirmer la validation de ce paiement ?')) return
    
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/payment/${paymentId}/validate`, {
        method: 'POST'
      })
      
      if (res.ok) {
        alert('✅ Paiement validé ! Les coordonnées ont été débloquées pour le prestataire.')
        await fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Erreur lors de la validation')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
  }

  // ⚡ NOUVEAU : Valider une inscription prestataire
  const handleValidateProvider = async (userId) => {
    if (!confirm('Valider cette inscription prestataire ?')) return
    
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/provider/${userId}/validate`, {
        method: 'POST'
      })
      
      if (res.ok) {
        alert('✅ Prestataire validé ! Le compte est maintenant actif.')
        await fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Erreur lors de la validation')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
  }

  // ⚡ NOUVEAU : Rejeter une inscription prestataire
  const handleRejectProvider = async (userId) => {
    if (!confirm('Rejeter cette inscription prestataire ? Cette action est irréversible.')) return
    
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/provider/${userId}/reject`, {
        method: 'POST'
      })
      
      if (res.ok) {
        alert('✅ Prestataire rejeté.')
        await fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Erreur lors du rejet')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
  }

  // ⚡ NOUVEAU : Valider un abonnement
  const handleValidateSubscription = async (subscriptionId) => {
    if (!confirm('Valider ce paiement d\'abonnement ?')) return
    
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/subscriptions/${subscriptionId}/validate`, {
        method: 'POST'
      })
      
      if (res.ok) {
        alert('✅ Abonnement validé et activé !')
        await fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Erreur lors de la validation')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
  }

  // ⚡ NOUVEAU : Rejeter un abonnement
  const handleRejectSubscription = async (subscriptionId) => {
    const reason = prompt('Raison du rejet (optionnel):')
    if (reason === null) return // Annulé
    
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/subscriptions/${subscriptionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      
      if (res.ok) {
        alert('✅ Paiement rejeté. Prestataire notifié.')
        await fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Erreur lors du rejet')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
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
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex flex-col">
            <h1 className="text-2xl font-bold">
              <span className="text-[#0B2A4A]">WOOKO</span><span className="text-[#FF6A00]">PRO</span>
            </h1>
            <p className="text-xs text-[#0B2A4A] max-w-xs leading-tight">
              La première plateforme de services 100% WhatsApp au Sénégal
            </p>
            <p className="text-xs text-[#0B2A4A] font-semibold">
              Besoin d'un pro ?
            </p>
            <p className="text-xs font-bold">
              <span className="text-[#0B2A4A]">Wooko</span><span className="text-[#FF6A00]">PRO !</span>
            </p>
          </Link>
          <div className="flex items-center gap-4">
            <button
              onClick={seedDatabase}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              🔄 Seed DB
            </button>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              ↻ Actualiser
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Prestataires</p>
            <p className="text-2xl font-bold text-gray-900">{stats?.providers || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Actifs</p>
            <p className="text-2xl font-bold text-orange-600">{stats?.activeProviders || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Demandes</p>
            <p className="text-2xl font-bold text-blue-600">{stats?.requests || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Matchings</p>
            <p className="text-2xl font-bold text-purple-600">{stats?.matches || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">En attente</p>
            <p className="text-2xl font-bold text-orange-600">{stats?.pendingMatches || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Acceptés</p>
            <p className="text-2xl font-bold text-emerald-600">{stats?.acceptedMatches || 0}</p>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-8">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-500">IA: <span className="font-medium text-gray-900">{stats?.aiStatus}</span></span>
            <span className="text-gray-500">WhatsApp: <span className="font-medium text-gray-900">{stats?.whatsappStatus}</span></span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['overview', 'providers', 'monitoring', 'inscriptions', 'payments', 'abonnements'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                activeTab === tab
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab === 'overview' && 'Vue d\'ensemble'}
              {tab === 'providers' && `Prestataires (${providers.length})`}
              {tab === 'monitoring' && `Monitoring (${requests.length})`}
              {tab === 'inscriptions' && `Inscriptions en attente (${pendingProviders.length})`}
              {tab === 'payments' && `Paiements en attente (${pendingPayments.length})`}
              {tab === 'abonnements' && `Abonnements (${subscriptions.length})`}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-4 border-b">
                <h2 className="font-semibold">Dernières demandes</h2>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {requests.slice(0, 5).map((req) => (
                  <div key={req.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{req.serviceCategory}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(req.status)}`}>
                        {req.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{req.city} • {req.matches?.length || 0} match(es)</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-4 border-b">
                <h2 className="font-semibold">Prestataires</h2>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {providers.slice(0, 5).map((p) => (
                  <div key={p.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.businessName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        p.isAvailable ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {p.isAvailable ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{p.serviceCategory} • {p.city}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === 'providers' && (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Nom</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Catégorie</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Ville</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Zones</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Note</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Statut</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {providers.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium">{p.businessName}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{p.serviceCategory}</td>
                      <td className="px-4 py-3 text-gray-600">{p.city}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{p.zones?.join(', ')}</td>
                      <td className="px-4 py-3 text-gray-600">⭐ {p.rating?.toFixed(1)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          p.isAvailable ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {p.isAvailable ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setSelectedProvider(p)
                            setShowProviderModal(true)
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          👁️ Détails
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Requests Tab */}
        {/* Monitoring Tab - Lecture seule */}
        {activeTab === 'monitoring' && (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">📊 Monitoring des Demandes</h3>
              <p className="text-sm text-gray-500 mt-1">
                Vue d'ensemble en lecture seule • Dispatch automatique activé
              </p>
            </div>

            {requests.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>Aucune demande pour le moment</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Service</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Client</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Ville</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Statut</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Dispatché à</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {requests.slice(0, 50).map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium capitalize">{r.serviceCategory || r.category}</td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-sm">
                          {r.clientPhone || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.city || r.zone}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            r.status === 'DISPATCHED' ? 'bg-blue-100 text-blue-800' :
                            r.status === 'IN_PROGRESS' ? 'bg-green-100 text-green-800' :
                            r.status === 'COMPLETED' ? 'bg-gray-100 text-gray-800' :
                            r.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {r.dispatchedTo?.length || 0} prestataires
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ⚡ Inscriptions Tab - NOUVEAU */}
        {activeTab === 'inscriptions' && (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">Inscriptions prestataires en attente</h3>
              <p className="text-sm text-gray-500 mt-1">Validez ou rejetez les demandes d'inscription</p>
            </div>

            {pendingProviders.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>✅ Aucune inscription en attente</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Prestataire</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Service</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Ville</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Date demande</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pendingProviders.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{user.provider?.businessName || user.name || 'N/A'}</p>
                            <p className="text-sm text-gray-500">{user.phone}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium capitalize">
                            {user.provider?.serviceCategory || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {user.city || user.provider?.city || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(user.createdAt).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleValidateProvider(user.id)}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              ✅ Valider
                            </button>
                            <button
                              onClick={() => handleRejectProvider(user.id)}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              ❌ Rejeter
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ⚡ Payments Tab - NOUVEAU */}
        {activeTab === 'payments' && (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">Paiements en attente de validation</h3>
              <p className="text-sm text-gray-500 mt-1">Validez les paiements manuels effectués par les prestataires</p>
            </div>

            {pendingPayments.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>✅ Aucun paiement en attente</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Prestataire</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Service demandé</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Montant</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pendingPayments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{payment.provider?.businessName || 'N/A'}</p>
                            <p className="text-sm text-gray-500">{payment.provider?.whatsappNumber || 'N/A'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900 capitalize">{payment.request?.serviceCategory || 'N/A'}</p>
                            <p className="text-sm text-gray-500 truncate max-w-xs">{payment.request?.normalizedText || payment.request?.rawMessage || 'N/A'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-orange-600">{payment.amount} {payment.currency}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(payment.confirmedByProviderAt || payment.createdAt).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleValidatePayment(payment.id)}
                            disabled={actionLoading}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {actionLoading ? '⏳' : '✅ Valider paiement'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ⚡ Abonnements Tab - NOUVEAU */}
        {activeTab === 'abonnements' && (
          <div className="space-y-6">
            {/* En attente de validation */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-gray-900">Paiements en attente de validation</h3>
                <p className="text-sm text-gray-500 mt-1">Validez les preuves de paiement uploadées par les prestataires</p>
              </div>

              {pendingSubscriptions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>✅ Aucun paiement en attente</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Prestataire</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Formule</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Montant</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Méthode</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Preuve</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pendingSubscriptions.map((sub) => (
                        <tr key={sub.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{sub.providerName}</p>
                              <p className="text-sm text-gray-500">{sub.providerPhone}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-[#FF6A00]">{sub.plan}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-gray-900">{sub.planDetails.price.toLocaleString()} FCFA</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600 capitalize">{sub.paymentMethod?.replace('_', ' ')}</span>
                          </td>
                          <td className="px-4 py-3">
                            {sub.paymentProof && (
                              <a 
                                href={sub.paymentProof} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 text-sm underline"
                              >
                                Voir preuve
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleValidateSubscription(sub.id)}
                                disabled={actionLoading}
                                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                              >
                                ✅ Valider
                              </button>
                              <button
                                onClick={() => handleRejectSubscription(sub.id)}
                                disabled={actionLoading}
                                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                              >
                                ❌ Rejeter
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Tous les abonnements */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-gray-900">Tous les abonnements</h3>
                <p className="text-sm text-gray-500 mt-1">Vue d'ensemble des abonnements prestataires</p>
              </div>

              {subscriptions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>Aucun abonnement pour le moment</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Prestataire</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Formule</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Statut</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Expire le</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Leads/mois</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {subscriptions.map((sub) => (
                        <tr key={sub.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{sub.providerName}</p>
                              <p className="text-sm text-gray-500">{sub.providerPhone}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-[#FF6A00]">{sub.plan}</span>
                            <p className="text-xs text-gray-500">{sub.planDetails.price.toLocaleString()} FCFA/mois</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              sub.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                              sub.status === 'TRIAL' ? 'bg-blue-100 text-blue-800' :
                              sub.status === 'PENDING_VALIDATION' ? 'bg-yellow-100 text-yellow-800' :
                              sub.status === 'EXPIRED' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {sub.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('fr-FR') : 
                             sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString('fr-FR') + ' (essai)' :
                             '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {sub.leadsReceivedThisMonth || 0} / {sub.planDetails.leadsPerDay === -1 ? '∞' : sub.planDetails.leadsPerDay * 30}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Provider Details Modal */}
      {showProviderModal && selectedProvider && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowProviderModal(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Détails du Prestataire</h2>
              <button
                onClick={() => setShowProviderModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Informations générales */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Informations Générales</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🏢</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Nom commercial</p>
                      <p className="font-semibold text-gray-900">{selectedProvider.businessName}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🔧</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Catégorie</p>
                      <p className="font-semibold text-gray-900 capitalize">{selectedProvider.serviceCategory}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📝</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Description</p>
                      <p className="text-gray-900">{selectedProvider.description || 'Aucune description'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coordonnées */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Coordonnées</h3>
                <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📱</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Téléphone WhatsApp</p>
                      <p className="font-semibold text-blue-900">{selectedProvider.whatsappNumber || 'Non renseigné'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📧</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-semibold text-blue-900">{selectedProvider.email || 'Non renseigné'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📍</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Adresse</p>
                      <p className="font-semibold text-blue-900">{selectedProvider.address || 'Non renseignée'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Localisation */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Localisation & Zones</h3>
                <div className="bg-orange-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🌍</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Ville principale</p>
                      <p className="font-semibold text-green-900">{selectedProvider.city}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📍</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Zones couvertes</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedProvider.zones?.length > 0 ? (
                          selectedProvider.zones.map((zone, idx) => (
                            <span key={idx} className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">
                              {zone}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-500 text-sm">Aucune zone définie</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Performance & Statut</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-purple-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">⭐</span>
                      <p className="text-sm text-gray-500">Note moyenne</p>
                    </div>
                    <p className="text-2xl font-bold text-purple-900">{selectedProvider.rating?.toFixed(1) || '0.0'}</p>
                  </div>

                  <div className="bg-orange-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">📊</span>
                      <p className="text-sm text-gray-500">Taux de réponse</p>
                    </div>
                    <p className="text-2xl font-bold text-orange-900">{selectedProvider.responseRate || 0}%</p>
                  </div>

                  <div className="bg-indigo-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">💎</span>
                      <p className="text-sm text-gray-500">Abonnement</p>
                    </div>
                    <p className="text-lg font-bold text-indigo-900 capitalize">{selectedProvider.tier || 'free'}</p>
                  </div>

                  <div className="bg-emerald-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{selectedProvider.isAvailable ? '✅' : '🚫'}</span>
                      <p className="text-sm text-gray-500">Disponibilité</p>
                    </div>
                    <p className="text-lg font-bold text-emerald-900">
                      {selectedProvider.isAvailable ? 'Actif' : 'Inactif'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Vérification */}
              {selectedProvider.isVerified && (
                <div className="bg-blue-100 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                  <span className="text-2xl">✓</span>
                  <div>
                    <p className="font-semibold text-blue-900">Prestataire vérifié</p>
                    <p className="text-sm text-blue-700">Ce prestataire a été vérifié par l'équipe WookoPRO</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t bg-gray-50">
              <button
                onClick={() => setShowProviderModal(false)}
                className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-800"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Details Modal */}
      {showRequestModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowRequestModal(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Détails de la Demande</h2>
              <button
                onClick={() => setShowRequestModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Informations du service */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Service Demandé</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🔧</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Catégorie</p>
                      <p className="font-semibold text-gray-900 capitalize">{selectedRequest.serviceCategory}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📝</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Description</p>
                      <p className="text-gray-900">{selectedRequest.normalizedText || selectedRequest.rawMessage || 'Aucune description'}</p>
                    </div>
                  </div>

                  {selectedRequest.rawMessage && selectedRequest.normalizedText && (
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">💬</span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-500">Message original</p>
                        <p className="text-gray-700 text-sm italic">{selectedRequest.rawMessage}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Informations client */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Informations Client</h3>
                <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📱</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Téléphone WhatsApp</p>
                      {selectedRequest.clientPhone ? (
                        <p className="font-semibold text-blue-900 font-mono text-lg">{selectedRequest.clientPhone}</p>
                      ) : (
                        <p className="text-gray-400 italic">Non renseigné</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📡</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Source</p>
                      <p className="text-blue-900 capitalize">{selectedRequest.source || 'whatsapp'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Localisation */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Localisation</h3>
                <div className="bg-orange-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🌍</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">Ville</p>
                      <p className="font-semibold text-green-900">{selectedRequest.city || 'Non spécifiée'}</p>
                    </div>
                  </div>

                  {selectedRequest.zone && (
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">📍</span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-500">Zone</p>
                        <p className="font-semibold text-green-900">{selectedRequest.zone}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Statut & Urgence */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Statut & Priorité</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-orange-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">⚡</span>
                      <p className="text-sm text-gray-500">Urgence</p>
                    </div>
                    <p className="text-lg font-bold text-orange-900 capitalize">{selectedRequest.urgency || 'normale'}</p>
                  </div>

                  <div className="bg-purple-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">📊</span>
                      <p className="text-sm text-gray-500">Statut</p>
                    </div>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(selectedRequest.status)}`}>
                      {selectedRequest.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Matches */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Prestataires Contactés</h3>
                <div className="bg-indigo-50 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">🤝</span>
                    <div>
                      <p className="text-sm text-gray-500">Nombre de matches</p>
                      <p className="text-2xl font-bold text-indigo-900">{selectedRequest.matches?.length || 0}</p>
                    </div>
                  </div>
                  
                  {selectedRequest.matches?.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <p className="text-xs font-medium text-gray-500 uppercase">Liste des prestataires :</p>
                      {selectedRequest.matches.map((match, idx) => (
                        <div key={idx} className="bg-white rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{match.providerName || `Provider ${idx + 1}`}</p>
                            <p className="text-xs text-gray-500">Score: {match.score} • {match.reason}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            match.status === 'ACCEPTED' ? 'bg-orange-100 text-orange-800' :
                            match.status === 'DECLINED' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {match.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Métadonnées */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Informations Système</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">ID Demande:</span>
                    <span className="font-mono text-xs text-gray-700">{selectedRequest.id?.substring(0, 8)}...</span>
                  </div>
                  {selectedRequest.aiSource && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Source IA:</span>
                      <span className="text-gray-900 capitalize">{selectedRequest.aiSource}</span>
                    </div>
                  )}
                  {selectedRequest.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Créée le:</span>
                      <span className="text-gray-900">{new Date(selectedRequest.createdAt).toLocaleString('fr-FR')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t bg-gray-50">
              {selectedRequest.status === 'EN_ATTENTE_VALIDATION_ADMIN' ? (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleValidateRequest(selectedRequest.id)}
                      disabled={actionLoading}
                      className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50"
                    >
                      {actionLoading ? 'En cours...' : '✓ ACCEPTER'}
                    </button>
                    <button
                      onClick={() => handleRejectRequest(selectedRequest.id)}
                      disabled={actionLoading}
                      className="flex-1 bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50"
                    >
                      {actionLoading ? 'En cours...' : '✗ REJETER'}
                    </button>
                  </div>
                  <button
                    onClick={() => setShowRequestModal(false)}
                    className="w-full bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-300"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-center text-gray-600 mb-2">
                    Statut: <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedRequest.status)}`}>
                      {selectedRequest.status}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowRequestModal(false)}
                    className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-800"
                  >
                    Fermer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
