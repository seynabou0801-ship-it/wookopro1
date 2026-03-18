'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SecureAdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState(null)
  const [providers, setProviders] = useState([])
  const [requests, setRequests] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedUser = localStorage.getItem('wooleen_user')
    if (!storedUser) {
      router.push('/login')
      return
    }
    const userData = JSON.parse(storedUser)
    if (userData.role !== 'ADMIN') {
      router.push('/login')
      return
    }
    setUser(userData)
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [statsRes, providersRes, requestsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/providers'),
        fetch('/api/requests')
      ])
      
      if (statsRes.ok) setStats(await statsRes.json())
      if (providersRes.ok) setProviders(await providersRes.json())
      if (requestsRes.ok) setRequests(await requestsRes.json())
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
      MATCHING: 'bg-blue-100 text-blue-800',
      ASSIGNED: 'bg-green-100 text-green-800',
      COMPLETED: 'bg-emerald-100 text-emerald-800',
      CANCELLED: 'bg-red-100 text-red-800'
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
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Wooleen Admin</h1>
            <p className="text-sm text-gray-500">Tableau de bord</p>
          </div>
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
            <p className="text-2xl font-bold text-green-600">{stats?.activeProviders || 0}</p>
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
        <div className="flex gap-2 mb-6">
          {['overview', 'providers', 'requests'].map((tab) => (
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
              {tab === 'requests' && `Demandes (${requests.length})`}
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
                        p.isAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
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
                          p.isAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {p.isAvailable ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Service</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Description</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Localisation</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Urgence</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Matchs</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium capitalize">{r.serviceCategory}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm max-w-xs truncate">
                        {r.normalizedText || r.rawMessage}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.zone || r.city}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{r.urgency}</td>
                      <td className="px-4 py-3 text-gray-600">{r.matches?.length || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
