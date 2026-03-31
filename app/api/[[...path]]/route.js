import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

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

// ============ OpenAI GPT Integration ============
const SYSTEM_PROMPT = `Tu es un agent IA de dispatch et de mise en relation pour Wooleen, une marketplace de services locaux au Sénégal.

Extrais les informations suivantes du message client:
- service_category: plombier, electricien, mecanicien, developpeur, consultant, technicien, menuisier, climatiseur, peintre, serrurier, demenagement, nettoyage, ou autre
- city: la ville (ex: Dakar, Thiès, Saint-Louis, Kaolack, etc.)
- zone: le quartier ou zone spécifique (ex: Ouakam, Pikine, Médina, Plateau, etc.)
- urgency: faible, normale, urgente, ou immediate
- short_summary: résumé court et clair de la demande en français
- missing_information: liste des informations manquantes pour traiter la demande
- language: fr (français) ou wo (wolof)
- ready_for_matching: true si on a suffisamment d'informations (service + localisation), false sinon

Réponds UNIQUEMENT en JSON valide, sans texte supplémentaire.`

// Smart local parsing as fallback
function parseLocally(message) {
  const lowerMsg = message.toLowerCase()
  
  const categories = {
    plombier: ['plombier', 'plomberie', 'fuite', 'douche', 'robinet', 'tuyau', 'wc', 'toilette', 'évier', 'canalisation', 'eau'],
    electricien: ['électricien', 'electricien', 'électrique', 'electrique', 'courant', 'prise', 'lumière', 'ampoule', 'disjoncteur', 'panne de courant'],
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
  
  const cities = ['dakar', 'thiès', 'thies', 'saint-louis', 'saint louis', 'kaolack', 'ziguinchor', 'touba', 'mbour', 'rufisque']
  let detectedCity = ''
  for (const city of cities) {
    if (lowerMsg.includes(city)) {
      detectedCity = city.charAt(0).toUpperCase() + city.slice(1)
      if (detectedCity.toLowerCase() === 'thies') detectedCity = 'Thiès'
      break
    }
  }
  
  const zones = ['ouakam', 'mermoz', 'yoff', 'almadies', 'ngor', 'pikine', 'guédiawaye', 'guediawaye', 'parcelles', 'médina', 'medina', 'plateau', 'fann', 'sacré-coeur', 'sacre-coeur', 'liberté', 'liberte', 'grand dakar', 'thiès nord', 'thies nord', 'thiès sud', 'thies sud']
  let detectedZone = ''
  for (const zone of zones) {
    if (lowerMsg.includes(zone)) {
      detectedZone = zone.charAt(0).toUpperCase() + zone.slice(1)
      break
    }
  }
  
  let urgency = 'normale'
  if (lowerMsg.includes('urgent') || lowerMsg.includes('urgence') || lowerMsg.includes('urgement') || lowerMsg.includes('immédiat') || lowerMsg.includes('tout de suite') || lowerMsg.includes('vite') || lowerMsg.includes('rapidement')) {
    urgency = 'urgente'
  }
  if (lowerMsg.includes('très urgent') || lowerMsg.includes('maintenant') || lowerMsg.includes('immediate') || lowerMsg.includes('immédiatement')) {
    urgency = 'immediate'
  }
  
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
    ready_for_matching: readyForMatching,
    ai_source: 'local'
  }
}

async function parseWithOpenAI(message) {
  const apiKey = process.env.OPENAI_API_KEY
  
  if (apiKey && apiKey.startsWith('sk-')) {
    try {
      console.log('Using OpenAI GPT-4o-mini for parsing...')
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
        console.log('OpenAI parsing successful:', parsed)

        return {
          service_category: parsed.service_category || 'autre',
          city: parsed.city || '',
          zone: parsed.zone || '',
          urgency: parsed.urgency || 'normale',
          short_summary: parsed.short_summary || message,
          missing_information: Array.isArray(parsed.missing_information) ? parsed.missing_information : [],
          language: parsed.language || 'fr',
          ready_for_matching: Boolean(parsed.ready_for_matching),
          ai_source: 'openai'
        }
      } else {
        const error = await response.text()
        console.error('OpenAI API error:', error)
      }
    } catch (error) {
      console.error('OpenAI API error, falling back to local parsing:', error.message)
    }
  }
  
  console.log('Using local parsing (fallback)')
  return parseLocally(message)
}

