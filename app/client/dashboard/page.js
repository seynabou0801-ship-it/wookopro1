'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { openWhatsApp, getDefaultWhatsAppNumber } from '@/lib/whatsapp'

export default function ClientDashboard() {
  const router = useRouter()
  const phone = getDefaultWhatsAppNumber()
  const [user, setUser] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedUser = localStorage.getItem('wooleen_user')
    if (!storedUser) {
      router.push('/login')
      return
    }
    const userData = JSON.parse(storedUser)
    if (userData.role !== 'CLIENT') {
      router.push('/login')
      return
    }
    setUser(userData)
    fetchRequests(userData.id)
  }, [])

  const fetchRequests = async (clientId) => {
    try {
      const res = await fetch('/api/requests')
      if (res.ok) {
        const data = await res.json()
        const myRequests = data.filter(r => r.clientId === clientId)
        setRequests(myRequests)
      }
    } catch (error) {
      console.error('Error fetching requests:', error)
    }
    setLoading(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('wooleen_token')
    localStorage.removeItem('wooleen_user')
    router.push('/')
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
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Wooleen</h1>
            <p className="text-sm text-gray-500">Espace Client</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name || user?.phone}</span>
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
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Total demandes</p>
            <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">En cours</p>
            <p className="text-2xl font-bold text-blue-600">
              {requests.filter(r => r.status === 'MATCHING').length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Assignées</p>
            <p className="text-2xl font-bold text-green-600">
              {requests.filter(r => r.status === 'ASSIGNED').length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Terminées</p>
            <p className="text-2xl font-bold text-emerald-600">
              {requests.filter(r => r.status === 'COMPLETED').length}
            </p>
          </div>
        </div>

        {/* CTA WhatsApp */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-green-800">Nouvelle demande ?</h2>
          <p className="text-green-700 mt-1">Décrivez votre besoin sur WhatsApp</p>
          <button
            onClick={() => openWhatsApp(phone, "Bonjour Wooleen")}
            className="mt-4 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
          >
            💬 Envoyer sur WhatsApp
          </button>
        </div>

        {/* Requests List */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Mes demandes</h2>
          </div>
          
          {requests.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>Aucune demande pour le moment</p>
              <p className="text-sm mt-2">Envoyez votre première demande sur WhatsApp</p>
            </div>
          ) : (
            <div className="divide-y">
              {requests.map((req) => (
                <div key={req.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 capitalize">{req.serviceCategory}</h3>
                      <p className="text-sm text-gray-600 mt-1">{req.normalizedText || req.rawMessage}</p>
                      <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                        <span>📍 {req.zone || req.city}</span>
                        <span>⚡ {req.urgency}</span>
                        <span>{req.matches?.length || 0} prestataire(s)</span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(req.status)}`}>
                      {req.status}
                    </span>
                  </div>
                  {req.status === 'ASSIGNED' && req.assignedProviderId && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-800">✅ Un prestataire a accepté votre demande</p>
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
