'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { 
  MessageCircle, Users, FileText, BarChart3, Send, Phone, MapPin, Star, Zap, 
  RefreshCw, CheckCircle, Clock, XCircle, LogIn, LogOut, User, Briefcase,
  ThumbsUp, ThumbsDown, Bell
} from 'lucide-react'

export default function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [stats, setStats] = useState({ providers: 0, requests: 0, matches: 0, activeProviders: 0 })
  const [providers, setProviders] = useState([])
  const [requests, setRequests] = useState([])
  const [whatsappMessages, setWhatsappMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [simulateFrom, setSimulateFrom] = useState('+221770001234')
  const [simulateText, setSimulateText] = useState('')
  const [simulateResult, setSimulateResult] = useState(null)
  const [seeding, setSeeding] = useState(false)
  
  // Provider auth state
  const [providerLoggedIn, setProviderLoggedIn] = useState(false)
  const [providerData, setProviderData] = useState(null)
  const [providerDashboard, setProviderDashboard] = useState(null)
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  // Fetch all data
  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsRes, providersRes, requestsRes, messagesRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/providers'),
        fetch('/api/requests'),
        fetch('/api/whatsapp/messages')
      ])

      if (statsRes.ok) setStats(await statsRes.json())
      if (providersRes.ok) setProviders(await providersRes.json())
      if (requestsRes.ok) setRequests(await requestsRes.json())
      if (messagesRes.ok) setWhatsappMessages(await messagesRes.json())
    } catch (error) {
      console.error('Fetch error:', error)
    }
    setLoading(false)
  }

  // Fetch provider dashboard
  const fetchProviderDashboard = async (providerId) => {
    try {
      const res = await fetch(`/api/provider/dashboard/${providerId}`)
      if (res.ok) {
        const data = await res.json()
        setProviderDashboard(data)
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error)
    }
  }

  // Seed database
  const seedDatabase = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      if (res.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Seed error:', error)
    }
    setSeeding(false)
  }

  // Simulate WhatsApp message
  const simulateMessage = async () => {
    if (!simulateFrom || !simulateText) return
    setLoading(true)
    setSimulateResult(null)
    try {
      const res = await fetch('/api/simulate/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: simulateFrom, text: simulateText })
      })
      const data = await res.json()
      setSimulateResult(data)
      await fetchData()
    } catch (error) {
      console.error('Simulate error:', error)
      setSimulateResult({ error: error.message })
    }
    setLoading(false)
  }

  // Provider login
  const handleProviderLogin = async () => {
    setLoginError('')
    try {
      const res = await fetch('/api/auth/provider/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, password: loginPassword })
      })
      const data = await res.json()
      
      if (res.ok && data.success) {
        setProviderLoggedIn(true)
        setProviderData(data)
        if (data.provider?.id) {
          await fetchProviderDashboard(data.provider.id)
        }
        setActiveTab('provider')
      } else {
        setLoginError(data.error || 'Erreur de connexion')
      }
    } catch (error) {
      setLoginError('Erreur de connexion')
    }
  }

  // Provider logout
  const handleProviderLogout = () => {
    setProviderLoggedIn(false)
    setProviderData(null)
    setProviderDashboard(null)
    setActiveTab('home')
  }

  // Toggle provider availability
  const toggleAvailability = async () => {
    if (!providerData?.provider?.id) return
    try {
      const res = await fetch(`/api/provider/${providerData.provider.id}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !providerData.provider.isAvailable })
      })
      if (res.ok) {
        setProviderData(prev => ({
          ...prev,
          provider: { ...prev.provider, isAvailable: !prev.provider.isAvailable }
        }))
      }
    } catch (error) {
      console.error('Toggle error:', error)
    }
  }

  // Provider respond to lead
  const respondToLead = async (matchId, response) => {
    if (!providerData?.provider?.id) return
    try {
      const res = await fetch(`/api/provider/${providerData.provider.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, response })
      })
      if (res.ok) {
        await fetchProviderDashboard(providerData.provider.id)
        await fetchData()
      }
    } catch (error) {
      console.error('Respond error:', error)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const getStatusBadge = (status) => {
    const statusConfig = {
      PENDING: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      MATCHING: { color: 'bg-blue-100 text-blue-800', icon: RefreshCw },
      ASSIGNED: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      COMPLETED: { color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
      CANCELLED: { color: 'bg-red-100 text-red-800', icon: XCircle },
      SENT: { color: 'bg-blue-100 text-blue-800', icon: Send },
      ACCEPTED: { color: 'bg-green-100 text-green-800', icon: ThumbsUp },
      DECLINED: { color: 'bg-red-100 text-red-800', icon: ThumbsDown }
    }
    const config = statusConfig[status] || statusConfig.PENDING
    const Icon = config.icon
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Wooleen
                </h1>
                <p className="text-xs text-slate-500">Marketplace de Services au Sénégal</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {providerLoggedIn ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-100 text-emerald-700">
                    <User className="w-3 h-3 mr-1" />
                    {providerData?.provider?.businessName || providerData?.user?.name}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={handleProviderLogout}>
                    <LogOut className="w-4 h-4 mr-1" />
                    Déconnexion
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setActiveTab('login')}>
                  <LogIn className="w-4 h-4 mr-1" />
                  Espace Prestataire
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>
              <Button size="sm" onClick={seedDatabase} disabled={seeding} className="bg-emerald-600 hover:bg-emerald-700">
                {seeding ? 'Initialisation...' : 'Initialiser DB'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-3xl mx-auto grid-cols-5 bg-white shadow-sm">
            <TabsTrigger value="home" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Accueil
            </TabsTrigger>
            <TabsTrigger value="webhook" className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="providers" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Prestataires
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Demandes
            </TabsTrigger>
            <TabsTrigger value={providerLoggedIn ? "provider" : "login"} className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              {providerLoggedIn ? 'Mon Espace' : 'Connexion'}
            </TabsTrigger>
          </TabsList>

          {/* HOME TAB */}
          <TabsContent value="home" className="space-y-6">
            <Card className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-0">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-2">Bienvenue sur Wooleen v2.0</h2>
                <p className="text-emerald-100">
                  Plateforme WhatsApp-first avec IA GPT-4o-mini et gestion des réponses prestataires.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white/10 rounded-lg">
                    <p className="text-sm font-medium">IA Parsing</p>
                    <p className="text-emerald-100 text-xs">{stats.aiStatus || 'OpenAI GPT-4o-mini'}</p>
                  </div>
                  <div className="p-3 bg-white/10 rounded-lg">
                    <p className="text-sm font-medium">WhatsApp</p>
                    <p className="text-emerald-100 text-xs">{stats.whatsappStatus || 'Mocked'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-6">
              <Card className="border-l-4 border-l-emerald-500">
                <CardHeader className="pb-2">
                  <CardDescription>Prestataires</CardDescription>
                  <CardTitle className="text-3xl text-emerald-600">{stats.providers}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardDescription>Demandes</CardDescription>
                  <CardTitle className="text-3xl text-blue-600">{stats.requests}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardHeader className="pb-2">
                  <CardDescription>Matchings</CardDescription>
                  <CardTitle className="text-3xl text-purple-600">{stats.matches}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-l-4 border-l-teal-500">
                <CardHeader className="pb-2">
                  <CardDescription>Actifs</CardDescription>
                  <CardTitle className="text-3xl text-teal-600">{stats.activeProviders}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="pb-2">
                  <CardDescription>En attente</CardDescription>
                  <CardTitle className="text-3xl text-orange-600">{stats.pendingMatches || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="pb-2">
                  <CardDescription>Acceptés</CardDescription>
                  <CardTitle className="text-3xl text-green-600">{stats.acceptedMatches || 0}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Feature Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('webhook')}>
                <CardHeader>
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-2">
                    <MessageCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <CardTitle className="text-lg">Simulateur WhatsApp</CardTitle>
                  <CardDescription>
                    Testez le webhook avec parsing IA GPT-4o-mini.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab(providerLoggedIn ? 'provider' : 'login')}>
                <CardHeader>
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-2">
                    <Briefcase className="w-6 h-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-lg">Espace Prestataire</CardTitle>
                  <CardDescription>
                    Gérez vos demandes et répondez OUI/NON.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('requests')}>
                <CardHeader>
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-lg">Demandes Clients</CardTitle>
                  <CardDescription>
                    Suivez les demandes et leur statut de matching.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </TabsContent>

          {/* WEBHOOK TAB */}
          <TabsContent value="webhook" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Simulator */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-green-600" />
                    Simulateur de Message WhatsApp
                  </CardTitle>
                  <CardDescription>
                    L'IA GPT-4o-mini analyse et extrait les informations du message.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600">Numéro WhatsApp (simulé)</label>
                    <Input
                      value={simulateFrom}
                      onChange={(e) => setSimulateFrom(e.target.value)}
                      placeholder="+221770001234"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Message du client</label>
                    <textarea
                      value={simulateText}
                      onChange={(e) => setSimulateText(e.target.value)}
                      placeholder="Exemple: J'ai besoin d'un plombier urgement à Ouakam, ma douche fuit"
                      className="mt-1 w-full h-24 px-3 py-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <Button
                    onClick={simulateMessage}
                    disabled={loading || !simulateText}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Envoyer (Simuler)
                  </Button>

                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium text-slate-600 mb-2">Exemples :</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "J'ai besoin d'un plombier à Dakar Ouakam urgement",
                        "Électricien à Pikine pour panne de courant",
                        "Climatiseur en panne à Thiès Nord",
                        "OUI",
                        "NON"
                      ].map((msg, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          onClick={() => setSimulateText(msg)}
                          className="text-xs"
                        >
                          {msg.substring(0, 25)}{msg.length > 25 ? '...' : ''}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Result */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    Résultat du Parsing IA
                  </CardTitle>
                  <CardDescription>
                    Analyse par {stats.aiStatus || 'OpenAI GPT-4o-mini'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {simulateResult ? (
                    <div className="space-y-4">
                      {simulateResult.error ? (
                        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
                          Erreur: {simulateResult.error}
                        </div>
                      ) : simulateResult.providerResponse ? (
                        <div className="p-4 bg-emerald-50 rounded-lg">
                          <p className="text-sm font-medium text-emerald-800">
                            ✅ Réponse prestataire traitée
                          </p>
                          <p className="text-sm text-emerald-700 mt-1">
                            Status: {simulateResult.providerResponse.status}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="p-4 bg-emerald-50 rounded-lg">
                            <p className="text-sm font-medium text-emerald-800">
                              {simulateResult.clarification ? '❓ Clarification demandée' : '✅ Demande créée'}
                            </p>
                            {simulateResult.requestId && (
                              <p className="text-xs text-emerald-600 mt-1">ID: {simulateResult.requestId}</p>
                            )}
                            {simulateResult.matched !== undefined && (
                              <p className="text-sm text-emerald-700 mt-1">
                                {simulateResult.matched} prestataire(s) notifié(s)
                              </p>
                            )}
                          </div>

                          {simulateResult.parsed && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-slate-700">Données extraites</h4>
                                <Badge variant="outline" className="text-xs">
                                  {simulateResult.parsed.ai_source === 'openai' ? 'GPT-4o-mini' : 'Local'}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="p-2 bg-slate-50 rounded">
                                  <span className="text-slate-500">Service:</span>
                                  <span className="ml-2 font-medium">{simulateResult.parsed.service_category}</span>
                                </div>
                                <div className="p-2 bg-slate-50 rounded">
                                  <span className="text-slate-500">Ville:</span>
                                  <span className="ml-2 font-medium">{simulateResult.parsed.city || '-'}</span>
                                </div>
                                <div className="p-2 bg-slate-50 rounded">
                                  <span className="text-slate-500">Zone:</span>
                                  <span className="ml-2 font-medium">{simulateResult.parsed.zone || '-'}</span>
                                </div>
                                <div className="p-2 bg-slate-50 rounded">
                                  <span className="text-slate-500">Urgence:</span>
                                  <span className="ml-2 font-medium">{simulateResult.parsed.urgency}</span>
                                </div>
                              </div>
                              <div className="p-2 bg-slate-50 rounded">
                                <span className="text-slate-500 text-sm">Prêt pour matching:</span>
                                <span className="ml-2">
                                  {simulateResult.parsed.ready_for_matching ? '✅ Oui' : '❌ Non'}
                                </span>
                              </div>
                            </div>
                          )}

                          {simulateResult.matchedProviders && simulateResult.matchedProviders.length > 0 && (
                            <div className="p-3 bg-blue-50 rounded-lg">
                              <p className="text-sm font-medium text-blue-800 mb-2">Prestataires matchés:</p>
                              {simulateResult.matchedProviders.map((p, i) => (
                                <div key={i} className="text-sm text-blue-700 flex justify-between">
                                  <span>{p.businessName}</span>
                                  <span>Score: {p.score}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-8">
                      <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Envoyez un message pour voir le résultat</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* WhatsApp Messages */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-green-600" />
                  Messages WhatsApp ({stats.whatsappStatus || 'MOCKÉS'})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  {whatsappMessages.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">Aucun message</p>
                  ) : (
                    <div className="space-y-3">
                      {whatsappMessages.slice(0, 20).map((msg, i) => (
                        <div key={i} className="p-3 bg-green-50 rounded-lg border border-green-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-green-800">→ {msg.to}</span>
                            <Badge variant="outline" className="text-xs">{msg.mocked ? 'MOCK' : 'REAL'}</Badge>
                          </div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.text}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(msg.timestamp).toLocaleString('fr-FR')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PROVIDER LOGIN TAB */}
          <TabsContent value="login" className="space-y-6">
            <div className="max-w-md mx-auto">
              <Card>
                <CardHeader className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Briefcase className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle>Espace Prestataire</CardTitle>
                  <CardDescription>
                    Connectez-vous pour gérer vos demandes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600">Numéro de téléphone</label>
                    <Input
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      placeholder="+221700000101"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Mot de passe</label>
                    <Input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="wooleen2025"
                      className="mt-1"
                    />
                  </div>
                  {loginError && (
                    <p className="text-sm text-red-600">{loginError}</p>
                  )}
                  <Button 
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleProviderLogin}
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Connexion
                  </Button>
                  <p className="text-xs text-slate-500 text-center">
                    Mot de passe par défaut: <code className="bg-slate-100 px-1 rounded">wooleen2025</code>
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* PROVIDER DASHBOARD TAB */}
          <TabsContent value="provider" className="space-y-6">
            {providerLoggedIn && providerData ? (
              <>
                {/* Provider Header */}
                <Card className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-0">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold">{providerData.provider?.businessName}</h2>
                        <p className="text-purple-100">{providerData.provider?.serviceCategory} • {providerData.provider?.city}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Disponible</span>
                          <Switch
                            checked={providerData.provider?.isAvailable}
                            onCheckedChange={toggleAvailability}
                          />
                        </div>
                        <Badge className={providerData.provider?.isAvailable ? 'bg-green-500' : 'bg-red-500'}>
                          {providerData.provider?.isAvailable ? 'En ligne' : 'Hors ligne'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Provider Stats */}
                {providerDashboard && (
                  <div className="grid gap-4 md:grid-cols-4">
                    <Card className="border-l-4 border-l-blue-500">
                      <CardHeader className="pb-2">
                        <CardDescription>Total demandes</CardDescription>
                        <CardTitle className="text-3xl text-blue-600">{providerDashboard.stats.totalLeads}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="border-l-4 border-l-orange-500">
                      <CardHeader className="pb-2">
                        <CardDescription>En attente</CardDescription>
                        <CardTitle className="text-3xl text-orange-600">{providerDashboard.stats.pending}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="border-l-4 border-l-green-500">
                      <CardHeader className="pb-2">
                        <CardDescription>Acceptées</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{providerDashboard.stats.accepted}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="border-l-4 border-l-red-500">
                      <CardHeader className="pb-2">
                        <CardDescription>Refusées</CardDescription>
                        <CardTitle className="text-3xl text-red-600">{providerDashboard.stats.declined}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                )}

                {/* Provider Leads */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-purple-600" />
                      Mes Demandes
                    </CardTitle>
                    <CardDescription>
                      Répondez OUI pour accepter ou NON pour refuser
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {providerDashboard?.matches?.length === 0 ? (
                      <p className="text-center text-slate-400 py-8">Aucune demande pour le moment</p>
                    ) : (
                      <div className="space-y-4">
                        {providerDashboard?.matches?.map((match, i) => (
                          <Card key={i} className="border shadow-sm">
                            <CardContent className="pt-4">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h3 className="font-semibold text-slate-800 capitalize">
                                    {match.request?.serviceCategory}
                                  </h3>
                                  <p className="text-xs text-slate-500">
                                    Score: {match.score} • {match.reason}
                                  </p>
                                </div>
                                {getStatusBadge(match.status)}
                              </div>
                              <p className="text-sm text-slate-700 mb-3 p-2 bg-slate-50 rounded">
                                {match.request?.normalizedText || match.request?.rawMessage}
                              </p>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                  <MapPin className="w-4 h-4" />
                                  <span>{match.request?.zone || match.request?.city}</span>
                                  <span className="text-slate-400">•</span>
                                  <span className="capitalize">{match.request?.urgency}</span>
                                </div>
                                {match.status === 'SENT' && (
                                  <div className="flex gap-2">
                                    <Button 
                                      size="sm" 
                                      className="bg-green-600 hover:bg-green-700"
                                      onClick={() => respondToLead(match.requestId, 'accept')}
                                    >
                                      <ThumbsUp className="w-4 h-4 mr-1" />
                                      Accepter
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="text-red-600 border-red-300 hover:bg-red-50"
                                      onClick={() => respondToLead(match.requestId, 'decline')}
                                    >
                                      <ThumbsDown className="w-4 h-4 mr-1" />
                                      Refuser
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-500">Veuillez vous connecter</p>
                <Button className="mt-4" onClick={() => setActiveTab('login')}>
                  <LogIn className="w-4 h-4 mr-2" />
                  Se connecter
                </Button>
              </div>
            )}
          </TabsContent>

          {/* PROVIDERS TAB */}
          <TabsContent value="providers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Prestataires ({providers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {providers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p className="text-slate-500">Cliquez sur "Initialiser DB"</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {providers.map((provider) => (
                      <Card key={provider.id} className="border shadow-sm">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-slate-800">{provider.businessName}</h3>
                            {provider.isVerified && <Badge className="bg-blue-100 text-blue-700">Vérifié</Badge>}
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-slate-600">
                              <Zap className="w-4 h-4" />
                              <span className="capitalize">{provider.serviceCategory}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <MapPin className="w-4 h-4" />
                              <span>{provider.city}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Star className="w-4 h-4 text-yellow-500" />
                              <span>{provider.rating?.toFixed(1)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Phone className="w-4 h-4" />
                              <span>{provider.whatsappNumber}</span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-slate-500">Zones: {provider.zones?.join(', ')}</p>
                          </div>
                          <Badge className={`mt-2 ${provider.isAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {provider.isAvailable ? 'Disponible' : 'Indisponible'}
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* REQUESTS TAB */}
          <TabsContent value="requests" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  Demandes Clients ({requests.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {requests.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p className="text-slate-500">Utilisez le simulateur WhatsApp</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {requests.map((req) => (
                      <Card key={req.id} className="border shadow-sm">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-slate-800 capitalize">{req.serviceCategory}</h3>
                              <p className="text-xs text-slate-500">ID: {req.id?.substring(0, 8)}...</p>
                            </div>
                            {getStatusBadge(req.status)}
                          </div>
                          <p className="text-sm text-slate-700 mb-3 p-2 bg-slate-50 rounded">
                            {req.normalizedText || req.rawMessage}
                          </p>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="flex items-center gap-1 text-slate-600">
                              <MapPin className="w-4 h-4" />
                              <span>{req.city}</span>
                            </div>
                            <div className="text-slate-600">
                              <span className="text-slate-500">Zone:</span> {req.zone || '-'}
                            </div>
                            <div className="text-slate-600">
                              <span className="text-slate-500">Urgence:</span> {req.urgency}
                            </div>
                          </div>
                          <Separator className="my-3" />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {req.matches?.length || 0} match(es)
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {req.aiSource === 'openai' ? 'GPT-4o-mini' : 'Local'}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-400">
                              {new Date(req.createdAt).toLocaleString('fr-FR')}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-slate-700">Wooleen v2.0</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>WhatsApp: {stats.whatsappStatus || 'MOCKÉ'}</span>
              <span>•</span>
              <span>IA: {stats.aiStatus || 'GPT-4o-mini'}</span>
              <span>•</span>
              <span>DB: MongoDB</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
