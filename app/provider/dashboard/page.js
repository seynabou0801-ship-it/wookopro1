'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProviderDashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [provider, setProvider] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)

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

  const respondToLead = async (requestId, response) => {
    if (!provider) return
    try {
      const res = await fetch(`/api/provider/${provider.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: requestId, response })
      })
      if (res.ok) {
        // Refresh dashboard
        const dashRes = await fetch(`/api/provider/dashboard/${provider.id}`)
        if (dashRes.ok) {
          setDashboard(await dashRes.json())
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      SENT: 'bg-blue-100 text-blue-800',
      ACCEPTED: 'bg-orange-100 text-orange-800',
      DECLINED: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
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
            <h1 className="text-xl font-bold text-gray-900">Wooko</h1>
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
            <p className="text-sm text-gray-500">Répondez OUI pour accepter ou NON pour refuser</p>
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
                          {match.status}
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
                            onClick={() => respondToLead(match.requestId, 'accept')}
                            className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700"
                          >
                            ✓ Accepter
                          </button>
                          <button
                            onClick={() => respondToLead(match.requestId, 'decline')}
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
    </div>
  )
}