// ============ Improved Matching Algorithm ============
function computeScore(provider, req) {
  let score = 0
  let reasons = []
  
  // Category match (highest weight)
  if (provider.serviceCategory?.toLowerCase() === req.serviceCategory?.toLowerCase()) {
    score += 50
    reasons.push('Même catégorie')
  }
  
  // City match
  if (provider.city?.toLowerCase() === req.city?.toLowerCase()) {
    score += 20
    reasons.push('Même ville')
  }
  
  // Zone match (bonus if provider covers the specific zone)
  if (req.zone && provider.zones?.some(z => z.toLowerCase() === req.zone?.toLowerCase())) {
    score += 15
    reasons.push('Zone couverte')
  }
  
  // Availability bonus
  if (provider.isAvailable) {
    score += 10
    reasons.push('Disponible')
  } else {
    score -= 20 // Penalty for unavailable
  }
  
  // Verification bonus
  if (provider.isVerified) {
    score += 5
    reasons.push('Vérifié')
  }
  
  // Rating bonus (up to 10 points)
  const ratingBonus = Math.min(provider.rating || 0, 5) * 2
  score += ratingBonus
  if (ratingBonus > 0) {
    reasons.push(`Note ${provider.rating?.toFixed(1)}`)
  }
  
  // Tier bonus (for future monetization)
  if (provider.tier === 'premium') {
    score += 8
    reasons.push('Premium')
  } else if (provider.tier === 'pro') {
    score += 4
    reasons.push('Pro')
  }
  
  // Response rate bonus
  if (provider.responseRate && provider.responseRate > 80) {
    score += 5
    reasons.push('Réactif')
  }
  
  return { score: Math.max(0, score), reason: reasons.join(', ') || 'Correspondance partielle' }
}

// ============ WhatsApp Service ============
const whatsappMessages = []

async function sendWhatsAppMessage(to, text, db = null) {
  const message = {
    id: uuidv4(),
    to,
    text,
    status: 'sent',
    timestamp: new Date(),
    mocked: !process.env.WHATSAPP_TOKEN
  }
  
  whatsappMessages.push(message)
  
  if (db) {
    try {
      await db.collection('whatsapp_messages').insertOne(message)
    } catch (e) {
      console.error('Error storing WhatsApp message:', e)
    }
  }
  
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to.replace(/[^\d]/g, ''),
            type: 'text',
            text: { preview_url: false, body: text }
          })
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        message.mocked = false
        message.waMessageId = data.messages?.[0]?.id
        console.log(`[WhatsApp REAL] Envoyé à ${to}`)
        return data
      } else {
        const error = await response.text()
        console.error('[WhatsApp ERROR]', error)
      }
    } catch (error) {
      console.error('[WhatsApp ERROR]', error.message)
    }
  }
  
  console.log(`[WhatsApp MOCK] Envoyé à ${to}: ${text.substring(0, 50)}...`)
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
    clientPhone: phone,
    rawMessage,
    normalizedText: parsed.short_summary,
    serviceCategory: parsed.service_category,
    city: parsed.city,
    zone: parsed.zone,
    urgency: parsed.urgency,
    status: 'MATCHING',
    source: 'whatsapp',
    aiSource: parsed.ai_source || 'local',
    createdAt: new Date(),
    updatedAt: new Date()
  }

  await db.collection('service_requests').insertOne(request)
  return request
}

