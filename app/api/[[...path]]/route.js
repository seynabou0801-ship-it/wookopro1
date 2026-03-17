import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'

// MongoDB connection
let client = null
let db = null

async function connectToMongo() {
  try {
    if (!client || !db) {
      client = new MongoClient(process.env.MONGO_URL)
      await client.connect()
      db = client.db(process.env.DB_NAME || 'wooleen_marketplace')
      console.log('MongoDB connected successfully')
    }
    return db
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

// Helper function to handle CORS
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// ============ OpenAI GPT Integration (simulates OpenClaw) ============
const SYSTEM_PROMPT = `Tu es un agent IA de dispatch et de mise en relation pour une marketplace de services locaux au Sénégal.
Extrais les informations suivantes du message:
- service_category: plombier, electricien, mecanicien, developpeur, consultant, technicien, menuisier, climatiseur, peintre, serrurier, demenagement, nettoyage, ou autre
- city: la ville (ex: Dakar, Thiès, Saint-Louis, etc.)
- zone: le quartier ou zone spécifique
- urgency: faible, normale, urgente, ou immediate
- short_summary: résumé court de la demande
- missing_information: liste des informations manquantes
- language: fr ou wo (wolof)
- ready_for_matching: true si on a assez d'infos, false sinon

Réponds UNIQUEMENT en JSON valide, sans texte supplémentaire.`

// Smart local parsing as fallback (simulates OpenClaw AI)
function parseLocally(message) {
  const lowerMsg = message.toLowerCase()
  
  // Service categories detection
  const categories = {
    plombier: ['plombier', 'plomberie', 'fuite', 'douche', 'robinet', 'tuyau', 'wc', 'toilette', 'évier', 'canalisation'],
    electricien: ['électricien', 'electricien', 'électrique', 'electrique', 'courant', 'prise', 'lumière', 'ampoule', 'disjoncteur'],
    climatiseur: ['climatiseur', 'clim', 'climatisation', 'froid', 'chaud', 'ventilation', 'ac'],
    menuisier: ['menuisier', 'menuiserie', 'bois', 'meuble', 'armoire', 'porte', 'fenêtre', 'étagère'],
    peintre: ['peintre', 'peinture', 'peindre', 'mur', 'plafond'],
    serrurier: ['serrurier', 'serrure', 'clé', 'clef', 'porte bloquée', 'verrou'],
    nettoyage: ['nettoyage', 'nettoyer', 'ménage', 'propre', 'entretien'],
    mecanicien: ['mécanicien', 'mecanicien', 'voiture', 'auto', 'moteur', 'panne auto'],
    demenagement: ['déménagement', 'demenagement', 'déménager', 'demenager', 'transport'],
    technicien: ['technicien', 'ordinateur', 'informatique', 'réparation', 'appareil']
  }
  
  let detectedCategory = 'autre'
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lowerMsg.includes(kw))) {
      detectedCategory = cat
      break
    }
  }
  
  // City detection
  const cities = ['dakar', 'thiès', 'thies', 'saint-louis', 'saint louis', 'kaolack', 'ziguinchor', 'touba', 'mbour', 'rufisque']
  let detectedCity = ''
  for (const city of cities) {
    if (lowerMsg.includes(city)) {
      detectedCity = city.charAt(0).toUpperCase() + city.slice(1).replace('-', '-').replace('thies', 'Thiès')
      if (detectedCity.toLowerCase() === 'thies') detectedCity = 'Thiès'
      break
    }
  }
  
  // Zone detection (Dakar neighborhoods)
  const zones = ['ouakam', 'mermoz', 'yoff', 'almadies', 'ngor', 'pikine', 'guédiawaye', 'guediawaye', 'parcelles', 'médina', 'medina', 'plateau', 'fann', 'sacré-coeur', 'sacre-coeur', 'liberté', 'liberte', 'grand dakar', 'thiès nord', 'thies nord', 'thiès sud', 'thies sud']
  let detectedZone = ''
  for (const zone of zones) {
    if (lowerMsg.includes(zone)) {
      detectedZone = zone.charAt(0).toUpperCase() + zone.slice(1)
      break
    }
  }
  
  // Urgency detection
  let urgency = 'normale'
  if (lowerMsg.includes('urgent') || lowerMsg.includes('urgence') || lowerMsg.includes('urgement') || lowerMsg.includes('immédiat') || lowerMsg.includes('tout de suite') || lowerMsg.includes('vite') || lowerMsg.includes('rapidement')) {
    urgency = 'urgente'
  }
  if (lowerMsg.includes('très urgent') || lowerMsg.includes('maintenant') || lowerMsg.includes('immediate') || lowerMsg.includes('immédiatement')) {
    urgency = 'immediate'
  }
  
  // Check if ready for matching
  const missingInfo = []
  if (detectedCategory === 'autre') missingInfo.push('type de service')
  if (!detectedCity && !detectedZone) missingInfo.push('ville ou zone')
  
  const readyForMatching = detectedCategory !== 'autre' && (detectedCity || detectedZone)
  
  return {
    service_category: detectedCategory,
    city: detectedCity || (detectedZone ? 'Dakar' : ''),
    zone: detectedZone,
    urgency,
    short_summary: message.length > 100 ? message.substring(0, 100) + '...' : message,
    missing_information: missingInfo,
    language: 'fr',
    ready_for_matching: readyForMatching
  }
}

