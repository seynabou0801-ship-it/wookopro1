'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { MessageCircle, Users, FileText, BarChart3, Send, Phone, MapPin, Star, Zap, RefreshCw, CheckCircle, Clock, XCircle } from 'lucide-react'

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

  useEffect(() => {
    fetchData()
  }, [])

  const getStatusBadge = (status) => {
    const statusConfig = {
      PENDING: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      MATCHING: { color: 'bg-blue-100 text-blue-800', icon: RefreshCw },
      ASSIGNED: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      COMPLETED: { color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
      CANCELLED: { color: 'bg-red-100 text-red-800', icon: XCircle }
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
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4 bg-white shadow-sm">
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
          </TabsList>

          {/* HOME TAB */}
          <TabsContent value="home" className="space-y-6">
            {/* Welcome Banner */}
            <Card className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-0">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-2">Bienvenue sur Wooleen</h2>
                <p className="text-emerald-100">
                  Plateforme WhatsApp-first qui connecte clients et prestataires au Sénégal grâce à l'IA.
                </p>
                <div className="mt-4 p-4 bg-white/10 rounded-lg">
                  <p className="text-sm font-medium">Message automatique WhatsApp :</p>
                  <p className="text-emerald-100 text-sm mt-1 italic">
                    "Bienvenue sur Wooleen 👋 Décrivez votre besoin (ex : plombier, électricien...) et votre zone. 
                    Nous vous trouvons un prestataire rapidement."
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-4">
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
            </div>

            {/* Quick Links */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('webhook')}>
                <CardHeader>
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-2">
                    <MessageCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <CardTitle className="text-lg">Simulateur WhatsApp</CardTitle>
                  <CardDescription>
                    Testez le webhook et le parsing IA des messages clients.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('providers')}>
                <CardHeader>
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-lg">Prestataires</CardTitle>
                  <CardDescription>
                    Gérez les prestataires disponibles par catégorie et zone.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('requests')}>
                <CardHeader>
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-2">
                    <FileText className="w-6 h-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-lg">Demandes Clients</CardTitle>
                  <CardDescription>
                    Suivez les demandes et leur statut de matching.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </TabsContent>

          {/* WEBHOOK TAB - MVP FOCUS */}
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
                    Testez le webhook comme si un client envoyait un message WhatsApp.
                    L'IA (GPT-4o-mini) analyse et extrait les informations.
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
                  <div className="flex gap-2">
                    <Button
                      onClick={simulateMessage}
                      disabled={loading || !simulateText}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Envoyer (Simuler)
                    </Button>
                  </div>

                  {/* Example messages */}
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium text-slate-600 mb-2">Exemples de messages :</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "J'ai besoin d'un plombier à Dakar Ouakam urgement",
                        "Électricien à Pikine pour panne de courant",
                        "Climatiseur en panne à Thiès Nord",
                        "Cherche menuisier pour armoire au Plateau"
                      ].map((msg, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          onClick={() => setSimulateText(msg)}
                          className="text-xs"
                        >
                          {msg.substring(0, 30)}...
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
                    Analyse par GPT-4o-mini (simule OpenClaw)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {simulateResult ? (
                    <div className="space-y-4">
                      {simulateResult.error ? (
                        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
                          Erreur: {simulateResult.error}
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
                              <h4 className="font-medium text-slate-700">Données extraites :</h4>
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
                                <span className="text-slate-500 text-sm">Résumé:</span>
                                <p className="text-sm font-medium mt-1">{simulateResult.parsed.short_summary}</p>
                              </div>
                              <div className="p-2 bg-slate-50 rounded">
                                <span className="text-slate-500 text-sm">Prêt pour matching:</span>
                                <span className="ml-2">
                                  {simulateResult.parsed.ready_for_matching ? '✅ Oui' : '❌ Non'}
                                </span>
                              </div>
                              {simulateResult.parsed.missing_information?.length > 0 && (
                                <div className="p-2 bg-yellow-50 rounded">
                                  <span className="text-yellow-700 text-sm">Infos manquantes:</span>
                                  <p className="text-sm mt-1">{simulateResult.parsed.missing_information.join(', ')}</p>
                                </div>
                              )}
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

            {/* WhatsApp Messages Log */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-green-600" />
                  Messages WhatsApp (MOCKÉS)
                </CardTitle>
                <CardDescription>
                  Historique des messages envoyés (simulation - pas de vraie API WhatsApp)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  {whatsappMessages.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">Aucun message envoyé</p>
                  ) : (
                    <div className="space-y-3">
                      {whatsappMessages.slice().reverse().map((msg, i) => (
                        <div key={i} className="p-3 bg-green-50 rounded-lg border border-green-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-green-800">→ {msg.to}</span>
                            <Badge variant="outline" className="text-xs">MOCK</Badge>
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

          {/* PROVIDERS TAB */}
          <TabsContent value="providers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Prestataires ({providers.length})
                </CardTitle>
                <CardDescription>
                  Liste des prestataires enregistrés sur la plateforme
                </CardDescription>
              </CardHeader>
              <CardContent>
                {providers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p className="text-slate-500">Aucun prestataire. Cliquez sur "Initialiser DB" pour ajouter des données de test.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {providers.map((provider) => (
                      <Card key={provider.id} className="border shadow-sm hover:shadow-md transition-shadow">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-slate-800">{provider.businessName}</h3>
                            {provider.isVerified && (
                              <Badge className="bg-blue-100 text-blue-700">Vérifié</Badge>
                            )}
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
                              <span>{provider.rating?.toFixed(1) || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Phone className="w-4 h-4" />
                              <span>{provider.whatsappNumber}</span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-slate-500">Zones: {provider.zones?.join(', ') || '-'}</p>
                          </div>
                          <div className="mt-2">
                            <Badge className={provider.isAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                              {provider.isAvailable ? 'Disponible' : 'Indisponible'}
                            </Badge>
                          </div>
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
                <CardDescription>
                  Historique des demandes de services créées via WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent>
                {requests.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p className="text-slate-500">Aucune demande. Utilisez le simulateur WhatsApp pour créer des demandes.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {requests.map((req) => (
                      <Card key={req.id} className="border shadow-sm">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-slate-800 capitalize">{req.serviceCategory}</h3>
                              <p className="text-xs text-slate-500">ID: {req.id}</p>
                            </div>
                            {getStatusBadge(req.status)}
                          </div>
                          <p className="text-sm text-slate-700 mb-3 p-2 bg-slate-50 rounded">
                            {req.normalizedText || req.rawMessage}
                          </p>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="flex items-center gap-1 text-slate-600">
                              <MapPin className="w-4 h-4" />
                              <span>{req.city || '-'}</span>
                            </div>
                            <div className="flex items-center gap-1 text-slate-600">
                              <span className="text-slate-500">Zone:</span>
                              <span>{req.zone || '-'}</span>
                            </div>
                            <div className="flex items-center gap-1 text-slate-600">
                              <span className="text-slate-500">Urgence:</span>
                              <span className="capitalize">{req.urgency || '-'}</span>
                            </div>
                          </div>
                          <Separator className="my-3" />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {req.matches?.length || 0} match(es)
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                Source: {req.source}
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
              <span className="font-semibold text-slate-700">Wooleen</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>WhatsApp: MOCKÉ</span>
              <span>•</span>
              <span>IA: GPT-4o-mini</span>
              <span>•</span>
              <span>DB: MongoDB</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}