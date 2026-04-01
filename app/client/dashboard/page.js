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
  const [showNewRequestForm, setShowNewRequestForm] = useState(false)
  const [formData, setFormData] = useState({
    serviceCategory: '',
    description: ''
  })
  const [submitting, setSubmitting] = useState(false)

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

  const handleCreateRequest = async (e) => {
    e.preventDefault()
    if (!formData.serviceCategory || !formData.description) {
      alert('Veuillez remplir tous les champs')
      return
    }

    setSubmitting(true)

    try {
      // Créer la demande en base
      const res = await fetch('/api/client/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: user.id,
          clientPhone: user.phone,
          serviceCategory: formData.serviceCategory,
          description: formData.description,
          canal: 'whatsapp'
        })
      })

      if (res.ok) {
        const data = await res.json()
        
        // Rafraîchir la liste des demandes
        await fetchRequests(user.id)
        
        // Réinitialiser le formulaire
        setFormData({ serviceCategory: '', description: '' })
        setShowNewRequestForm(false)
        
        // Ouvrir WhatsApp avec message prérempli
        const message = `Bonjour Wooko,\n\nJ'ai créé une demande de ${formData.serviceCategory}.\n\n${formData.description}\n\nMerci !`
        openWhatsApp(phone, message)
      } else {
        const error = await res.json()
        alert(error.error || 'Erreur lors de la création de la demande')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }

    setSubmitting(false)
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
      ASSIGNED: 'bg-orange-100 text-orange-800',
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
      <header className="bg-white border-b shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
          <Link href="/">
            <img 
              src="/wooko-logo.png" 
              alt="Wooko" 
              className="h-10 sm:h-14 w-auto object-contain" 
            />
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 font-medium">{user?.name || user?.phone}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-2"
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
            <p className="text-2xl font-bold text-orange-600">
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
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-orange-800">Nouvelle demande ?</h2>
          <p className="text-orange-700 mt-1">Créez une demande et nous contacterons les prestataires</p>
          <button
            onClick={() => setShowNewRequestForm(true)}
            className="mt-4 bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700"
          >
            ➕ Créer une demande
          </button>
        </div>

        {/* New Request Form Modal */}
        {showNewRequestForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewRequestForm(false)}>
            <div className="bg-white rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold">Nouvelle Demande</h2>
                <button
                  onClick={() => setShowNewRequestForm(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleCreateRequest} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type de service *
                  </label>
                  <select
                    value={formData.serviceCategory}
                    onChange={(e) => setFormData({ ...formData, serviceCategory: e.target.value })}
                    className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  >
                    <option value="">Sélectionner...</option>
                    <option value="plombier">Plomberie</option>
                    <option value="electricien">Électricité</option>
                    <option value="climatiseur">Climatisation</option>
                    <option value="menuisier">Menuiserie</option>
                    <option value="peintre">Peinture</option>
                    <option value="serrurier">Serrurerie</option>
                    <option value="nettoyage">Nettoyage</option>
                    <option value="mecanicien">Mécanique</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description de votre besoin *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Décrivez votre problème ou besoin..."
                    rows={4}
                    className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[#25D366] text-white py-3 rounded-xl font-bold hover:bg-[#20BA5A] disabled:opacity-50 shadow-md"
                >
                  {submitting ? 'Création...' : '💬 Créer et envoyer'}
                </button>

                <p className="text-xs text-gray-500 text-center">
                  Votre demande sera créée et les prestataires seront notifiés automatiquement
                </p>
              </form>
            </div>
          </div>
        )}

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
                    <div className="mt-3 p-3 bg-orange-50 rounded-lg">
                      <p className="text-sm text-orange-800">✅ Un prestataire a accepté votre demande</p>
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