async function findBestProviders(db, parsed) {
  // Build query with improved filtering
  const query = { isAvailable: true }
  
  if (parsed.service_category && parsed.service_category !== 'autre') {
    query.serviceCategory = { $regex: new RegExp(parsed.service_category, 'i') }
  }
  
  // City or zone matching
  if (parsed.city || parsed.zone) {
    query.$or = []
    if (parsed.city) {
      query.$or.push({ city: { $regex: new RegExp(parsed.city, 'i') } })
    }
    if (parsed.zone) {
      query.$or.push({ zones: { $elemMatch: { $regex: new RegExp(parsed.zone, 'i') } } })
    }
    // Fallback: if no direct match, get all providers in category
    if (query.$or.length === 0) delete query.$or
  }

  const providers = await db.collection('provider_profiles').find(query).toArray()
  
  // If no providers found with strict criteria, relax and try category only
  if (providers.length === 0 && parsed.service_category !== 'autre') {
    const relaxedProviders = await db.collection('provider_profiles').find({
      serviceCategory: { $regex: new RegExp(parsed.service_category, 'i') },
      isAvailable: true
    }).toArray()
    
    return relaxedProviders
      .map(provider => {
        const { score, reason } = computeScore(provider, {
          serviceCategory: parsed.service_category,
          city: parsed.city,
          zone: parsed.zone
        })
        return { ...provider, score, reason: reason + ' (élargi)' }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }

  return providers
    .map(provider => {
      const { score, reason } = computeScore(provider, {
        serviceCategory: parsed.service_category,
        city: parsed.city,
        zone: parsed.zone
      })
      return { ...provider, score, reason }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

async function persistMatches(db, requestId, providers) {
  for (const provider of providers) {
    await db.collection('request_matches').updateOne(
      { requestId, providerId: provider.id },
      {
        $set: {
          id: uuidv4(),
          requestId,
          providerId: provider.id,
          providerName: provider.businessName,
          providerPhone: provider.whatsappNumber,
          score: provider.score,
          reason: provider.reason,
          status: 'SENT',
          sentAt: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    )
  }
  
  // Track lead for monetization
  await db.collection('lead_events').insertOne({
    id: uuidv4(),
    requestId,
    providersNotified: providers.length,
    timestamp: new Date()
  })
}

async function notifyClient(db, phone, parsed, count) {
  const text = `Bonjour 👋\nVotre demande a bien été reçue sur Wooleen.\n\n` +
    `Service : ${parsed.service_category}\n` +
    `Zone : ${parsed.zone || parsed.city}\n` +
    `Urgence : ${parsed.urgency}\n\n` +
    `Nous avons trouvé ${count} prestataire(s) et lançons la mise en relation.\n\n` +
    `Vous recevrez bientôt des propositions.`
  return sendWhatsAppMessage(phone, text, db)
}

async function notifyProviders(db, providers, parsed, requestId) {
  for (const provider of providers) {
    const text = `🔔 Nouvelle demande Wooleen\n\n` +
      `Service : ${parsed.service_category}\n` +
      `Zone : ${parsed.zone || parsed.city}\n` +
      `Urgence : ${parsed.urgency}\n` +
      `Résumé : ${parsed.short_summary}\n\n` +
      `Score matching : ${provider.score}\n` +
      `Motif : ${provider.reason}\n\n` +
      `📲 Répondez OUI pour accepter ou NON pour refuser.\n` +
      `Ref: ${requestId.substring(0, 8)}`
    await sendWhatsAppMessage(provider.whatsappNumber, text, db)
  }
}

// ============ Handle Provider Response ============
async function handleProviderResponse(db, fromPhone, messageText, requestRef) {
  const lowerText = messageText.toLowerCase().trim()
  const isAccept = lowerText === 'oui' || lowerText.startsWith('oui ')
  const isDecline = lowerText === 'non' || lowerText.startsWith('non ')
  
  if (!isAccept && !isDecline) return null
  
  const provider = await db.collection('provider_profiles').findOne({ 
    whatsappNumber: { $regex: new RegExp(fromPhone.replace(/[^\d]/g, '').slice(-9)) }
  })
  
  if (!provider) return null
  
  let match = null
  if (requestRef) {
    match = await db.collection('request_matches').findOne({
      providerId: provider.id,
      requestId: { $regex: new RegExp('^' + requestRef) }
    })
  }
  
  if (!match) {
    match = await db.collection('request_matches').findOne(
      { providerId: provider.id, status: 'SENT' },
      { sort: { sentAt: -1 } }
    )
  }
  
  if (!match) return null
  
  const newStatus = isAccept ? 'ACCEPTED' : 'DECLINED'
  
  await db.collection('request_matches').updateOne(
    { _id: match._id },
    { $set: { status: newStatus, respondedAt: new Date(), updatedAt: new Date() } }
  )
  
  const request = await db.collection('service_requests').findOne({ id: match.requestId })
  
  if (isAccept && request) {
    await db.collection('service_requests').updateOne(
      { id: match.requestId },
      { $set: { status: 'ASSIGNED', assignedProviderId: provider.id, updatedAt: new Date() } }
    )
    
    // Track conversion for monetization
    await db.collection('lead_events').insertOne({
      id: uuidv4(),
      type: 'CONVERSION',
      requestId: match.requestId,
      providerId: provider.id,
      timestamp: new Date()
    })
    
    if (request.clientPhone) {
      await sendWhatsAppMessage(
        request.clientPhone,
        `✅ Bonne nouvelle !\n\n` +
        `Le prestataire "${provider.businessName}" a accepté votre demande.\n\n` +
        `📞 Contact : ${provider.whatsappNumber}\n\n` +
        `Il vous contactera très bientôt.`,
        db
      )
    }
    
    await sendWhatsAppMessage(
      provider.whatsappNumber,
      `✅ Demande acceptée !\n\n` +
      `Vous êtes maintenant en charge de cette intervention.\n\n` +
      `📞 Client : ${request.clientPhone}\n` +
      `📍 Zone : ${request.zone || request.city}\n\n` +
      `Contactez le client rapidement.`,
      db
    )
  } else if (isDecline) {
    await sendWhatsAppMessage(
      provider.whatsappNumber,
      `❌ Demande refusée.\n\nVous recevrez d'autres opportunités bientôt.`,
      db
    )
  }
  
  return { status: newStatus, providerId: provider.id, requestId: match.requestId }
}

// ============ Route Handler ============
async function handleRoute(request, { params }) {
  const resolvedParams = await params
  const { path = [] } = resolvedParams
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    // ============ ROOT ============
    if ((route === '/root' || route === '/') && method === 'GET') {
      return handleCORS(NextResponse.json({ 
        message: 'Bienvenue sur Wooleen API',
        version: '2.1.0',
        features: ['Lead capture', 'OpenAI GPT parsing', 'Improved matching', 'Monetization ready']
      }))
    }

    // ============ LEAD CAPTURE (NEW) ============
    if (route === '/leads' && method === 'POST') {
      const body = await request.json()
      const { serviceCategory, city, phone, description, source } = body
      
      // Create or find user
      let user = await db.collection('users').findOne({ 
        phone: { $regex: new RegExp(phone?.replace(/[^\d]/g, '').slice(-9) || '') }
      })
      
      if (!user && phone) {
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
      
      // Create lead record
      const lead = {
        id: uuidv4(),
        userId: user?.id,
        serviceCategory: serviceCategory || 'autre',
        city: city || '',
        phone: phone || '',
        description: description || '',
        source: source || 'web',
        status: 'NEW',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      await db.collection('leads').insertOne(lead)
      
      // Also create a service request for tracking
      const serviceRequest = {
        id: uuidv4(),
        clientId: user?.id,
        clientPhone: phone,
        rawMessage: description || `Demande de ${serviceCategory} à ${city}`,
        normalizedText: description || `Demande de ${serviceCategory} à ${city}`,
        serviceCategory: serviceCategory || 'autre',
        city: city || '',
        zone: '',
        urgency: 'normale',
        status: 'PENDING',
        source: source || 'homepage_form',
        leadId: lead.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      await db.collection('service_requests').insertOne(serviceRequest)
      
      // Find and notify matching providers in background
      const parsed = {
        service_category: serviceCategory || 'autre',
        city: city || '',
        zone: '',
        urgency: 'normale',
        short_summary: description || `Demande de ${serviceCategory}`
      }
      
      const providers = await findBestProviders(db, parsed)
      
      if (providers.length > 0) {
        await persistMatches(db, serviceRequest.id, providers)
        await db.collection('service_requests').updateOne(
          { id: serviceRequest.id },
          { $set: { status: 'MATCHING', matchedCount: providers.length } }
        )
      }
      
      return handleCORS(NextResponse.json({
        success: true,
        leadId: lead.id,
        requestId: serviceRequest.id,
        matchedProviders: providers.length
      }))
    }

    // ============ AUTHENTICATION ============
    if (route === '/auth/provider/login' && method === 'POST') {
      const body = await request.json()
      const { phone, password } = body
      
      if (!phone || !password) {
        return handleCORS(NextResponse.json({ error: 'Phone et password requis' }, { status: 400 }))
      }
      
      const user = await db.collection('users').findOne({ 
        phone: { $regex: new RegExp(phone.replace(/[^\d]/g, '').slice(-9)) },
        role: 'PROVIDER'
      })
      
      if (!user) {
        return handleCORS(NextResponse.json({ error: 'Prestataire non trouvé' }, { status: 401 }))
      }
      
      if (user.passwordHash) {
        const validPassword = await bcrypt.compare(password, user.passwordHash)
        if (!validPassword) {
          return handleCORS(NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 }))
        }
      } else {
        if (password !== 'wooleen2025') {
          return handleCORS(NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 }))
        }
      }
      
      const provider = await db.collection('provider_profiles').findOne({ userId: user.id })
      const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64')
      
      return handleCORS(NextResponse.json({
        success: true,
        token,
        user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
        provider: provider ? {
          id: provider.id,
          businessName: provider.businessName,
          serviceCategory: provider.serviceCategory,
          city: provider.city,
          isAvailable: provider.isAvailable,
          rating: provider.rating,
          tier: provider.tier || 'free'
        } : null
      }))
    }

    if (route === '/auth/provider/register' && method === 'POST') {
      const body = await request.json()
      const { phone, password, businessName, serviceCategory, city } = body
      
      if (!phone || !password || !businessName || !serviceCategory || !city) {
        return handleCORS(NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 }))
      }
      
      const existingUser = await db.collection('users').findOne({ 
        phone: { $regex: new RegExp(phone.replace(/[^\d]/g, '').slice(-9)) }
      })
      
      if (existingUser) {
        return handleCORS(NextResponse.json({ error: 'Ce numéro est déjà enregistré' }, { status: 400 }))
      }
      
      const passwordHash = await bcrypt.hash(password, 10)
      const user = {
        id: uuidv4(),
        name: businessName,
        phone,
        role: 'PROVIDER',
        passwordHash,
        city,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('users').insertOne(user)
      
      const provider = {
        id: uuidv4(),
        userId: user.id,
        businessName,
        serviceCategory,
        city,
        zones: [],
        rating: 0,
        responseRate: 0,
        isAvailable: true,
        isVerified: false,
        tier: 'free', // For monetization: free, pro, premium
        whatsappNumber: phone,
        description: `${serviceCategory} à ${city}`,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('provider_profiles').insertOne(provider)
      
      const token = Buffer.from(`${user.id}:${user.role}:${Date.now()}`).toString('base64')
      
      return handleCORS(NextResponse.json({
        success: true,
        token,
        user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
        provider: {
          id: provider.id,
          businessName: provider.businessName,
          serviceCategory: provider.serviceCategory,
          city: provider.city,
          isAvailable: provider.isAvailable,
          tier: provider.tier
        }
      }))
    }

    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json()
      const { phone, password } = body
      
      if (!phone || !password) {
        return handleCORS(NextResponse.json({ error: 'Phone et password requis' }, { status: 400 }))
      }
      
      const user = await db.collection('users').findOne({ 
        phone: { $regex: new RegExp(phone.replace(/[^\d]/g, '').slice(-9)) }
      })
      
      if (!user) {
        return handleCORS(NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 401 }))
      }
      
      if (user.passwordHash) {
        const validPassword = await bcrypt.compare(password, user.passwordHash)
        if (!validPassword) {
          return handleCORS(NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 }))
        }
      } else {
        if (password !== 'wooleen2025') {
          return handleCORS(NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 }))
        }
      }
      
      let provider = null
      if (user.role === 'PROVIDER') {
        provider = await db.collection('provider_profiles').findOne({ userId: user.id })
      }
      
      const token = Buffer.from(`${user.id}:${user.role}:${Date.now()}`).toString('base64')
      
      return handleCORS(NextResponse.json({
        success: true,
        token,
        user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
        provider: provider ? {
          id: provider.id,
          businessName: provider.businessName,
          serviceCategory: provider.serviceCategory,
          city: provider.city,
          isAvailable: provider.isAvailable,
          tier: provider.tier || 'free'
        } : null
      }))
    }

    // ============ PROVIDER DASHBOARD ============
    const providerDashMatch = route.match(/^\/provider\/dashboard\/([a-zA-Z0-9-]+)$/)
    if (providerDashMatch && method === 'GET') {
      const providerId = providerDashMatch[1]
      
      const provider = await db.collection('provider_profiles').findOne({ id: providerId })
      if (!provider) {
        return handleCORS(NextResponse.json({ error: 'Provider not found' }, { status: 404 }))
      }
      
      const matches = await db.collection('request_matches')
        .find({ providerId })
        .sort({ sentAt: -1 })
        .limit(20)
        .toArray()
      
      const requestIds = matches.map(m => m.requestId)
      const requests = await db.collection('service_requests')
        .find({ id: { $in: requestIds } })
        .toArray()
      
      const requestMap = {}
      requests.forEach(r => { requestMap[r.id] = r })
      
      const enrichedMatches = matches.map(m => ({
        ...m,
        request: requestMap[m.requestId] || null
      }))
      
      const stats = {
        totalLeads: matches.length,
        pending: matches.filter(m => m.status === 'SENT').length,
        accepted: matches.filter(m => m.status === 'ACCEPTED').length,
        declined: matches.filter(m => m.status === 'DECLINED').length,
        responseRate: matches.length > 0 
          ? Math.round((matches.filter(m => m.status !== 'SENT').length / matches.length) * 100)
          : 0
      }
      
      const { _id, ...cleanProvider } = provider
      
      return handleCORS(NextResponse.json({
        provider: cleanProvider,
        matches: enrichedMatches.map(({ _id, ...m }) => m),
        stats
      }))
    }

    const availMatch = route.match(/^\/provider\/([a-zA-Z0-9-]+)\/availability$/)
    if (availMatch && method === 'PATCH') {
      const providerId = availMatch[1]
      const body = await request.json()
      
      await db.collection('provider_profiles').updateOne(
        { id: providerId },
        { $set: { isAvailable: Boolean(body.isAvailable), updatedAt: new Date() } }
      )
      
      const updated = await db.collection('provider_profiles').findOne({ id: providerId })
      const { _id, ...clean } = updated
      return handleCORS(NextResponse.json(clean))
    }

    const respondMatch = route.match(/^\/provider\/([a-zA-Z0-9-]+)\/respond$/)
    if (respondMatch && method === 'POST') {
      const providerId = respondMatch[1]
      const body = await request.json()
      const { matchId, response: resp } = body
      
      if (!matchId || !resp) {
        return handleCORS(NextResponse.json({ error: 'matchId and response required' }, { status: 400 }))
      }
      
      const isAccept = resp.toLowerCase() === 'accept' || resp.toLowerCase() === 'oui'
      const newStatus = isAccept ? 'ACCEPTED' : 'DECLINED'
      
      const match = await db.collection('request_matches').findOne({ 
        requestId: matchId, 
        providerId 
      })
      
      if (!match) {
        return handleCORS(NextResponse.json({ error: 'Match not found' }, { status: 404 }))
      }
      
      await db.collection('request_matches').updateOne(
        { requestId: matchId, providerId },
        { $set: { status: newStatus, respondedAt: new Date(), updatedAt: new Date() } }
      )
      
      const provider = await db.collection('provider_profiles').findOne({ id: providerId })
      const serviceRequest = await db.collection('service_requests').findOne({ id: matchId })
      
      if (isAccept && serviceRequest) {
        await db.collection('service_requests').updateOne(
          { id: matchId },
          { $set: { status: 'ASSIGNED', assignedProviderId: providerId, updatedAt: new Date() } }
        )
        
        // Track conversion
        await db.collection('lead_events').insertOne({
          id: uuidv4(),
          type: 'CONVERSION',
          requestId: matchId,
          providerId,
          timestamp: new Date()
        })
        
        if (serviceRequest.clientPhone && provider) {
          await sendWhatsAppMessage(
            serviceRequest.clientPhone,
            `✅ Bonne nouvelle !\n\n` +
            `Le prestataire "${provider.businessName}" a accepté votre demande.\n\n` +
            `📞 Contact : ${provider.whatsappNumber}\n` +
            `⭐ Note : ${provider.rating?.toFixed(1) || 'Nouveau'}\n\n` +
            `Il vous contactera très bientôt.`,
            db
          )
        }
      }
      
      // Update provider response rate
      const allMatches = await db.collection('request_matches').find({ providerId }).toArray()
      const responded = allMatches.filter(m => m.status !== 'SENT').length
      const responseRate = allMatches.length > 0 ? Math.round((responded / allMatches.length) * 100) : 0
      await db.collection('provider_profiles').updateOne(
        { id: providerId },
        { $set: { responseRate } }
      )
      
      return handleCORS(NextResponse.json({ 
        success: true, 
        status: newStatus,
        message: isAccept ? 'Demande acceptée' : 'Demande refusée'
      }))
    }

    // ============ WHATSAPP WEBHOOK ============
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

    if (route === '/webhooks/whatsapp' && method === 'POST') {
      const body = await request.json()
      const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
      const contact = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]

      if (!message?.text?.body || !message?.from) {
        return handleCORS(NextResponse.json({ ok: true, ignored: true }))
      }

      const incomingText = String(message.text.body)
      const phone = String(message.from)
      const fromName = contact?.profile?.name || null

      await db.collection('whatsapp_inbound').insertOne({
        id: uuidv4(),
        waMessageId: message.id,
        fromPhone: phone,
        fromName,
        body: incomingText,
        rawJson: body,
        createdAt: new Date()
      })

      const lowerText = incomingText.toLowerCase().trim()
      if (lowerText === 'oui' || lowerText === 'non' || lowerText.startsWith('oui ') || lowerText.startsWith('non ')) {
        const refMatch = incomingText.match(/Ref:\s*([a-zA-Z0-9]+)/i)
        const requestRef = refMatch ? refMatch[1] : null
        
        const result = await handleProviderResponse(db, phone, incomingText, requestRef)
        if (result) {
          return handleCORS(NextResponse.json({ ok: true, providerResponse: result }))
        }
      }

      const parsed = await parseWithOpenAI(incomingText)

      if (!parsed.ready_for_matching) {
        const missing = parsed.missing_information.join(', ') || 'votre besoin'
        await sendWhatsAppMessage(phone, `Merci pour votre message.\n\nPouvez-vous préciser : ${missing} ?\n\nExemple: "J'ai besoin d'un plombier à Dakar Ouakam"`, db)
        return handleCORS(NextResponse.json({ ok: true, clarification: true, parsed }))
      }

      const requestRecord = await createServiceRequestFromParsed(db, phone, incomingText, parsed)
      const bestProviders = await findBestProviders(db, parsed)

      await persistMatches(db, requestRecord.id, bestProviders)
      await notifyClient(db, phone, parsed, bestProviders.length)
      await notifyProviders(db, bestProviders, parsed, requestRecord.id)

      return handleCORS(NextResponse.json({ 
        ok: true, 
        requestId: requestRecord.id, 
        matched: bestProviders.length,
        parsed
      }))
    }

    // ============ WHATSAPP SEND ============
    if (route === '/whatsapp/send' && method === 'POST') {
      const body = await request.json()
      if (!body.to || !body.text) {
        return handleCORS(NextResponse.json({ error: 'to and text are required' }, { status: 400 }))
      }
      const result = await sendWhatsAppMessage(body.to, body.text, db)
      return handleCORS(NextResponse.json(result))
    }

    if (route === '/whatsapp/messages' && method === 'GET') {
      const dbMessages = await db.collection('whatsapp_messages')
        .find({})
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray()
      
      const allMessages = [...dbMessages.map(({ _id, ...m }) => m), ...whatsappMessages]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 50)
      
      return handleCORS(NextResponse.json(allMessages))
    }

    // ============ SIMULATE MESSAGE ============
    if (route === '/simulate/message' && method === 'POST') {
      const body = await request.json()
      const { from, text } = body

      if (!from || !text) {
        return handleCORS(NextResponse.json({ error: 'from and text are required' }, { status: 400 }))
      }

      const lowerText = text.toLowerCase().trim()
      if (lowerText === 'oui' || lowerText === 'non') {
        const result = await handleProviderResponse(db, from, text, null)
        if (result) {
          return handleCORS(NextResponse.json({ ok: true, providerResponse: result }))
        }
      }

      const parsed = await parseWithOpenAI(text)

      if (!parsed.ready_for_matching) {
        const missing = parsed.missing_information.join(', ') || 'votre besoin'
        await sendWhatsAppMessage(from, `Pouvez-vous préciser : ${missing} ?`, db)
        return handleCORS(NextResponse.json({ ok: true, clarification: true, parsed }))
      }

      const requestRecord = await createServiceRequestFromParsed(db, from, text, parsed)
      const bestProviders = await findBestProviders(db, parsed)

      await persistMatches(db, requestRecord.id, bestProviders)
      await notifyClient(db, from, parsed, bestProviders.length)
      await notifyProviders(db, bestProviders, parsed, requestRecord.id)

      const recentMessages = await db.collection('whatsapp_messages')
        .find({})
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray()

      return handleCORS(NextResponse.json({ 
        ok: true, 
        requestId: requestRecord.id, 
        matched: bestProviders.length,
        matchedProviders: bestProviders.map(p => ({
          id: p.id,
          businessName: p.businessName,
          score: p.score,
          reason: p.reason,
          rating: p.rating,
          tier: p.tier || 'free'
        })),
        parsed,
        whatsappMessages: [...recentMessages.map(({ _id, ...m }) => m), ...whatsappMessages.slice(-10)]
      }))
    }

    // ============ PROVIDERS CRUD ============
    if (route === '/providers' && method === 'GET') {
      const providers = await db.collection('provider_profiles')
        .aggregate([
          { $lookup: { from: 'users', localField: 'userId', foreignField: 'id', as: 'user' } },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          { $sort: { tier: -1, rating: -1, createdAt: -1 } }
        ])
        .toArray()
      return handleCORS(NextResponse.json(providers.map(({ _id, ...rest }) => rest)))
    }

    if (route === '/providers' && method === 'POST') {
      const body = await request.json()
      const provider = {
        id: uuidv4(),
        ...body,
        isVerified: body.isVerified ?? false,
        isAvailable: body.isAvailable ?? true,
        rating: body.rating ?? 0,
        responseRate: 0,
        tier: body.tier || 'free',
        zones: body.zones || [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('provider_profiles').insertOne(provider)
      const { _id, ...cleanProvider } = provider
      return handleCORS(NextResponse.json(cleanProvider, { status: 201 }))
    }

    const providerMatch = route.match(/^\/providers\/([a-zA-Z0-9-]+)$/)
    if (providerMatch && method === 'GET') {
      const id = providerMatch[1]
      const provider = await db.collection('provider_profiles').findOne({ id })
      if (!provider) return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      const { _id, ...clean } = provider
      return handleCORS(NextResponse.json(clean))
    }

    if (providerMatch && method === 'PATCH') {
      const id = providerMatch[1]
      const body = await request.json()
      body.updatedAt = new Date()
      await db.collection('provider_profiles').updateOne({ id }, { $set: body })
      const updated = await db.collection('provider_profiles').findOne({ id })
      const { _id, ...clean } = updated
      return handleCORS(NextResponse.json(clean))
    }

    if (providerMatch && method === 'DELETE') {
      const id = providerMatch[1]
      await db.collection('provider_profiles').deleteOne({ id })
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // ============ REQUESTS CRUD ============
    if (route === '/requests' && method === 'GET') {
      const requests = await db.collection('service_requests')
        .aggregate([
          { $lookup: { from: 'users', localField: 'clientId', foreignField: 'id', as: 'client' } },
          { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'request_matches', localField: 'id', foreignField: 'requestId', as: 'matches' } },
          { $sort: { createdAt: -1 } }
        ])
        .toArray()
      return handleCORS(NextResponse.json(requests.map(({ _id, ...rest }) => rest)))
    }

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

    const requestMatch = route.match(/^\/requests\/([a-zA-Z0-9-]+)$/)
    if (requestMatch && method === 'GET') {
      const id = requestMatch[1]
      const serviceRequest = await db.collection('service_requests').findOne({ id })
      if (!serviceRequest) return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      const matches = await db.collection('request_matches').find({ requestId: id }).toArray()
      const { _id, ...clean } = serviceRequest
      clean.matches = matches.map(({ _id, ...m }) => m)
      return handleCORS(NextResponse.json(clean))
    }

    if (requestMatch && method === 'PATCH') {
      const id = requestMatch[1]
      const body = await request.json()
      body.updatedAt = new Date()
      await db.collection('service_requests').updateOne({ id }, { $set: body })
      const updated = await db.collection('service_requests').findOne({ id })
      const { _id, ...clean } = updated
      return handleCORS(NextResponse.json(clean))
    }

    if (requestMatch && method === 'DELETE') {
      const id = requestMatch[1]
      await db.collection('service_requests').deleteOne({ id })
      await db.collection('request_matches').deleteMany({ requestId: id })
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // ============ MATCH ENDPOINT ============
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
        short_summary: serviceRequest.normalizedText || serviceRequest.rawMessage
      }

      const providers = await findBestProviders(db, parsed)
      await persistMatches(db, requestId, providers)
      await notifyProviders(db, providers, parsed, requestId)

      return handleCORS(NextResponse.json({ ok: true, matched: providers.length }))
    }

    // ============ ADMIN STATS ============
    if (route === '/admin/stats' && method === 'GET') {
      const [providers, requests, matches, activeProviders, pendingMatches, acceptedMatches, leads, conversions] = await Promise.all([
        db.collection('provider_profiles').countDocuments(),
        db.collection('service_requests').countDocuments(),
        db.collection('request_matches').countDocuments(),
        db.collection('provider_profiles').countDocuments({ isAvailable: true }),
        db.collection('request_matches').countDocuments({ status: 'SENT' }),
        db.collection('request_matches').countDocuments({ status: 'ACCEPTED' }),
        db.collection('leads').countDocuments(),
        db.collection('lead_events').countDocuments({ type: 'CONVERSION' })
      ])

      return handleCORS(NextResponse.json({
        providers,
        requests,
        matches,
        activeProviders,
        pendingMatches,
        acceptedMatches,
        leads,
        conversions,
        conversionRate: matches > 0 ? Math.round((conversions / matches) * 100) : 0,
        aiStatus: process.env.OPENAI_API_KEY ? 'OpenAI GPT-4o-mini' : 'Local parsing',
        whatsappStatus: process.env.WHATSAPP_TOKEN ? 'Real WhatsApp' : 'Mocked'
      }))
    }

    // ============ SEED DATA ============
    if (route === '/seed' && method === 'POST') {
      const passwordHash = await bcrypt.hash('wooleen2025', 10)
      
      const admin = {
        id: uuidv4(),
        name: 'Admin Wooleen',
        email: 'admin@wooleen.sn',
        phone: '+221700000001',
        role: 'ADMIN',
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('users').updateOne({ phone: admin.phone }, { $setOnInsert: admin }, { upsert: true })

      const categories = [
        { id: uuidv4(), name: 'Plomberie', slug: 'plombier' },
        { id: uuidv4(), name: 'Électricité', slug: 'electricien' },
        { id: uuidv4(), name: 'Climatisation', slug: 'climatiseur' },
        { id: uuidv4(), name: 'Menuiserie', slug: 'menuisier' },
        { id: uuidv4(), name: 'Nettoyage', slug: 'nettoyage' }
      ]
      
      for (const cat of categories) {
        await db.collection('categories').updateOne(
          { slug: cat.slug },
          { $setOnInsert: { ...cat, createdAt: new Date() } },
          { upsert: true }
        )
      }

      const providerData = [
        { name: 'Mamadou Plomberie', phone: '+221700000101', category: 'plombier', city: 'Dakar', zones: ['Ouakam', 'Mermoz', 'Yoff'], rating: 4.7, tier: 'premium' },
        { name: 'Samba Électricité', phone: '+221700000102', category: 'electricien', city: 'Dakar', zones: ['Pikine', 'Guédiawaye', 'Parcelles'], rating: 4.4, tier: 'pro' },
        { name: 'Thiès Froid Service', phone: '+221700000103', category: 'climatiseur', city: 'Thiès', zones: ['Thiès Nord', 'Thiès Sud'], rating: 4.8, tier: 'premium' },
        { name: 'Ibrahima Menuiserie', phone: '+221700000104', category: 'menuisier', city: 'Dakar', zones: ['Médina', 'Plateau', 'Fann'], rating: 4.6, tier: 'free' },
        { name: 'Fatou Nettoyage Pro', phone: '+221700000105', category: 'nettoyage', city: 'Dakar', zones: ['Almadies', 'Ngor', 'Yoff'], rating: 4.9, tier: 'pro' }
      ]

      for (const item of providerData) {
        const existingUser = await db.collection('users').findOne({ phone: item.phone })
        let userId = existingUser?.id
        
        if (!existingUser) {
          const user = {
            id: uuidv4(),
            name: item.name,
            phone: item.phone,
            role: 'PROVIDER',
            passwordHash,
            createdAt: new Date(),
            updatedAt: new Date()
          }
          await db.collection('users').insertOne(user)
          userId = user.id
        }

        await db.collection('provider_profiles').updateOne(
          { userId },
          {
            $setOnInsert: {
              id: uuidv4(),
              userId,
              businessName: item.name,
              serviceCategory: item.category,
              city: item.city,
              zones: item.zones,
              rating: item.rating,
              responseRate: Math.floor(Math.random() * 30) + 70,
              isAvailable: true,
              isVerified: true,
              tier: item.tier,
              whatsappNumber: item.phone,
              description: `${item.category} professionnel à ${item.city}`,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          },
          { upsert: true }
        )
      }

      return handleCORS(NextResponse.json({ 
        ok: true, 
        message: 'Base de données initialisée',
        seededProviders: providerData.length,
        defaultPassword: 'wooleen2025'
      }))
    }

    return handleCORS(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