async function parseWithOpenAI(message) {
  // Try OpenAI API first if a valid key is configured
  const apiKey = process.env.OPENAI_API_KEY || process.env.EMERGENT_LLM_KEY
  
  // Check if we have a valid OpenAI key (not emergent proxy key)
  if (apiKey && !apiKey.startsWith('sk-emergent')) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      })

      if (response.ok) {
        const data = await response.json()
        const parsed = JSON.parse(data.choices[0].message.content)

        return {
          service_category: parsed.service_category || 'autre',
          city: parsed.city || '',
          zone: parsed.zone || '',
          urgency: parsed.urgency || 'normale',
          short_summary: parsed.short_summary || message,
          missing_information: Array.isArray(parsed.missing_information) ? parsed.missing_information : [],
          language: parsed.language || 'fr',
          ready_for_matching: Boolean(parsed.ready_for_matching)
        }
      }
    } catch (error) {
      console.error('OpenAI API error, falling back to local parsing:', error.message)
    }
  }
  
  // Fallback to smart local parsing (simulates OpenClaw)
  console.log('Using local parsing (OpenClaw simulation)')
  return parseLocally(message)
}

// ============ Matching Algorithm ============
function computeScore(provider, req) {
  let score = 0
  if (provider.serviceCategory?.toLowerCase() === req.serviceCategory?.toLowerCase()) score += 50
  if (provider.city?.toLowerCase() === req.city?.toLowerCase()) score += 20
  if (req.zone && provider.zones?.some(z => z.toLowerCase() === req.zone?.toLowerCase())) score += 15
  if (provider.isAvailable) score += 10
  if (provider.isVerified) score += 3
  score += Math.min(provider.rating || 0, 5) * 2
  return score
}

// ============ WhatsApp Mock Service ============
const whatsappMessages = [] // In-memory store for mock messages

async function sendWhatsAppMessage(to, text) {
  const message = {
    id: uuidv4(),
    to,
    text,
    status: 'sent',
    timestamp: new Date(),
    mocked: true
  }
  whatsappMessages.push(message)
  console.log(`[MOCK WhatsApp] Envoyé à ${to}: ${text.substring(0, 50)}...`)
  return { messaging_product: 'whatsapp', contacts: [{ wa_id: to }], messages: [{ id: message.id }] }
}

