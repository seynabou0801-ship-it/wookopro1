'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  EMPTY_ANALYTICS,
  formatCurrency,
  formatNumber,
  formatPercentage
} from './analytics-mock-data'
import { useAuthSessionGuard } from '@/lib/use-auth-session-guard'

// Slug → label lisible pour l'affichage des professionnels dans l'admin
const PROFESSIONAL_LABELS = {
  plombier: 'Plombier',
  electricien: 'Électricien',
  climatiseur: 'Frigoriste',
  macon: 'Maçon',
  tapissier: 'Tapissier',
  menuisier: 'Menuisier',
  peintre: 'Peintre',
  serrurier: 'Serrurier',
  nettoyage: 'Agent de nettoyage',
  mecanicien: 'Mécanicien automobile',
  architecte: 'Architecte',
  'technicien-batiment': 'Technicien du bâtiment',
  'entrepreneur-batiment': 'Entrepreneur du bâtiment',
  demenagement: 'Déménagement',
  technicien: 'Technicien',
  autre: 'Autre professionnel'
}
const labelPro = (slug) => PROFESSIONAL_LABELS[slug] || (slug || '—')

export default function SecureAdminDashboard() {
  useAuthSessionGuard()
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState(null)
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS)
  const [providers, setProviders] = useState([])
  const [requests, setRequests] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [showProviderModal, setShowProviderModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [seedLoading, setSeedLoading] = useState(false)
  const [seedToast, setSeedToast] = useState(null) // { type: 'success'|'error', message: string }
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notifPendingCount, setNotifPendingCount] = useState(0)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  
  // ⚡ NOUVEAU : State pour les paiements en attente
  const [pendingPayments, setPendingPayments] = useState([])
  
  // ⚡ NOUVEAU : State pour les inscriptions en attente
  const [pendingProviders, setPendingProviders] = useState([])
  
  // ⚡ NOUVEAU : State pour les abonnements
  const [subscriptions, setSubscriptions] = useState([])
  const [pendingSubscriptions, setPendingSubscriptions] = useState([])
  
  // ⚡ NOUVEAU : State pour gestion statut prestataires
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [selectedProviderForStatus, setSelectedProviderForStatus] = useState(null)
  const [statusReason, setStatusReason] = useState('')
  
  // ⚡ NOUVEAU : State pour viewer preuve de paiement
  const [showPaymentProofModal, setShowPaymentProofModal] = useState(false)
  const [currentPaymentProof, setCurrentPaymentProof] = useState(null)

  useEffect(() => {
    const storedUser = localStorage.getItem('wooleen_user')
    const storedToken = localStorage.getItem('wooleen_token')
    if (!storedUser || !storedToken) {
      router.push('/secure-wooleen-admin/login')
      return
    }
    const userData = JSON.parse(storedUser)
    if (userData.role !== 'ADMIN') {
      router.push('/secure-wooleen-admin/login')
      return
    }

    // ✅ Patch global fetch : injecte le Bearer JWT sur tous les appels /api/*
    // (lecture & écriture). Un seul endroit à maintenir, zéro fetch oublié.
    if (typeof window !== 'undefined' && !window.__wpro_fetch_patched) {
      const originalFetch = window.fetch.bind(window)
      window.fetch = (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url || ''
        if (url.startsWith('/api/')) {
          const token = localStorage.getItem('wooleen_token')
          if (token) {
            const headers = new Headers(init.headers || {})
            if (!headers.has('Authorization')) {
              headers.set('Authorization', `Bearer ${token}`)
            }
            init = { ...init, headers }
          }
        }
        return originalFetch(input, init)
      }
      window.__wpro_fetch_patched = true
    }

    setUser(userData)
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [statsRes, analyticsRes, providersRes, requestsRes, paymentsRes, pendingRes, subsRes, pendingSubsRes, notifRes] = await Promise.all([
        fetch('/api/admin/stats', { cache: 'no-store' }),
        fetch('/api/admin/analytics', { cache: 'no-store' }),
        fetch('/api/providers', { cache: 'no-store' }),
        fetch('/api/requests', { cache: 'no-store' }),
        fetch('/api/admin/payments/pending', { cache: 'no-store' }),
        fetch('/api/admin/providers/pending', { cache: 'no-store' }),
        fetch('/api/admin/subscriptions/all', { cache: 'no-store' }),
        fetch('/api/admin/subscriptions/pending', { cache: 'no-store' }),
        fetch('/api/admin/notifications', { cache: 'no-store' })
      ])

      if (statsRes.ok) setStats(await statsRes.json())
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json())
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
      if (notifRes.ok) {
        const data = await notifRes.json()
        setNotifications(data.notifications || [])
        setNotifPendingCount(Number(data.pendingCount) || 0)
      }
    } catch (error) {
      console.error('Error:', error)
    }
    setLoading(false)
  }

  // Ouvre wa.me pré-rempli + marque la notification comme envoyée
  const handleSendNotification = async (notif) => {
    try {
      window.open(notif.targetWaUrl, '_blank', 'noopener,noreferrer')
      const r = await fetch(`/api/admin/notifications/${notif.id}/sent`, { method: 'POST' })
      if (r.ok) {
        await fetchData()
      }
    } catch (e) {
      console.error('Erreur marquage notification:', e)
    }
  }

  // Supprime une notification de la liste (clear)
  const handleDismissNotification = async (id) => {
    try {
      const r = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE' })
      if (r.ok) await fetchData()
    } catch (e) {
      console.error('Erreur suppression notification:', e)
    }
  }

  // ⚡ NOUVEAU : Génère un mot de passe temporaire pour une demande de reset
  const [resetResult, setResetResult] = useState(null) // { tempPassword, waUrl, waMessage, name, phone }
  const [resetLoadingId, setResetLoadingId] = useState(null)

  const handleResetPassword = async (notif) => {
    if (!confirm(`Confirmer la réinitialisation du mot de passe de ${notif.payload?.name || 'ce prestataire'} ?\n\nUn mot de passe temporaire sera généré et toutes ses sessions actives seront déconnectées.`)) {
      return
    }
    setResetLoadingId(notif.id)
    try {
      const token = localStorage.getItem('wooleen_token')
      const r = await fetch(`/api/admin/notifications/${notif.id}/reset-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await r.json()
      if (r.ok && data.success) {
        setResetResult({
          tempPassword: data.tempPassword,
          waUrl: data.waUrl,
          waMessage: data.waMessage,
          name: notif.payload?.name || 'Prestataire',
          phone: notif.payload?.phone
        })
        await fetchData()
      } else {
        alert('❌ ' + (data.error || 'Erreur lors de la réinitialisation'))
      }
    } catch (e) {
      console.error('Erreur reset password:', e)
      alert('❌ Erreur réseau')
    } finally {
      setResetLoadingId(null)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('wooleen_token')
    localStorage.removeItem('wooleen_user')
    router.push('/')
  }

  const seedDatabase = async () => {
    if (seedLoading) return
    setSeedLoading(true)
    setSeedToast(null)
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        // Refresh all counters & lists
        await fetchData()
        const s = data.stats || {}
        const parts = [
          `${data.seededProviders ?? s.providers ?? '—'} prestataires`,
          data.seededRequests ? `${data.seededRequests} demandes` : null,
          data.seededMatches ? `${data.seededMatches} matchings` : null
        ].filter(Boolean).join(' • ')
        setSeedToast({
          type: 'success',
          title: 'Seed terminé',
          message: `Base de données initialisée avec succès — ${parts}.`
        })
      } else {
        setSeedToast({
          type: 'error',
          title: 'Erreur',
          message: data.error || `Erreur ${res.status} lors du seed.`
        })
      }
    } catch (error) {
      console.error('Seed error:', error)
      setSeedToast({ type: 'error', title: 'Erreur', message: `Erreur réseau : ${error.message}` })
    } finally {
      setSeedLoading(false)
      // Auto-dismiss toast after 4s
      setTimeout(() => setSeedToast(null), 4000)
    }
  }

  // Reload all dashboard data (stats + lists) from the local DB
  const refreshDashboard = async () => {
    if (refreshLoading) return
    setRefreshLoading(true)
    setSeedToast(null)
    const t0 = performance.now()
    try {
      await fetchData()
      const ms = Math.round(performance.now() - t0)
      setSeedToast({
        type: 'success',
        title: 'Actualisation réussie',
        message: `Données actualisées depuis la base locale en ${ms} ms.`
      })
    } catch (error) {
      console.error('Refresh error:', error)
      setSeedToast({ type: 'error', title: 'Erreur', message: `Erreur lors de l'actualisation : ${error.message}` })
    } finally {
      setRefreshLoading(false)
      setTimeout(() => setSeedToast(null), 3000)
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

  // ⚡ NOUVEAU : Nettoyer les anciennes données
  const handleCleanupOldData = async () => {
    if (!confirm('⚠️ ATTENTION : Cette action va nettoyer toutes les anciennes données de test.\n\nContinuer ?')) return
    
    setActionLoading(true)
    try {
      const res = await fetch('/api/admin/cleanup-old-data', {
        method: 'POST'
      })
      
      const data = await res.json()
      
      if (res.ok) {
        alert(`✅ Nettoyage terminé !\n\n${data.message}\n\nDétails :\n- Matches supprimés : ${data.summary.matchesDeleted}\n- Demandes migrées : ${data.summary.requestsMigrated}\n- Leads supprimés : ${data.summary.leadsDeleted}`)
        await fetchData()
      } else {
        alert(`❌ Erreur : ${data.error}`)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
  }

  // ⚡ NOUVEAU : Supprimer TOUTES les données de test
  const handleDeleteAllTestData = async () => {
    if (!confirm('⚠️⚠️ ATTENTION CRITIQUE ⚠️⚠️\n\nCette action va SUPPRIMER TOUTES les données de test :\n- TOUTES les demandes\n- TOUS les matches\n- TOUS les leads\n\nLes prestataires et abonnements seront conservés.\n\nCette action est IRRÉVERSIBLE !\n\nÊtes-vous ABSOLUMENT SÛR ?')) return
    
    // Double confirmation
    if (!confirm('Dernière confirmation :\n\nSupprimer TOUTES les données de test maintenant ?')) return
    
    setActionLoading(true)
    try {
      const res = await fetch('/api/admin/delete-all-test-data', {
        method: 'POST'
      })
      
      const data = await res.json()
      
      if (res.ok) {
        alert(data.message)
        await fetchData()
      } else {
        alert(`❌ Erreur : ${data.error}`)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
  }

  // ⚡ NOUVEAU : Gérer le statut du prestataire (ACTIVE/INACTIVE/SUSPENDED)
  const handleToggleProviderStatus = async (provider, newStatus) => {
    setSelectedProviderForStatus(provider)
    
    // Si on désactive/suspend, demander la raison
    if (newStatus !== 'ACTIVE') {
      setShowStatusModal(true)
    } else {
      // Activation directe
      await updateProviderStatus(provider.userId, newStatus, null)
    }
  }

  const updateProviderStatus = async (providerId, newStatus, reason = null) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/providers/${providerId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason })
      })
      
      if (res.ok) {
        const data = await res.json()
        alert(`✅ ${data.message}`)
        setShowStatusModal(false)
        setStatusReason('')
        await fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Erreur lors du changement de statut')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Erreur de connexion')
    }
    setActionLoading(false)
  }

  // ⚡ NOUVEAU : Helper pour détecter le type de fichier
  const getFileType = (url) => {
    if (!url) return 'unknown'
    const extension = url.split('.').pop().toLowerCase().split('?')[0]
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) {
      return 'image'
    }
    if (extension === 'pdf') {
      return 'pdf'
    }
    return 'other'
  }

  // ⚡ NOUVEAU : Ouvrir le viewer de preuve de paiement
  const openPaymentProofViewer = (proofUrl) => {
    setCurrentPaymentProof(proofUrl)
    setShowPaymentProofModal(true)
  }

  // ⚡ NOUVEAU : Ouvrir Data URL dans nouvel onglet (conversion en Blob)
  const openInNewTab = (dataUrl) => {
    try {
      // Si c'est une Data URL (base64), convertir en Blob URL
      if (dataUrl.startsWith('data:')) {
        // Extraire le type MIME et les données base64
        const arr = dataUrl.split(',')
        const mimeMatch = arr[0].match(/:(.*?);/)
        const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
        const bstr = atob(arr[1])
        let n = bstr.length
        const u8arr = new Uint8Array(n)
        
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n)
        }
        
        const blob = new Blob([u8arr], { type: mime })
        const blobUrl = URL.createObjectURL(blob)
        
        // Ouvrir le Blob URL dans un nouvel onglet
        const newWindow = window.open(blobUrl, '_blank')
        
        if (!newWindow) {
          alert('❌ Le navigateur a bloqué l\'ouverture du nouvel onglet.\n\nAutorisez les pop-ups pour ce site ou utilisez le bouton Télécharger.')
        }
        
        // Nettoyer le Blob URL après 1 minute
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
      } else {
        // URL normale, ouvrir directement
        const newWindow = window.open(dataUrl, '_blank')
        if (!newWindow) {
          alert('❌ Le navigateur a bloqué l\'ouverture du nouvel onglet.')
        }
      }
    } catch (error) {
      console.error('Erreur ouverture fichier:', error)
      alert('❌ Erreur lors de l\'ouverture du fichier.\n\nUtilisez le bouton Télécharger à la place.')
    }
  }

  // ⚡ NOUVEAU : Télécharger Data URL
  const downloadFile = (dataUrl, filename = 'preuve_paiement') => {
    try {
      const link = document.createElement('a')
      link.href = dataUrl
      
      // Détecter l'extension depuis le MIME type
      if (dataUrl.startsWith('data:image/jpeg')) {
        link.download = `${filename}.jpg`
      } else if (dataUrl.startsWith('data:image/png')) {
        link.download = `${filename}.png`
      } else if (dataUrl.startsWith('data:application/pdf')) {
        link.download = `${filename}.pdf`
      } else {
        link.download = filename
      }
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Erreur téléchargement:', error)
      alert('❌ Erreur lors du téléchargement')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </div>
    )
  }

  // ⚡ Données analytics calculées dynamiquement depuis MongoDB (état `analytics`)
  // Fallback sur EMPTY_ANALYTICS pour que le rendu initial soit toujours 0 / vide.
  const { mainKPIs, conversionFunnel, marketplaceData, qualityData } = analytics || EMPTY_ANALYTICS

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
              disabled={seedLoading}
              aria-busy={seedLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
            >
              {seedLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span>Initialisation…</span>
                </>
              ) : (
                <span>🔄 Seed DB</span>
              )}
            </button>
            <button
              onClick={refreshDashboard}
              disabled={refreshLoading}
              aria-busy={refreshLoading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
            >
              {refreshLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span>Actualisation…</span>
                </>
              ) : (
                <span>↻ Actualiser</span>
              )}
            </button>
            {/* Notifications bell (Option C — fail-safe WhatsApp dispatch) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifPanel((s) => !s)}
                aria-label="Notifications"
                aria-expanded={showNotifPanel}
                className="relative px-3 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                <span aria-hidden="true">🔔</span>
                {notifPendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-600 text-white text-xs font-bold rounded-full inline-flex items-center justify-center shadow">
                    {notifPendingCount > 99 ? '99+' : notifPendingCount}
                  </span>
                )}
              </button>
              {showNotifPanel && (
                <div
                  className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-2xl z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <p className="font-semibold text-gray-900">Notifications</p>
                    <span className="text-xs text-gray-500">
                      {notifPendingCount} à envoyer
                    </span>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="p-6 text-center text-sm text-gray-500">Aucune notification</p>
                    ) : notifications.map((n) => {
                      // ⚡ NOTIFICATION TYPES :
                      // - NEW_PROVIDER : nouveau prestataire inscrit
                      // - PASSWORD_RESET_REQUEST : demande de reset par un prestataire
                      // - PASSWORD_CHANGED : audit (utilisateur a changé son mdp)

                      if (n.type === 'PASSWORD_RESET_REQUEST') {
                        return (
                          <div key={n.id} className="px-4 py-3 border-b last:border-b-0 hover:bg-gray-50">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-xs font-semibold text-gray-900">
                                🔐 Demande de mot de passe
                              </p>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                  n.status === 'SENT'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {n.status === 'SENT' ? 'Traité' : 'À traiter'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700 font-medium mb-0.5">
                              {n.payload?.name || 'Prestataire'}
                            </p>
                            <p className="text-xs text-gray-600 mb-2">
                              {n.payload?.phone} · {n.payload?.role}
                            </p>
                            <p className="text-[11px] text-gray-400 mb-2">
                              {new Date(n.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <div className="flex items-center gap-2">
                              {n.status !== 'SENT' && (
                                <button
                                  type="button"
                                  onClick={() => handleResetPassword(n)}
                                  disabled={resetLoadingId === n.id}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#FF7A00] hover:bg-orange-600 text-white text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
                                >
                                  {resetLoadingId === n.id ? '⏳ Génération...' : '🔑 Générer mot de passe'}
                                </button>
                              )}
                              {n.status === 'SENT' && (
                                <span className="flex-1 text-center text-xs text-emerald-700 italic">
                                  ✓ Réinitialisé le {n.sentAt ? new Date(n.sentAt).toLocaleDateString('fr-FR') : ''}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDismissNotification(n.id)}
                                className="px-2 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                aria-label="Supprimer la notification"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )
                      }

                      if (n.type === 'PASSWORD_CHANGED') {
                        return (
                          <div key={n.id} className="px-4 py-3 border-b last:border-b-0 hover:bg-gray-50 bg-slate-50/50">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-xs font-semibold text-slate-700">
                                🔒 Mot de passe modifié
                              </p>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-slate-200 text-slate-700">
                                Audit
                              </span>
                            </div>
                            <p className="text-xs text-gray-700 mb-0.5">
                              {n.payload?.name || 'Utilisateur'} ({n.payload?.role})
                            </p>
                            <p className="text-[11px] text-gray-400 mb-2">
                              {new Date(n.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleDismissNotification(n.id)}
                              className="text-[11px] text-gray-500 hover:text-red-600 underline"
                            >
                              Effacer
                            </button>
                          </div>
                        )
                      }

                      // Default : NEW_PROVIDER
                      return (
                      <div key={n.id} className="px-4 py-3 border-b last:border-b-0 hover:bg-gray-50">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-xs font-semibold text-gray-900">
                            🚀 {n.payload?.businessName || 'Nouveau prestataire'}
                          </p>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                              n.status === 'SENT'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {n.status === 'SENT' ? 'Envoyé' : 'À envoyer'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">
                          {labelPro(n.payload?.serviceCategory)} · {n.payload?.city} · {n.payload?.phone}
                        </p>
                        <p className="text-[11px] text-gray-400 mb-2">
                          {new Date(n.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSendNotification(n)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#20BA5A] text-white text-xs font-semibold rounded-md transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
                            </svg>
                            {n.status === 'SENT' ? 'Renvoyer' : 'Notifier sur WhatsApp'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismissNotification(n.id)}
                            className="px-2 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            aria-label="Supprimer la notification"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                  <div className="px-4 py-2 border-t bg-gray-50 text-[11px] text-gray-500 rounded-b-xl">
                    Destinataire WhatsApp : <span className="font-mono">+33 7 77 36 94 62</span>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* ⚡ Modal résultat de réinitialisation de mot de passe */}
      {resetResult && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setResetResult(null) }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">🔑 Mot de passe temporaire généré</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Pour <strong>{resetResult.name}</strong> ({resetResult.phone})
                </p>
              </div>
              <button
                onClick={() => setResetResult(null)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 mb-4">
              <p className="text-xs text-orange-900 font-semibold mb-2">
                Mot de passe temporaire (à transmettre au prestataire) :
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border-2 border-orange-400 rounded-lg px-4 py-3 text-2xl font-mono font-bold text-gray-900 tracking-wider text-center">
                  {resetResult.tempPassword}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(resetResult.tempPassword)
                    alert('✅ Mot de passe copié')
                  }}
                  className="px-3 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold text-sm"
                  title="Copier"
                >
                  📋
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 mb-4">
              ℹ️ Toutes les sessions actives du prestataire ont été déconnectées. Le prestataire devra utiliser ce mot de passe pour se reconnecter, puis changer son mot de passe depuis "Mon compte".
            </div>

            <div className="flex gap-2">
              {resetResult.waUrl && (
                <a
                  href={resetResult.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-xl font-bold transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
                  </svg>
                  Envoyer par WhatsApp
                </a>
              )}
              <button
                type="button"
                onClick={() => setResetResult(null)}
                className="px-6 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seed toast notification — flash after Seed DB action */}
      {seedToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl shadow-2xl border max-w-sm animate-in fade-in slide-in-from-top-2 ${
            seedToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">
              {seedToast.type === 'success' ? '✅' : '⚠️'}
            </span>
            <div className="flex-1">
              <p className="font-semibold text-sm">
                {seedToast.title || (seedToast.type === 'success' ? 'Succès' : 'Erreur')}
              </p>
              <p className="text-sm mt-0.5 opacity-90">{seedToast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setSeedToast(null)}
              aria-label="Fermer"
              className="text-current opacity-60 hover:opacity-100 transition-opacity text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

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

        {/* ⚡ NOUVEAU : Section Analytics enrichie */}
        <div className="mb-8">
          {/* Header Analytics */}
          <div className="bg-gradient-to-r from-[#0B2A4A] to-blue-800 rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">📊 Analytics & Performance</h2>
            <p className="text-blue-100 text-sm">Vue détaillée des performances de la plateforme</p>
          </div>

          {/* KPI Cards Avancés */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Acquisition */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <span className="text-2xl">👁️</span>
                </div>
                <span className="px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold">
                  {mainKPIs.visits.change}
                </span>
              </div>
              <h3 className="text-sm text-gray-600 font-medium mb-1">Visites Totales</h3>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(mainKPIs.visits.total)}</p>
              <p className="text-xs text-gray-500 mt-1">{formatNumber(mainKPIs.visits.unique)} visiteurs uniques</p>
            </div>

            {/* Engagement */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-orange-50 rounded-lg">
                  <span className="text-2xl">🖱️</span>
                </div>
                <span className="px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold">
                  {mainKPIs.clicks.change}
                </span>
              </div>
              <h3 className="text-sm text-gray-600 font-medium mb-1">Clics Totaux</h3>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(mainKPIs.clicks.total)}</p>
              <p className="text-xs text-gray-500 mt-1">Taux d'engagement: {mainKPIs.clicks.engagementRate}%</p>
            </div>

            {/* Conversion */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <span className="text-2xl">📈</span>
                </div>
                <span className="px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold">
                  {mainKPIs.conversion.change}
                </span>
              </div>
              <h3 className="text-sm text-gray-600 font-medium mb-1">Taux de Conversion</h3>
              <p className="text-2xl font-bold text-gray-900">{mainKPIs.conversion.rate}%</p>
              <p className="text-xs text-gray-500 mt-1">{mainKPIs.conversion.total} conversions réussies</p>
            </div>

            {/* Business */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-green-50 rounded-lg">
                  <span className="text-2xl">💰</span>
                </div>
                <span className="px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold">
                  {mainKPIs.revenue.change}
                </span>
              </div>
              <h3 className="text-sm text-gray-600 font-medium mb-1">Revenu Total</h3>
              <p className="text-2xl font-bold text-gray-900">{(mainKPIs.revenue.total / 1000000).toFixed(1)}M FCFA</p>
              <p className="text-xs text-gray-500 mt-1">Panier moyen: {formatNumber(mainKPIs.revenue.avgBasket)} FCFA</p>
            </div>
          </div>

          {/* Grille Analytics détaillée */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            
            {/* Funnel de Conversion */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">🎯 Tunnel de Conversion</h3>
              <div className="space-y-3">
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">Visites</span>
                    <span className="text-sm font-bold text-gray-900">{formatNumber(conversionFunnel.visits.count)}</span>
                  </div>
                  <div className="h-10 bg-gradient-to-r from-blue-500 to-blue-400 rounded-lg flex items-center px-4">
                    <span className="text-white font-semibold text-sm">100%</span>
                  </div>
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">Clics</span>
                    <span className="text-sm font-bold text-gray-900">{formatNumber(conversionFunnel.clicks.count)} ({formatPercentage(conversionFunnel.clicks.percentage)})</span>
                  </div>
                  <div className="h-10 bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-lg flex items-center px-4" style={{width: '78%'}}>
                    <span className="text-white font-semibold text-sm">{formatPercentage(conversionFunnel.clicks.percentage)}</span>
                  </div>
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">Demandes</span>
                    <span className="text-sm font-bold text-gray-900">{formatNumber(conversionFunnel.requests.count)} ({formatPercentage(conversionFunnel.requests.percentage)})</span>
                  </div>
                  <div className="h-10 bg-gradient-to-r from-purple-500 to-purple-400 rounded-lg flex items-center px-4" style={{width: '56%'}}>
                    <span className="text-white font-semibold text-sm">{formatPercentage(conversionFunnel.requests.percentage)}</span>
                  </div>
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">Réservations</span>
                    <span className="text-sm font-bold text-gray-900">{formatNumber(conversionFunnel.bookings.count)} ({formatPercentage(conversionFunnel.bookings.percentage)})</span>
                  </div>
                  <div className="h-10 bg-gradient-to-r from-orange-500 to-orange-400 rounded-lg flex items-center px-4" style={{width: '38%'}}>
                    <span className="text-white font-semibold text-sm">{formatPercentage(conversionFunnel.bookings.percentage)}</span>
                  </div>
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">Paiements</span>
                    <span className="text-sm font-bold text-gray-900">{formatNumber(conversionFunnel.payments.count)} ({formatPercentage(conversionFunnel.payments.percentage)})</span>
                  </div>
                  <div className="h-10 bg-gradient-to-r from-green-500 to-green-400 rounded-lg flex items-center px-4" style={{width: '28%'}}>
                    <span className="text-white font-semibold text-sm">{formatPercentage(conversionFunnel.payments.percentage)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Marketplace */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">🏪 Performance Marketplace</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <span className="text-sm text-gray-700">Prestataires actifs</span>
                  <span className="text-lg font-bold text-blue-700">{marketplaceData.activeProviders}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span className="text-sm text-gray-700">Taux de réponse moyen</span>
                  <span className="text-lg font-bold text-green-700">{marketplaceData.avgResponseRate}%</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                  <span className="text-sm text-gray-700">Délai moyen réponse</span>
                  <span className="text-lg font-bold text-purple-700">{marketplaceData.avgResponseTime}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <span className="text-sm text-gray-700">Note moyenne</span>
                  <span className="text-lg font-bold text-yellow-700">{qualityData.avgRating} ⭐</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                  <span className="text-sm text-gray-700">Profils les plus vus</span>
                  <span className="text-lg font-bold text-orange-700">{marketplaceData.topProviders[0].views}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Catégories */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Catégories populaires */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">🔥 Top Catégories</h3>
              <div className="space-y-3">
                {marketplaceData.topCategories.map((cat, idx) => {
                  const maxValue = marketplaceData.topCategories[0].requests
                  const percentage = (cat.requests / maxValue) * 100
                  const colors = ['bg-blue-500', 'bg-yellow-500', 'bg-green-500', 'bg-cyan-500', 'bg-orange-500']
                  return (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700 font-medium">{cat.name}</span>
                        <span className="text-sm font-bold text-gray-900">{cat.requests}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${colors[idx]} rounded-full transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Villes actives */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">📍 Villes Actives</h3>
              <div className="space-y-3">
                {marketplaceData.topCities.map((city, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                    <span className="text-sm text-gray-700">{city.name}</span>
                    <span className="text-sm font-bold text-[#0B2A4A]">{city.requests} demandes</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Qualité Service */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">⭐ Qualité</h3>
              <div className="space-y-3">
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Note moyenne</p>
                  <p className="text-2xl font-bold text-yellow-700">{qualityData.avgRating} / 5</p>
                </div>
                
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Total avis</p>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(qualityData.totalReviews)}</p>
                </div>

                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Taux satisfaction</p>
                  <p className="text-2xl font-bold text-green-700">{qualityData.satisfactionRate}%</p>
                </div>

                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Taux annulation</p>
                  <p className="text-2xl font-bold text-red-700">{qualityData.cancellationRate}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-8">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-500">Moteur: <span className="font-medium text-gray-900">{stats?.aiStatus || 'Système autonome (local)'}</span></span>
            <span className="text-gray-500">Messagerie: <span className="font-medium text-gray-900">{stats?.whatsappStatus || 'Local (base de données)'}</span></span>
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
          <a href="/secure-wooleen-admin/wookotv" className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-200">📺 WookoproTV</a>
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
                      <span className="font-medium">{labelPro(req.serviceCategory)}</span>
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
                    <p className="text-sm text-gray-500 mt-1">{labelPro(p.serviceCategory)} • {p.city}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Bouton nettoyage */}
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-red-900 mb-2">🧹 Nettoyage des anciennes données</h3>
                  <p className="text-sm text-red-700">
                    Migrer les anciennes demandes et supprimer les données obsolètes du système.
                  </p>
                  <ul className="text-xs text-red-600 mt-2 space-y-1">
                    <li>• Migrer demandes EN_ATTENTE_VALIDATION_ADMIN → COMPLETED</li>
                    <li>• Supprimer matches avec statuts obsolètes (PAYMENT_PENDING, etc.)</li>
                    <li>• Supprimer leads non liés de plus de 7 jours</li>
                  </ul>
                </div>
                <button
                  onClick={handleCleanupOldData}
                  disabled={actionLoading}
                  className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {actionLoading ? 'Nettoyage...' : '🧹 Nettoyer'}
                </button>
              </div>
            </div>

            {/* Bouton RESET COMPLET */}
            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-orange-900 mb-2">⚠️ RESET COMPLET - Supprimer toutes les données de test</h3>
                  <p className="text-sm text-orange-700 mb-2">
                    <strong>ATTENTION :</strong> Supprime TOUTES les demandes, matches et leads.
                  </p>
                  <p className="text-xs text-orange-600">
                    ✅ Conserve : Prestataires, Abonnements, Utilisateurs
                  </p>
                  <p className="text-xs text-orange-600">
                    ❌ Supprime : Toutes les demandes, tous les matches, tous les leads
                  </p>
                </div>
                <button
                  onClick={handleDeleteAllTestData}
                  disabled={actionLoading}
                  className="px-6 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {actionLoading ? 'Suppression...' : '🗑️ RESET'}
                </button>
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
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Disponibilité</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Statut Compte</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {providers.map((p) => {
                    const accountStatus = p.accountStatus || 'ACTIVE'
                    return (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium">{p.businessName}</td>
                      <td className="px-4 py-3 text-gray-600">{labelPro(p.serviceCategory)}</td>
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
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold inline-block ${
                            accountStatus === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                            accountStatus === 'INACTIVE' ? 'bg-gray-100 text-gray-800' :
                            accountStatus === 'SUSPENDED' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {accountStatus === 'ACTIVE' ? '🟢 ACTIF' :
                             accountStatus === 'INACTIVE' ? '⚫ INACTIF' :
                             accountStatus === 'SUSPENDED' ? '🔴 SUSPENDU' :
                             '🟡 EN ATTENTE'}
                          </span>
                          {p.disabledReason && (
                            <span className="text-xs text-gray-500 italic">
                              {p.disabledReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => {
                              setSelectedProvider(p)
                              setShowProviderModal(true)
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            👁️ Détails
                          </button>
                          
                          {accountStatus === 'ACTIVE' ? (
                            <button
                              onClick={() => handleToggleProviderStatus(p, 'INACTIVE')}
                              disabled={actionLoading}
                              className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                            >
                              🔴 Désactiver
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleProviderStatus(p, 'ACTIVE')}
                              disabled={actionLoading}
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                              🟢 Activer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
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
                        <td className="px-4 py-3 font-medium">{labelPro(r.serviceCategory || r.category)}</td>
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
                            {labelPro(user.provider?.serviceCategory) || 'N/A'}
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
                            <p className="font-medium text-gray-900">{labelPro(payment.request?.serviceCategory) || 'N/A'}</p>
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
                            {sub.paymentProof ? (
                              <button
                                onClick={() => openPaymentProofViewer(sub.paymentProof)}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                              >
                                📎 Voir preuve
                              </button>
                            ) : (
                              <span className="text-sm text-gray-400">Aucune preuve</span>
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
                      <p className="font-semibold text-gray-900">{labelPro(selectedProvider.serviceCategory)}</p>
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
                      <p className="font-semibold text-gray-900">{labelPro(selectedRequest.serviceCategory)}</p>
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

      {/* ⚡ NOUVEAU : Modal Désactivation Prestataire */}
      {showStatusModal && selectedProviderForStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-xl font-bold text-gray-900">
                🔴 Désactiver le prestataire
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {selectedProviderForStatus.businessName}
              </p>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Raison de la désactivation (optionnel)
              </label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Ex: Non-respect des règles, Fraude, Qualité insuffisante..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-2">
                ⚠️ Le prestataire ne recevra plus aucune demande tant que son compte est désactivé.
              </p>
            </div>

            <div className="p-6 border-t bg-gray-50">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowStatusModal(false)
                    setStatusReason('')
                    setSelectedProviderForStatus(null)
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-300"
                >
                  Annuler
                </button>
                <button
                  onClick={() => updateProviderStatus(
                    selectedProviderForStatus.userId,
                    'INACTIVE',
                    statusReason || null
                  )}
                  disabled={actionLoading}
                  className="flex-1 bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading ? 'En cours...' : '✓ Confirmer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⚡ NOUVEAU : Modal Viewer Preuve de Paiement */}
      {showPaymentProofModal && currentPaymentProof && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                📎 Preuve de Paiement
              </h3>
              <button
                onClick={() => {
                  setShowPaymentProofModal(false)
                  setCurrentPaymentProof(null)
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {getFileType(currentPaymentProof) === 'image' && (
                <div className="flex justify-center">
                  <img 
                    src={currentPaymentProof} 
                    alt="Preuve de paiement"
                    className="max-w-full h-auto rounded-lg shadow-lg"
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'block'
                    }}
                  />
                  <div style={{display: 'none'}} className="text-center py-12">
                    <p className="text-red-600 mb-4">❌ Impossible de charger l'image</p>
                    <button
                      onClick={() => openInNewTab(currentPaymentProof)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Ouvrir dans un nouvel onglet
                    </button>
                  </div>
                </div>
              )}

              {getFileType(currentPaymentProof) === 'pdf' && (
                <div className="h-[600px]">
                  <iframe
                    src={currentPaymentProof}
                    className="w-full h-full border rounded-lg"
                    title="Preuve de paiement PDF"
                  />
                  <p className="text-sm text-gray-600 mt-2 text-center">
                    Si le PDF ne s'affiche pas, 
                    <button
                      onClick={() => openInNewTab(currentPaymentProof)}
                      className="text-blue-600 hover:text-blue-800 ml-1 underline"
                    >
                      cliquez ici pour l'ouvrir dans un nouvel onglet
                    </button>
                  </p>
                </div>
              )}

              {getFileType(currentPaymentProof) === 'other' && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📄</div>
                  <p className="text-gray-700 mb-4">
                    Type de fichier non prévisualisable
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => openInNewTab(currentPaymentProof)}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
                    >
                      🔗 Ouvrir dans un nouvel onglet
                    </button>
                    <button
                      onClick={() => downloadFile(currentPaymentProof)}
                      className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700"
                    >
                      📥 Télécharger
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with actions */}
            <div className="p-6 border-t bg-gray-50">
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => openInNewTab(currentPaymentProof)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
                >
                  🔗 Ouvrir dans nouvel onglet
                </button>
                <button
                  onClick={() => downloadFile(currentPaymentProof)}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700"
                >
                  📥 Télécharger
                </button>
                <button
                  onClick={() => {
                    setShowPaymentProofModal(false)
                    setCurrentPaymentProof(null)
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