// ============ Request Service Functions ============
async function createServiceRequestFromParsed(db, phone, rawMessage, parsed) {
  let user = await db.collection('users').findOne({ phone })

  if (!user) {
    user = {
      id: uuidv4(),
      name: phone,
      phone,
      role: 'CLIENT',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    await db.collection('users').insertOne(user)
  }

  const request = {
    id: uuidv4(),
    clientId: user.id,
    rawMessage,
    normalizedText: parsed.short_summary,
    serviceCategory: parsed.service_category,
    city: parsed.city,
    zone: parsed.zone,
    urgency: parsed.urgency,
    status: 'MATCHING',
    source: 'whatsapp',
    createdAt: new Date(),
    updatedAt: new Date()
  }

  await db.collection('service_requests').insertOne(request)
  return request
}

async function findBestProviders(db, parsed) {
  const query = { isAvailable: true }
  if (parsed.service_category && parsed.service_category !== 'autre') {
    query.serviceCategory = { $regex: new RegExp(parsed.service_category, 'i') }
  }
  if (parsed.city) {
    query.city = { $regex: new RegExp(parsed.city, 'i') }
  }

  const providers = await db.collection('provider_profiles').find(query).toArray()

  return providers
    .map(provider => ({
      ...provider,
      score: computeScore(provider, {
        serviceCategory: parsed.service_category,
        city: parsed.city,
        zone: parsed.zone
      })
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

async function persistMatches(db, requestId, providers) {
  for (const provider of providers) {
    await db.collection('request_matches').updateOne(
      { requestId, providerId: provider.id },
      {
        $set: {
          requestId,
          providerId: provider.id,
          score: provider.score,
          status: 'SENT',
          sentAt: new Date()
        }
      },
      { upsert: true }
    )
  }
}

async function notifyClient(phone, parsed, count) {
  return sendWhatsAppMessage(
    phone,
    `Bonjour 👋\nVotre demande a bien été reçue.\n\nService : ${parsed.service_category}\nZone : ${parsed.zone || parsed.city}\nUrgence : ${parsed.urgency}\n\nNous avons trouvé ${count} prestataire(s) et lançons la mise en relation.`
  )
}

async function notifyProviders(providers, parsed) {
  for (const provider of providers) {
    await sendWhatsAppMessage(
      provider.whatsappNumber,
      `Nouvelle demande disponible\n\nService : ${parsed.service_category}\nZone : ${parsed.zone || parsed.city}\nUrgence : ${parsed.urgency}\nRésumé : ${parsed.short_summary}\n\nRépondez OUI pour accepter cette intervention.`
    )
  }
}

// ============ Route Handler ============
async function handleRoute(request, { params }) {
  const resolvedParams = await params
  const { path = [] } = resolvedParams
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    // ============ ROOT ENDPOINTS ============
    if ((route === '/root' || route === '/') && method === 'GET') {
      return handleCORS(NextResponse.json({ 
        message: 'Bienvenue sur Wooleen API',
        version: '1.0.0',
        endpoints: [
          '/api/webhooks/whatsapp',
          '/api/providers',
          '/api/requests',
          '/api/admin/stats',
          '/api/whatsapp/send',
          '/api/whatsapp/messages'
        ]
      }))
    }

    // ============ WHATSAPP WEBHOOK (MVP FOCUS) ============
    // GET /api/webhooks/whatsapp - Verification
    if (route === '/webhooks/whatsapp' && method === 'GET') {
      const url = new URL(request.url)
      const mode = url.searchParams.get('hub.mode')
      const token = url.searchParams.get('hub.verify_token')
      const challenge = url.searchParams.get('hub.challenge')

      if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 })
      }
      return handleCORS(NextResponse.json({ error: 'Invalid verify token' }, { status: 403 }))
    }

    // POST /api/webhooks/whatsapp - Receive messages
    if (route === '/webhooks/whatsapp' && method === 'POST') {
      const body = await request.json()
      const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]

      if (!message?.text?.body || !message?.from) {
        return handleCORS(NextResponse.json({ ok: true, ignored: true }))
      }

      const incomingText = String(message.text.body)
      const phone = String(message.from)

      // Parse with OpenAI (simulates OpenClaw)
      const parsed = await parseWithOpenAI(incomingText)

      if (!parsed.ready_for_matching) {
        const missing = parsed.missing_information.join(', ') || 'votre besoin'
        await sendWhatsAppMessage(phone, `Pouvez-vous préciser : ${missing} ?`)
        return handleCORS(NextResponse.json({ ok: true, clarification: true, parsed }))
      }

      const requestRecord = await createServiceRequestFromParsed(db, phone, incomingText, parsed)
      const bestProviders = await findBestProviders(db, parsed)

      await persistMatches(db, requestRecord.id, bestProviders)
      await notifyClient(phone, parsed, bestProviders.length)
      await notifyProviders(bestProviders, parsed)

      return handleCORS(NextResponse.json({ 
        ok: true, 
        requestId: requestRecord.id, 
        matched: bestProviders.length,
        parsed
      }))
    }

    // ============ WHATSAPP SEND (Mock) ============
    // POST /api/whatsapp/send
    if (route === '/whatsapp/send' && method === 'POST') {
      const body = await request.json()
      if (!body.to || !body.text) {
        return handleCORS(NextResponse.json({ error: 'to and text are required' }, { status: 400 }))
      }
      const result = await sendWhatsAppMessage(body.to, body.text)
      return handleCORS(NextResponse.json(result))
    }

    // GET /api/whatsapp/messages - View mock messages
    if (route === '/whatsapp/messages' && method === 'GET') {
      return handleCORS(NextResponse.json(whatsappMessages))
    }

    // ============ SIMULATE INCOMING MESSAGE ============
    // POST /api/simulate/message - For testing the webhook
    if (route === '/simulate/message' && method === 'POST') {
      const body = await request.json()
      const { from, text } = body

      if (!from || !text) {
        return handleCORS(NextResponse.json({ error: 'from and text are required' }, { status: 400 }))
      }

      // Simulate WhatsApp webhook payload
      const webhookPayload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from,
                text: { body: text },
                type: 'text'
              }]
            }
          }]
        }]
      }

      // Process internally
      const message = webhookPayload.entry[0].changes[0].value.messages[0]
      const incomingText = String(message.text.body)
      const phone = String(message.from)

      const parsed = await parseWithOpenAI(incomingText)

      if (!parsed.ready_for_matching) {
        const missing = parsed.missing_information.join(', ') || 'votre besoin'
        await sendWhatsAppMessage(phone, `Pouvez-vous préciser : ${missing} ?`)
        return handleCORS(NextResponse.json({ ok: true, clarification: true, parsed }))
      }

      const requestRecord = await createServiceRequestFromParsed(db, phone, incomingText, parsed)
      const bestProviders = await findBestProviders(db, parsed)

      await persistMatches(db, requestRecord.id, bestProviders)
      await notifyClient(phone, parsed, bestProviders.length)
      await notifyProviders(bestProviders, parsed)

      return handleCORS(NextResponse.json({ 
        ok: true, 
        requestId: requestRecord.id, 
        matched: bestProviders.length,
        parsed,
        whatsappMessages: whatsappMessages.slice(-10)
      }))
    }

    // ============ PROVIDERS CRUD ============
    // GET /api/providers
    if (route === '/providers' && method === 'GET') {
      const providers = await db.collection('provider_profiles')
        .aggregate([
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: 'id',
              as: 'user'
            }
          },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          { $sort: { createdAt: -1 } }
        ])
        .toArray()

      const cleanProviders = providers.map(({ _id, ...rest }) => rest)
      return handleCORS(NextResponse.json(cleanProviders))
    }

    // POST /api/providers
    if (route === '/providers' && method === 'POST') {
      const body = await request.json()
      const provider = {
        id: uuidv4(),
        ...body,
        isVerified: body.isVerified ?? false,
        isAvailable: body.isAvailable ?? true,
        rating: body.rating ?? 0,
        zones: body.zones || [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('provider_profiles').insertOne(provider)
      const { _id, ...cleanProvider } = provider
      return handleCORS(NextResponse.json(cleanProvider, { status: 201 }))
    }

    // GET /api/providers/:id
    const providerMatch = route.match(/^\/providers\/([a-zA-Z0-9-]+)$/)
    if (providerMatch && method === 'GET') {
      const id = providerMatch[1]
      const provider = await db.collection('provider_profiles').findOne({ id })
      if (!provider) {
        return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      }
      const { _id, ...clean } = provider
      return handleCORS(NextResponse.json(clean))
    }

    // PATCH /api/providers/:id
    if (providerMatch && method === 'PATCH') {
      const id = providerMatch[1]
      const body = await request.json()
      body.updatedAt = new Date()
      await db.collection('provider_profiles').updateOne({ id }, { $set: body })
      const updated = await db.collection('provider_profiles').findOne({ id })
      const { _id, ...clean } = updated
      return handleCORS(NextResponse.json(clean))
    }

    // DELETE /api/providers/:id
    if (providerMatch && method === 'DELETE') {
      const id = providerMatch[1]
      await db.collection('provider_profiles').deleteOne({ id })
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // ============ REQUESTS CRUD ============
    // GET /api/requests
    if (route === '/requests' && method === 'GET') {
      const requests = await db.collection('service_requests')
        .aggregate([
          {
            $lookup: {
              from: 'users',
              localField: 'clientId',
              foreignField: 'id',
              as: 'client'
            }
          },
          { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'request_matches',
              localField: 'id',
              foreignField: 'requestId',
              as: 'matches'
            }
          },
          { $sort: { createdAt: -1 } }
        ])
        .toArray()

      const cleanRequests = requests.map(({ _id, ...rest }) => rest)
      return handleCORS(NextResponse.json(cleanRequests))
    }

    // POST /api/requests
    if (route === '/requests' && method === 'POST') {
      const body = await request.json()
      const serviceRequest = {
        id: uuidv4(),
        ...body,
        status: body.status || 'PENDING',
        source: body.source || 'web',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('service_requests').insertOne(serviceRequest)
      const { _id, ...clean } = serviceRequest
      return handleCORS(NextResponse.json(clean, { status: 201 }))
    }

    // GET /api/requests/:id
    const requestMatch = route.match(/^\/requests\/([a-zA-Z0-9-]+)$/)
    if (requestMatch && method === 'GET') {
      const id = requestMatch[1]
      const serviceRequest = await db.collection('service_requests').findOne({ id })
      if (!serviceRequest) {
        return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      }
      const matches = await db.collection('request_matches').find({ requestId: id }).toArray()
      const { _id, ...clean } = serviceRequest
      clean.matches = matches.map(({ _id, ...m }) => m)
      return handleCORS(NextResponse.json(clean))
    }

    // PATCH /api/requests/:id
    if (requestMatch && method === 'PATCH') {
      const id = requestMatch[1]
      const body = await request.json()
      body.updatedAt = new Date()
      await db.collection('service_requests').updateOne({ id }, { $set: body })
      const updated = await db.collection('service_requests').findOne({ id })
      const { _id, ...clean } = updated
      return handleCORS(NextResponse.json(clean))
    }

    // DELETE /api/requests/:id
    if (requestMatch && method === 'DELETE') {
      const id = requestMatch[1]
      await db.collection('service_requests').deleteOne({ id })
      await db.collection('request_matches').deleteMany({ requestId: id })
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // ============ MATCH ENDPOINT ============
    // POST /api/match/:requestId
    const matchRouteMatch = route.match(/^\/match\/([a-zA-Z0-9-]+)$/)
    if (matchRouteMatch && method === 'POST') {
      const requestId = matchRouteMatch[1]
      const serviceRequest = await db.collection('service_requests').findOne({ id: requestId })

      if (!serviceRequest) {
        return handleCORS(NextResponse.json({ error: 'Request not found' }, { status: 404 }))
      }

      const parsed = {
        service_category: serviceRequest.serviceCategory,
        city: serviceRequest.city,
        zone: serviceRequest.zone || '',
        urgency: serviceRequest.urgency,
        short_summary: serviceRequest.normalizedText || serviceRequest.rawMessage,
        missing_information: [],
        language: 'fr',
        ready_for_matching: true
      }

      const providers = await findBestProviders(db, parsed)
      await persistMatches(db, requestId, providers)
      await notifyProviders(providers, parsed)

      return handleCORS(NextResponse.json({ ok: true, matched: providers.length }))
    }

    // ============ ADMIN STATS ============
    // GET /api/admin/stats
    if (route === '/admin/stats' && method === 'GET') {
      const [providers, requests, matches, activeProviders] = await Promise.all([
        db.collection('provider_profiles').countDocuments(),
        db.collection('service_requests').countDocuments(),
        db.collection('request_matches').countDocuments(),
        db.collection('provider_profiles').countDocuments({ isAvailable: true })
      ])

      return handleCORS(NextResponse.json({
        providers,
        requests,
        matches,
        activeProviders
      }))
    }

    // ============ SEED DATA ============
    // POST /api/seed
    if (route === '/seed' && method === 'POST') {
      // Create admin user
      const admin = {
        id: uuidv4(),
        name: 'Admin',
        email: 'admin@wooleen.sn',
        phone: '+221700000001',
        role: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('users').updateOne(
        { phone: admin.phone },
        { $setOnInsert: admin },
        { upsert: true }
      )

      // Create providers
      const providerData = [
        {
          name: 'Mamadou Plomberie',
          phone: '+221700000101',
          category: 'plombier',
          city: 'Dakar',
          zones: ['Ouakam', 'Mermoz', 'Yoff'],
          rating: 4.7,
          description: 'Plombier professionnel à Dakar'
        },
        {
          name: 'Samba Electricité',
          phone: '+221700000102',
          category: 'electricien',
          city: 'Dakar',
          zones: ['Pikine', 'Guédiawaye', 'Parcelles'],
          rating: 4.4,
          description: 'Electricien certifié'
        },
        {
          name: 'Thiès Froid Service',
          phone: '+221700000103',
          category: 'climatiseur',
          city: 'Thiès',
          zones: ['Thiès Nord', 'Thiès Sud'],
          rating: 4.8,
          description: 'Spécialiste climatisation'
        },
        {
          name: 'Ibrahima Menuiserie',
          phone: '+221700000104',
          category: 'menuisier',
          city: 'Dakar',
          zones: ['Médina', 'Plateau', 'Fann'],
          rating: 4.6,
          description: 'Menuisier bois et aluminium'
        },
        {
          name: 'Fatou Nettoyage Pro',
          phone: '+221700000105',
          category: 'nettoyage',
          city: 'Dakar',
          zones: ['Almadies', 'Ngor', 'Yoff'],
          rating: 4.9,
          description: 'Service de nettoyage professionnel'
        }
      ]

      for (const item of providerData) {
        const user = {
          id: uuidv4(),
          name: item.name,
          phone: item.phone,
          role: 'PROVIDER',
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        const existingUser = await db.collection('users').findOne({ phone: item.phone })
        let userId = existingUser?.id
        
        if (!existingUser) {
          await db.collection('users').insertOne(user)
          userId = user.id
        }

        const provider = {
          id: uuidv4(),
          userId,
          businessName: item.name,
          serviceCategory: item.category,
          city: item.city,
          zones: item.zones,
          rating: item.rating,
          isAvailable: true,
          isVerified: true,
          whatsappNumber: item.phone,
          description: item.description,
          createdAt: new Date(),
          updatedAt: new Date()
        }

        await db.collection('provider_profiles').updateOne(
          { userId },
          { $setOnInsert: provider },
          { upsert: true }
        )
      }

      return handleCORS(NextResponse.json({ 
        ok: true, 
        message: 'Base de données initialisée',
        seededProviders: providerData.length 
      }))
    }

    // Route not found
    return handleCORS(NextResponse.json(
      { error: `Route ${route} not found` },
      { status: 404 }
    ))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    ))
  }
}

// Export all HTTP methods
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute