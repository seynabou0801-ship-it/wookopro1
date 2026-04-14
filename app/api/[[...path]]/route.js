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

// ============ SUBSCRIPTION PLANS ============
const SUBSCRIPTION_PLANS = {
  BASIC: {
    name: 'BASIC',
    price: 5000,              // 5 000 FCFA/mois
    duration: 30,             // jours
    leadsPerDay: 5,           // Max 5 demandes/jour
    categories: 1,            // 1 catégorie
    zones: 1,                 // 1 zone
    priority: 'normal',
    features: ['5 leads/jour', '1 catégorie', '1 zone']
  },
  PRO: {
    name: 'PRO',
    price: 10000,             // 10 000 FCFA/mois
    duration: 30,
    leadsPerDay: 15,          // Max 15 demandes/jour
    categories: 3,            // 3 catégories
    zones: 3,                 // 3 zones
    priority: 'high',
    features: ['15 leads/jour', '3 catégories', '3 zones', 'Priorité haute']
  },
  PREMIUM: {
    name: 'PREMIUM',
    price: 20000,             // 20 000 FCFA/mois
    duration: 30,
    leadsPerDay: -1,          // Illimité
    categories: -1,           // Toutes catégories
    zones: -1,                // Toutes zones
    priority: 'highest',
    features: ['Leads illimités', 'Toutes catégories', 'Tout Sénégal', 'Badge vérifié', 'Support prioritaire']
  }
}

const PAYMENT_PHONE = '77 338 90 95' // Numéro Wave/Orange Money
const TRIAL_PERIOD_DAYS = 7 // Période d'essai gratuite

// ============ AUTOMATIC DISPATCH SYSTEM ============
const DISPATCH_CONFIG = {
  MAX_PROVIDERS_PER_REQUEST: 3,      // Max 3 prestataires par demande
  COOLDOWN_MINUTES: 15,               // Cooldown entre notifications
  RESPONSE_TIMEOUT_MINUTES: 30,      // Timeout avant redistribution
  IGNORE_PENALTY_HOURS: 2,           // Pause si ignore 3 fois
  MIN_RESPONSE_RATE: 0.30            // 30% minimum taux réponse
}

// Fonction de matching automatique
async function dispatchRequestToProviders(db, request) {
  try {
    // 1. Trouver prestataires éligibles
    const eligibleProviders = await findEligibleProviders(db, request)
    
    if (eligibleProviders.length === 0) {
      console.log('⚠️ Aucun prestataire éligible trouvé')
      return []
    }

    // 2. Scorer et trier
    const scoredProviders = eligibleProviders
      .map(provider => ({
        ...provider,
        score: calculateProviderScore(provider, request)
      }))
      .sort((a, b) => b.score - a.score)

    // 3. Prendre top 3
    const selectedProviders = scoredProviders.slice(0, DISPATCH_CONFIG.MAX_PROVIDERS_PER_REQUEST)

    // 4. Créer matches
    const matches = []
    for (const provider of selectedProviders) {
      const match = {
        id: uuidv4(),
        requestId: request.id,
        providerId: provider.userId,
        status: 'SENT',
        sentAt: new Date(),
        score: provider.score,
        createdAt: new Date()
      }
      await db.collection('request_matches').insertOne(match)
      matches.push(match)

      // Incrémenter compteur leads reçus ce mois
      await db.collection('subscriptions').updateOne(
        { providerId: provider.userId },
        { $inc: { leadsReceivedThisMonth: 1 } }
      )

      // TODO: Envoyer notification WhatsApp
      console.log(`📨 Match créé: ${provider.businessName} pour ${request.category}`)
    }

    // 5. Mettre à jour statut demande
    await db.collection('service_requests').updateOne(
      { id: request.id },
      { 
        $set: { 
          status: 'DISPATCHED',
          dispatchedTo: selectedProviders.map(p => p.userId),
          dispatchedAt: new Date()
        } 
      }
    )

    return matches
  } catch (error) {
    console.error('Erreur dispatch:', error)
    return []
  }
}

// Trouver prestataires éligibles
async function findEligibleProviders(db, request) {
  const now = new Date()
  const cooldownTime = new Date(now.getTime() - DISPATCH_CONFIG.COOLDOWN_MINUTES * 60 * 1000)

  // Récupérer tous les prestataires avec profil
  const providers = await db.collection('provider_profiles').find({
    category: request.category,
    isAvailable: true
  }).toArray()

  const eligibleProviders = []

  for (const profile of providers) {
    // Récupérer user et abonnement
    const user = await db.collection('users').findOne({ id: profile.userId })
    if (!user) continue

    const subscription = await db.collection('subscriptions').findOne({ 
      providerId: profile.userId,
      status: { $in: ['TRIAL', 'ACTIVE'] }  // TRIAL + ACTIVE acceptés
    })

    if (!subscription) continue

    // Vérifier zone/ville
    const zoneMatch = profile.zones?.includes(request.city) || 
                      profile.city === request.city ||
                      subscription.plan === 'PREMIUM'  // PREMIUM = toutes zones

    if (!zoneMatch) continue

    // Vérifier quota leads/jour
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const leadsToday = await db.collection('request_matches').countDocuments({
      providerId: profile.userId,
      createdAt: { $gte: today }
    })

    const dailyLimit = subscription.planDetails.leadsPerDay
    if (dailyLimit !== -1 && leadsToday >= dailyLimit) {
      console.log(`⚠️ ${profile.businessName} a atteint sa limite quotidienne (${dailyLimit})`)
      continue
    }

    // Vérifier cooldown
    const lastMatch = await db.collection('request_matches').findOne(
      { providerId: profile.userId },
      { sort: { createdAt: -1 } }
    )

    if (lastMatch && new Date(lastMatch.createdAt) > cooldownTime) {
      console.log(`⏱️ ${profile.businessName} en cooldown`)
      continue
    }

    eligibleProviders.push({
      ...profile,
      subscription,
      user,
      rating: profile.rating || 4.0
    })
  }

  return eligibleProviders
}

// Calculer score prestataire
function calculateProviderScore(provider, request) {
  let score = 0

  // Priorité abonnement
  if (provider.subscription.plan === 'PREMIUM') score += 100
  else if (provider.subscription.plan === 'PRO') score += 50
  else if (provider.subscription.plan === 'BASIC') score += 10

  // Bonus période active (pas trial)
  if (provider.subscription.status === 'ACTIVE') score += 20

  // Rating
  score += (provider.rating || 4.0) * 10

  // Ancienneté abonnement
  const subscriptionDays = Math.floor(
    (new Date() - new Date(provider.subscription.createdAt)) / (1000 * 60 * 60 * 24)
  )
  score += subscriptionDays * 0.1

  // Taux de réponse (TODO: calculer depuis stats)
  // score += provider.responseRate * 30

  return Math.round(score)
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
    mocked: false
  }
  
  whatsappMessages.push(message)
  
  if (db) {
    try {
      await db.collection('whatsapp_messages').insertOne(message)
    } catch (e) {
      console.error('Error storing WhatsApp message:', e)
    }
  }
  
  // REAL WhatsApp Cloud API
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const cleanPhone = to.replace(/[^\d]/g, '')
      
      console.log(`[WhatsApp] Envoi vers ${to} (${cleanPhone})`)
      
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: { 
              preview_url: false, 
              body: text 
            }
          })
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        message.waMessageId = data.messages?.[0]?.id
        console.log(`[WhatsApp SUCCESS] Message envoyé à ${to} - ID: ${message.waMessageId}`)
        
        if (db && message.waMessageId) {
          await db.collection('whatsapp_messages').updateOne(
            { id: message.id },
            { $set: { waMessageId: message.waMessageId } }
          )
        }
        
        return data
      } else {
        const errorData = await response.json()
        console.error('[WhatsApp ERROR]', response.status, errorData)
        message.status = 'failed'
        message.error = errorData
        
        if (db) {
          await db.collection('whatsapp_messages').updateOne(
            { id: message.id },
            { $set: { status: 'failed', error: errorData } }
          )
        }
      }
    } catch (error) {
      console.error('[WhatsApp EXCEPTION]', error.message)
      message.status = 'failed'
      message.error = error.message
    }
  } else {
    console.warn('[WhatsApp] Variables manquantes: WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID')
  }
  
  return { 
    messaging_product: 'whatsapp', 
    contacts: [{ wa_id: to }], 
    messages: [{ id: message.id }],
    mocked: !process.env.WHATSAPP_ACCESS_TOKEN
  }
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
    status: 'EN_ATTENTE_VALIDATION_ADMIN',
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
      
      // ⚡ NOUVEAU : Create service request with new status flow
      const serviceRequest = {
        id: uuidv4(),
        clientId: user?.id,
        clientPhone: phone,
        category: serviceCategory || 'autre',
        city: city || '',
        zone: '',
        description: description || `Demande de ${serviceCategory} à ${city}`,
        urgency: 'normal',
        status: 'SUBMITTED',  // ⚡ Nouveau statut
        source: source || 'homepage_form',
        leadId: lead.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      await db.collection('service_requests').insertOne(serviceRequest)
      
      // ⚡ NOUVEAU : Dispatch automatique immédiat
      const matches = await dispatchRequestToProviders(db, serviceRequest)
      
      return handleCORS(NextResponse.json({
        success: true,
        leadId: lead.id,
        requestId: serviceRequest.id,
        dispatchedTo: matches.length,
        message: `Demande envoyée à ${matches.length} prestataires`
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

      // ⚡ NOUVEAU : Vérifier le statut du compte AVANT validation mot de passe
      if (user.status === 'EN_ATTENTE') {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_EN_ATTENTE',
          message: 'Votre compte est en attente de validation par l\'administrateur. Vous recevrez une notification par WhatsApp une fois votre compte activé.'
        }, { status: 403 }))
      }

      if (user.status === 'REJETE') {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_REJETE',
          message: 'Votre demande d\'inscription a été refusée. Contactez l\'administrateur pour plus d\'informations.'
        }, { status: 403 }))
      }

      // Seuls les comptes VALIDES peuvent se connecter
      if (user.status !== 'VALIDE') {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_INACTIF',
          message: 'Votre compte n\'est pas actif. Contactez l\'administrateur.'
        }, { status: 403 }))
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
      const { phone, password, businessName, serviceCategory, city, email, address } = body
      
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
        status: 'EN_ATTENTE', // ⚡ NOUVEAU : Statut en attente de validation admin
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
        isAvailable: false, // ⚡ MODIFIÉ : Désactivé par défaut
        isVerified: false,
        status: 'EN_ATTENTE', // ⚡ NOUVEAU : Statut en attente
        tier: 'free',
        whatsappNumber: phone,
        email: email || '',
        address: address || '',
        description: `${serviceCategory} à ${city}`,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('provider_profiles').insertOne(provider)
      
      // ⚡ NE PAS créer de token ni permettre auto-login
      return handleCORS(NextResponse.json({
        success: true,
        message: 'Votre demande d\'inscription a été envoyée. Vous serez notifié par WhatsApp une fois votre compte validé par l\'administrateur.',
        status: 'EN_ATTENTE'
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

    // ============ CLIENT REQUESTS ============
    if (route === '/client/requests' && method === 'POST') {
      const body = await request.json()
      const { clientId, clientPhone, serviceCategory, description, canal } = body
      
      if (!clientId || !clientPhone || !serviceCategory || !description) {
        return handleCORS(NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 }))
      }
      
      // Créer la service_request
      const serviceRequest = {
        id: uuidv4(),
        clientId,
        clientPhone,
        rawMessage: description,
        normalizedText: description,
        serviceCategory,
        city: '', // Sera extrait par l'IA plus tard si besoin
        zone: '',
        urgency: 'normale',
        status: 'EN_ATTENTE_VALIDATION_ADMIN',
        source: canal || 'whatsapp',
        canal: canal || 'whatsapp',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      await db.collection('service_requests').insertOne(serviceRequest)
      
      // Trouver et notifier les prestataires
      const parsed = {
        service_category: serviceCategory,
        city: '',
        zone: '',
        urgency: 'normale',
        short_summary: description
      }
      
      const providers = await findBestProviders(db, parsed)
      
      if (providers.length > 0) {
        await persistMatches(db, serviceRequest.id, providers)
        await notifyProviders(db, providers, parsed, serviceRequest.id)
        
        await db.collection('service_requests').updateOne(
          { id: serviceRequest.id },
          { $set: { matchedCount: providers.length } }
        )
      }
      
      return handleCORS(NextResponse.json({
        success: true,
        requestId: serviceRequest.id,
        matchedProviders: providers.length
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
      
      // MASQUER le clientPhone si la demande n'est pas validée OU si le match n'est pas ACCEPTED
      const enrichedMatches = matches.map(m => {
        const request = requestMap[m.requestId]
        const validStatuses = ['VALIDEE_PAR_ADMIN', 'ASSIGNED', 'SENT', 'MATCHING']
        const isRequestValid = request && validStatuses.includes(request.status)
        
        if (!isRequestValid || m.status !== 'ACCEPTED') {
          // Masquer le numéro du client si demande pas validée OU si match pas accepté
          const { clientPhone, ...requestWithoutPhone } = request || {}
          return {
            ...m,
            request: request ? { ...requestWithoutPhone, clientPhone: null } : null
          }
        }
        return {
          ...m,
          request: request || null
        }
      })
      
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
      const { matchId, response: resp, paymentConfirmed } = body
      
      if (!matchId || !resp) {
        return handleCORS(NextResponse.json({ error: 'matchId and response required' }, { status: 400 }))
      }
      
      const isAccept = resp.toLowerCase() === 'accept' || resp.toLowerCase() === 'accepted' || resp.toLowerCase() === 'oui'
      const newStatus = isAccept ? 'ACCEPTED' : 'DECLINED'
      
      const match = await db.collection('request_matches').findOne({ 
        id: matchId, 
        providerId 
      })
      
      if (!match) {
        return handleCORS(NextResponse.json({ error: 'Match not found' }, { status: 404 }))
      }
      
      // SÉCURITÉ : Vérifier que la demande est validée par l'admin
      const serviceRequest = await db.collection('service_requests').findOne({ id: match.requestId })
      
      if (!serviceRequest) {
        return handleCORS(NextResponse.json({ error: 'Service request not found' }, { status: 404 }))
      }
      
      if (serviceRequest.status !== 'VALIDEE_PAR_ADMIN' && serviceRequest.status !== 'ASSIGNED') {
        return handleCORS(NextResponse.json({ 
          error: 'Cette demande n\'a pas encore été validée par l\'admin',
          status: serviceRequest.status
        }, { status: 403 }))
      }

      // ⚡ NOUVEAU : Si acceptation avec confirmation de paiement manuel
      if (isAccept && paymentConfirmed) {
        // Créer un enregistrement de paiement EN ATTENTE
        const paymentId = uuidv4()
        await db.collection('match_payments').insertOne({
          id: paymentId,
          matchId,
          providerId,
          amount: 500,
          currency: 'FCFA',
          status: 'PENDING', // En attente de vérification admin
          paymentMethod: 'MANUAL_TRANSFER', // Wave/Orange Money
          transactionId: null,
          createdAt: new Date(),
          confirmedByProviderAt: new Date(),
          verifiedByAdminAt: null
        })

        // Marquer le match comme "en attente de vérification paiement"
        await db.collection('request_matches').updateOne(
          { id: matchId, providerId },
          { $set: { 
            status: 'PAYMENT_PENDING', 
            paymentStatus: 'PENDING',
            respondedAt: new Date(), 
            updatedAt: new Date() 
          } }
        )

        return handleCORS(NextResponse.json({ 
          success: true,
          message: 'Paiement en attente de vérification. Vous serez notifié une fois validé.',
          status: 'PAYMENT_PENDING'
        }))
      }

      // ⚡ Vérifier le paiement AVANT d'accepter définitivement
      if (isAccept && !paymentConfirmed) {
        const payment = await db.collection('match_payments').findOne({ 
          matchId,
          providerId,
          status: 'VERIFIED' // Doit être vérifié par l'admin
        })
        
        if (!payment) {
          return handleCORS(NextResponse.json({ 
            error: 'PAYMENT_REQUIRED',
            message: 'Vous devez effectuer le paiement de 500 FCFA',
            amount: 500
          }, { status: 402 }))
        }
      }
      
      await db.collection('request_matches').updateOne(
        { id: matchId, providerId },
        { $set: { status: newStatus, respondedAt: new Date(), updatedAt: new Date() } }
      )
      
      const provider = await db.collection('provider_profiles').findOne({ id: providerId })
      
      if (isAccept && serviceRequest) {
        await db.collection('service_requests').updateOne(
          { id: match.requestId },
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

    // ============ ADMIN ACTIONS ON REQUESTS ============
    const adminValidateMatch = route.match(/^\/admin\/requests\/([a-zA-Z0-9-]+)\/validate$/)
    if (adminValidateMatch && method === 'POST') {
      const requestId = adminValidateMatch[1]
      
      const serviceRequest = await db.collection('service_requests').findOne({ id: requestId })
      if (!serviceRequest) {
        return handleCORS(NextResponse.json({ error: 'Request not found' }, { status: 404 }))
      }
      
      // Mettre à jour le statut
      await db.collection('service_requests').updateOne(
        { id: requestId },
        { $set: { status: 'VALIDEE_PAR_ADMIN', validatedAt: new Date(), updatedAt: new Date() } }
      )
      
      // Lancer le matching maintenant que c'est validé
      const parsed = {
        service_category: serviceRequest.serviceCategory,
        city: serviceRequest.city,
        zone: serviceRequest.zone,
        urgency: serviceRequest.urgency,
        short_summary: serviceRequest.normalizedText
      }
      
      const providers = await findBestProviders(db, parsed)
      
      if (providers.length > 0) {
        await persistMatches(db, requestId, providers)
        await notifyProviders(db, providers, parsed, requestId)
      }
      
      return handleCORS(NextResponse.json({ 
        success: true, 
        status: 'VALIDEE_PAR_ADMIN',
        matchedProviders: providers.length
      }))
    }

    const adminRejectMatch = route.match(/^\/admin\/requests\/([a-zA-Z0-9-]+)\/reject$/)
    if (adminRejectMatch && method === 'POST') {
      const requestId = adminRejectMatch[1]
      
      const serviceRequest = await db.collection('service_requests').findOne({ id: requestId })
      if (!serviceRequest) {
        return handleCORS(NextResponse.json({ error: 'Request not found' }, { status: 404 }))
      }
      
      // Mettre à jour le statut
      await db.collection('service_requests').updateOne(
        { id: requestId },
        { $set: { status: 'REJETEE_PAR_ADMIN', rejectedAt: new Date(), updatedAt: new Date() } }
      )
      
      // Optionnel : notifier le client
      if (serviceRequest.clientPhone) {
        await sendWhatsAppMessage(
          serviceRequest.clientPhone,
          `Désolé, votre demande de ${serviceRequest.serviceCategory} n'a pas pu être traitée.`,
          db
        )
      }
      
      return handleCORS(NextResponse.json({ 
        success: true, 
        status: 'REJETEE_PAR_ADMIN'
      }))
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
        whatsappStatus: process.env.WHATSAPP_ACCESS_TOKEN ? 'Real WhatsApp Cloud API' : 'Mocked'
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
        { name: 'Mamadou Plomberie', phone: '+221700000101', email: 'mamadou.plomberie@wooleen.sn', address: '15 Rue de Ouakam, Dakar', category: 'plombier', city: 'Dakar', zones: ['Ouakam', 'Mermoz', 'Yoff'], rating: 4.7, tier: 'premium' },
        { name: 'Samba Électricité', phone: '+221700000102', email: 'samba.elec@wooleen.sn', address: '42 Avenue Pikine, Dakar', category: 'electricien', city: 'Dakar', zones: ['Pikine', 'Guédiawaye', 'Parcelles'], rating: 4.4, tier: 'pro' },
        { name: 'Thiès Froid Service', phone: '+221700000103', email: 'thies.froid@wooleen.sn', address: '8 Boulevard Thiès Nord, Thiès', category: 'climatiseur', city: 'Thiès', zones: ['Thiès Nord', 'Thiès Sud'], rating: 4.8, tier: 'premium' },
        { name: 'Ibrahima Menuiserie', phone: '+221700000104', email: 'ibrahima.menu@wooleen.sn', address: '23 Rue Médina, Dakar', category: 'menuisier', city: 'Dakar', zones: ['Médina', 'Plateau', 'Fann'], rating: 4.6, tier: 'free' },
        { name: 'Fatou Nettoyage Pro', phone: '+221700000105', email: 'fatou.nettoyage@wooleen.sn', address: '10 Avenue Almadies, Dakar', category: 'nettoyage', city: 'Dakar', zones: ['Almadies', 'Ngor', 'Yoff'], rating: 4.9, tier: 'pro' }
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
              email: item.email,
              address: item.address,
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

    // ⚡ ADMIN : Liste des paiements en attente
    const pendingPaymentsMatch = route.match(/^\/admin\/payments\/pending$/)
    if (pendingPaymentsMatch && method === 'GET') {
      const pendingPayments = await db.collection('match_payments')
        .find({ status: 'PENDING' })
        .sort({ createdAt: -1 })
        .toArray()

      // Enrichir avec les infos du match et du provider
      const enriched = await Promise.all(pendingPayments.map(async (payment) => {
        const match = await db.collection('request_matches').findOne({ id: payment.matchId })
        const provider = await db.collection('provider_profiles').findOne({ id: payment.providerId })
        const request = match ? await db.collection('service_requests').findOne({ id: match.requestId }) : null
        
        return {
          ...payment,
          match,
          provider,
          request
        }
      }))

      return handleCORS(NextResponse.json(enriched))
    }

    // ⚡ ADMIN : Valider un paiement
    const validatePaymentMatch = route.match(/^\/admin\/payment\/([a-zA-Z0-9-]+)\/validate$/)
    if (validatePaymentMatch && method === 'POST') {
      const paymentId = validatePaymentMatch[1]
      
      const payment = await db.collection('match_payments').findOne({ id: paymentId })
      
      if (!payment) {
        return handleCORS(NextResponse.json({ error: 'Payment not found' }, { status: 404 }))
      }

      // Marquer le paiement comme vérifié
      await db.collection('match_payments').updateOne(
        { id: paymentId },
        { 
          $set: { 
            status: 'VERIFIED',
            verifiedByAdminAt: new Date(),
            updatedAt: new Date()
          } 
        }
      )

      // Changer le statut du match de PAYMENT_PENDING à ACCEPTED
      await db.collection('request_matches').updateOne(
        { id: payment.matchId },
        { 
          $set: { 
            status: 'ACCEPTED',
            paymentStatus: 'VERIFIED',
            updatedAt: new Date()
          } 
        }
      )

      // Marquer la demande comme ASSIGNED
      const match = await db.collection('request_matches').findOne({ id: payment.matchId })
      if (match) {
        await db.collection('service_requests').updateOne(
          { id: match.requestId },
          { 
            $set: { 
              status: 'ASSIGNED',
              assignedProviderId: payment.providerId,
              updatedAt: new Date()
            } 
          }
        )
      }

      return handleCORS(NextResponse.json({ 
        success: true,
        message: 'Paiement validé avec succès'
      }))
    }

    // ⚡ ADMIN : Liste des inscriptions en attente
    const pendingProvidersMatch = route.match(/^\/admin\/providers\/pending$/)
    if (pendingProvidersMatch && method === 'GET') {
      const pendingUsers = await db.collection('users')
        .find({ role: 'PROVIDER', status: 'EN_ATTENTE' })
        .sort({ createdAt: -1 })
        .toArray()

      // Enrichir avec les profils
      const enriched = await Promise.all(pendingUsers.map(async (user) => {
        const provider = await db.collection('provider_profiles').findOne({ userId: user.id })
        return {
          ...user,
          provider
        }
      }))

      return handleCORS(NextResponse.json(enriched))
    }

    // ⚡ ADMIN : Valider une inscription prestataire
    const validateProviderMatch = route.match(/^\/admin\/provider\/([a-zA-Z0-9-]+)\/validate$/)
    if (validateProviderMatch && method === 'POST') {
      const userId = validateProviderMatch[1]
      
      const user = await db.collection('users').findOne({ id: userId, role: 'PROVIDER' })
      
      if (!user) {
        return handleCORS(NextResponse.json({ error: 'Prestataire non trouvé' }, { status: 404 }))
      }

      // Changer le statut à VALIDE
      await db.collection('users').updateOne(
        { id: userId },
        { 
          $set: { 
            status: 'VALIDE',
            validatedAt: new Date(),
            updatedAt: new Date()
          } 
        }
      )

      // Activer le profil prestataire
      await db.collection('provider_profiles').updateOne(
        { userId },
        { 
          $set: { 
            status: 'VALIDE',
            isAvailable: true,
            isVerified: true,
            updatedAt: new Date()
          } 
        }
      )

      // TODO: Envoyer notification WhatsApp au prestataire

      return handleCORS(NextResponse.json({ 
        success: true,
        message: 'Prestataire validé avec succès'
      }))
    }

    // ⚡ ADMIN : Rejeter une inscription prestataire
    const rejectProviderMatch = route.match(/^\/admin\/provider\/([a-zA-Z0-9-]+)\/reject$/)
    if (rejectProviderMatch && method === 'POST') {
      const userId = rejectProviderMatch[1]
      
      const user = await db.collection('users').findOne({ id: userId, role: 'PROVIDER' })
      
      if (!user) {
        return handleCORS(NextResponse.json({ error: 'Prestataire non trouvé' }, { status: 404 }))
      }

      // Changer le statut à REJETE
      await db.collection('users').updateOne(
        { id: userId },
        { 
          $set: { 
            status: 'REJETE',
            rejectedAt: new Date(),
            updatedAt: new Date()
          } 
        }
      )

      // Désactiver le profil prestataire
      await db.collection('provider_profiles').updateOne(
        { userId },
        { 
          $set: { 
            status: 'REJETE',
            isAvailable: false,
            updatedAt: new Date()
          } 
        }
      )

      // TODO: Envoyer notification WhatsApp au prestataire

      return handleCORS(NextResponse.json({ 
        success: true,
        message: 'Prestataire rejeté'
      }))
    }

    // ============ SUBSCRIPTIONS ENDPOINTS ============

    // 📋 GET /api/subscriptions/plans - Récupérer les formules d'abonnement
    if (route === '/subscriptions/plans' && method === 'GET') {
      return handleCORS(NextResponse.json({ 
        plans: Object.values(SUBSCRIPTION_PLANS),
        paymentPhone: PAYMENT_PHONE,
        trialPeriodDays: TRIAL_PERIOD_DAYS
      }))
    }

    // 📋 POST /api/subscriptions/create - Créer un abonnement (période d'essai)
    if (route === '/subscriptions/create' && method === 'POST') {
      const body = await request.json()
      const { providerId, plan } = body

      if (!providerId || !plan) {
        return handleCORS(NextResponse.json({ error: 'providerId et plan requis' }, { status: 400 }))
      }

      if (!SUBSCRIPTION_PLANS[plan]) {
        return handleCORS(NextResponse.json({ error: 'Plan invalide' }, { status: 400 }))
      }

      // Vérifier que le prestataire existe
      const provider = await db.collection('users').findOne({ id: providerId, role: 'PROVIDER' })
      if (!provider) {
        return handleCORS(NextResponse.json({ error: 'Prestataire non trouvé' }, { status: 404 }))
      }

      // Vérifier s'il a déjà un abonnement actif
      const existingSubscription = await db.collection('subscriptions').findOne({
        providerId,
        status: { $in: ['TRIAL', 'ACTIVE'] }
      })

      if (existingSubscription) {
        return handleCORS(NextResponse.json({ error: 'Vous avez déjà un abonnement actif' }, { status: 400 }))
      }

      // Créer abonnement avec période d'essai
      const now = new Date()
      const trialEndsAt = new Date(now)
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_PERIOD_DAYS)

      const subscription = {
        id: uuidv4(),
        providerId,
        plan,
        planDetails: SUBSCRIPTION_PLANS[plan],
        status: 'TRIAL',                    // Période d'essai
        
        startDate: now,
        trialEndsAt,
        expiresAt: null,                    // Sera défini après paiement
        
        paymentMethod: null,
        paymentProof: null,
        paymentValidatedBy: null,
        paymentValidatedAt: null,
        
        leadsReceivedThisMonth: 0,
        autoRenew: false,
        
        createdAt: now,
        updatedAt: now
      }

      await db.collection('subscriptions').insertOne(subscription)

      // Mettre à jour le prestataire
      await db.collection('users').updateOne(
        { id: providerId },
        { $set: { subscriptionId: subscription.id, updatedAt: now } }
      )

      return handleCORS(NextResponse.json({ 
        success: true,
        subscription,
        message: `Période d'essai de ${TRIAL_PERIOD_DAYS} jours activée !`
      }))
    }

    // 📋 POST /api/subscriptions/upload-proof - Upload preuve de paiement
    if (route === '/subscriptions/upload-proof' && method === 'POST') {
      const body = await request.json()
      const { subscriptionId, paymentProof, paymentMethod } = body

      if (!subscriptionId || !paymentProof || !paymentMethod) {
        return handleCORS(NextResponse.json({ error: 'Données manquantes' }, { status: 400 }))
      }

      const subscription = await db.collection('subscriptions').findOne({ id: subscriptionId })
      if (!subscription) {
        return handleCORS(NextResponse.json({ error: 'Abonnement non trouvé' }, { status: 404 }))
      }

      // Mettre à jour avec preuve de paiement
      await db.collection('subscriptions').updateOne(
        { id: subscriptionId },
        { 
          $set: { 
            paymentProof,                     // Base64 de l'image
            paymentMethod,                    // 'wave' ou 'orange_money'
            status: 'PENDING_VALIDATION',     // En attente validation admin
            updatedAt: new Date()
          } 
        }
      )

      return handleCORS(NextResponse.json({ 
        success: true,
        message: 'Preuve de paiement envoyée. Validation sous 24h.'
      }))
    }

    // 📋 GET /api/subscriptions/my-subscription - Récupérer mon abonnement
    if (route === '/subscriptions/my-subscription' && method === 'GET') {
      const url = new URL(request.url)
      const providerId = url.searchParams.get('providerId')

      if (!providerId) {
        return handleCORS(NextResponse.json({ error: 'providerId requis' }, { status: 400 }))
      }

      const subscription = await db.collection('subscriptions').findOne(
        { providerId },
        { sort: { createdAt: -1 } }  // Plus récent en premier
      )

      if (!subscription) {
        return handleCORS(NextResponse.json({ subscription: null }))
      }

      // Vérifier si période d'essai expirée
      if (subscription.status === 'TRIAL' && new Date() > new Date(subscription.trialEndsAt)) {
        await db.collection('subscriptions').updateOne(
          { id: subscription.id },
          { $set: { status: 'TRIAL_EXPIRED', updatedAt: new Date() } }
        )
        subscription.status = 'TRIAL_EXPIRED'
      }

      // Vérifier si abonnement expiré
      if (subscription.status === 'ACTIVE' && subscription.expiresAt && new Date() > new Date(subscription.expiresAt)) {
        await db.collection('subscriptions').updateOne(
          { id: subscription.id },
          { $set: { status: 'EXPIRED', updatedAt: new Date() } }
        )
        subscription.status = 'EXPIRED'
      }

      return handleCORS(NextResponse.json({ subscription }))
    }

    // ============ ADMIN SUBSCRIPTIONS ENDPOINTS ============

    // 📋 GET /api/admin/subscriptions/pending - Abonnements en attente de validation
    if (route === '/admin/subscriptions/pending' && method === 'GET') {
      const subscriptions = await db.collection('subscriptions')
        .find({ status: 'PENDING_VALIDATION' })
        .sort({ updatedAt: -1 })
        .toArray()

      // Enrichir avec infos prestataire
      const enriched = await Promise.all(subscriptions.map(async (sub) => {
        const provider = await db.collection('users').findOne({ id: sub.providerId })
        const profile = await db.collection('provider_profiles').findOne({ userId: sub.providerId })
        return {
          ...sub,
          providerName: profile?.businessName || provider?.name || provider?.phone,
          providerPhone: provider?.phone
        }
      }))

      return handleCORS(NextResponse.json({ subscriptions: enriched }))
    }

    // 📋 GET /api/admin/subscriptions/all - Tous les abonnements
    if (route === '/admin/subscriptions/all' && method === 'GET') {
      const url = new URL(request.url)
      const status = url.searchParams.get('status') // Filtre optionnel

      const query = status ? { status } : {}
      const subscriptions = await db.collection('subscriptions')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray()

      // Enrichir avec infos prestataire
      const enriched = await Promise.all(subscriptions.map(async (sub) => {
        const provider = await db.collection('users').findOne({ id: sub.providerId })
        const profile = await db.collection('provider_profiles').findOne({ userId: sub.providerId })
        return {
          ...sub,
          providerName: profile?.businessName || provider?.name || provider?.phone,
          providerPhone: provider?.phone
        }
      }))

      return handleCORS(NextResponse.json({ subscriptions: enriched }))
    }

    // 📋 POST /api/admin/subscriptions/{id}/validate - Valider paiement abonnement
    const validateSubscriptionMatch = route.match(/^\/admin\/subscriptions\/([a-zA-Z0-9-]+)\/validate$/)
    if (validateSubscriptionMatch && method === 'POST') {
      const subscriptionId = validateSubscriptionMatch[1]

      const subscription = await db.collection('subscriptions').findOne({ id: subscriptionId })
      if (!subscription) {
        return handleCORS(NextResponse.json({ error: 'Abonnement non trouvé' }, { status: 404 }))
      }

      if (subscription.status !== 'PENDING_VALIDATION') {
        return handleCORS(NextResponse.json({ error: 'Abonnement non en attente de validation' }, { status: 400 }))
      }

      // Calculer date d'expiration
      const now = new Date()
      const expiresAt = new Date(now)
      expiresAt.setDate(expiresAt.getDate() + subscription.planDetails.duration)

      // Activer abonnement
      await db.collection('subscriptions').updateOne(
        { id: subscriptionId },
        { 
          $set: { 
            status: 'ACTIVE',
            paymentValidatedAt: now,
            expiresAt,
            updatedAt: now
          } 
        }
      )

      // TODO: Envoyer notification WhatsApp au prestataire

      return handleCORS(NextResponse.json({ 
        success: true,
        message: 'Abonnement validé et activé !',
        expiresAt
      }))
    }

    // 📋 POST /api/admin/subscriptions/{id}/reject - Rejeter paiement abonnement
    const rejectSubscriptionMatch = route.match(/^\/admin\/subscriptions\/([a-zA-Z0-9-]+)\/reject$/)
    if (rejectSubscriptionMatch && method === 'POST') {
      const subscriptionId = rejectSubscriptionMatch[1]
      const body = await request.json()
      const { reason } = body

      const subscription = await db.collection('subscriptions').findOne({ id: subscriptionId })
      if (!subscription) {
        return handleCORS(NextResponse.json({ error: 'Abonnement non trouvé' }, { status: 404 }))
      }

      // Rejeter et remettre en période d'essai ou expirer
      const newStatus = subscription.status === 'TRIAL' ? 'TRIAL' : 'REJECTED'
      
      await db.collection('subscriptions').updateOne(
        { id: subscriptionId },
        { 
          $set: { 
            status: newStatus,
            paymentProof: null,           // Supprimer preuve rejetée
            rejectionReason: reason || 'Preuve de paiement invalide',
            updatedAt: new Date()
          } 
        }
      )

      // TODO: Envoyer notification WhatsApp au prestataire

      return handleCORS(NextResponse.json({ 
        success: true,
        message: 'Paiement rejeté. Prestataire notifié.'
      }))
    }

    // ============ AUTOMATIC DISPATCH ENDPOINTS ============

    // 📋 POST /api/requests/{id}/contact - Prestataire confirme qu'il a contacté le client
    const contactRequestMatch = route.match(/^\/requests\/([a-zA-Z0-9-]+)\/contact$/)
    if (contactRequestMatch && method === 'POST') {
      const requestId = contactRequestMatch[1]
      const body = await request.json()
      const { providerId } = body

      if (!providerId) {
        return handleCORS(NextResponse.json({ error: 'providerId requis' }, { status: 400 }))
      }

      // Trouver le match
      const match = await db.collection('request_matches').findOne({
        requestId,
        providerId
      })

      if (!match) {
        return handleCORS(NextResponse.json({ error: 'Match non trouvé' }, { status: 404 }))
      }

      // Mettre à jour match
      await db.collection('request_matches').updateOne(
        { id: match.id },
        { 
          $set: { 
            status: 'CONTACTED',
            contactedAt: new Date()
          } 
        }
      )

      // Mettre à jour demande (premier qui contacte)
      const request = await db.collection('service_requests').findOne({ id: requestId })
      if (request && request.status === 'DISPATCHED') {
        await db.collection('service_requests').updateOne(
          { id: requestId },
          { 
            $set: { 
              status: 'IN_PROGRESS',
              firstContactAt: new Date(),
              firstContactBy: providerId
            } 
          }
        )
      }

      return handleCORS(NextResponse.json({ 
        success: true,
        message: 'Contact confirmé'
      }))
    }

    // 📋 POST /api/requests/{id}/complete - Client confirme la fin du service
    const completeRequestMatch = route.match(/^\/requests\/([a-zA-Z0-9-]+)\/complete$/)
    if (completeRequestMatch && method === 'POST') {
      const requestId = completeRequestMatch[1]
      const body = await request.json()
      const { rating, feedback, wonByProviderId } = body

      await db.collection('service_requests').updateOne(
        { id: requestId },
        { 
          $set: { 
            status: 'COMPLETED',
            completedAt: new Date(),
            rating: rating || null,
            feedback: feedback || null,
            wonByProviderId: wonByProviderId || null
          } 
        }
      )

      // Marquer le match gagnant
      if (wonByProviderId) {
        await db.collection('request_matches').updateOne(
          { requestId, providerId: wonByProviderId },
          { $set: { won: true, status: 'WON' } }
        )
      }

      return handleCORS(NextResponse.json({ 
        success: true,
        message: 'Service marqué comme terminé'
      }))
    }

    // 📋 GET /api/provider/leads - Récupérer mes leads reçus (avec matches)
    if (route === '/provider/leads' && method === 'GET') {
      const url = new URL(request.url)
      const providerId = url.searchParams.get('providerId')

      if (!providerId) {
        return handleCORS(NextResponse.json({ error: 'providerId requis' }, { status: 400 }))
      }

      // Récupérer tous les matches du prestataire
      const matches = await db.collection('request_matches')
        .find({ providerId })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()

      // Enrichir avec infos de la demande
      const enrichedMatches = await Promise.all(matches.map(async (match) => {
        const request = await db.collection('service_requests').findOne({ id: match.requestId })
        return {
          ...match,
          request: request || null
        }
      }))

      return handleCORS(NextResponse.json({ 
        leads: enrichedMatches.filter(m => m.request !== null)
      }))
    }

    // 📋 POST /api/admin/migrate-old-requests - Migrer anciennes demandes vers COMPLETED
    if (route === '/admin/migrate-old-requests' && method === 'POST') {
      const result = await db.collection('service_requests').updateMany(
        { status: { $in: ['EN_ATTENTE_VALIDATION_ADMIN', 'VALIDEE_PAR_ADMIN'] } },
        { $set: { status: 'COMPLETED', migratedAt: new Date() } }
      )

      return handleCORS(NextResponse.json({ 
        success: true,
        migrated: result.modifiedCount,
        message: `${result.modifiedCount} demandes migrées vers COMPLETED`
      }))
    }

    // 📋 POST /api/admin/cleanup-old-data - Nettoyer anciennes données de test
    if (route === '/admin/cleanup-old-data' && method === 'POST') {
      try {
        // 1. Supprimer anciens matches avec statuts obsolètes
        const matchesDeleted = await db.collection('request_matches').deleteMany({
          status: { $in: ['PAYMENT_PENDING', 'ACCEPTED', 'DECLINED'] }
        })

        // 2. Migrer anciennes demandes vers COMPLETED
        const requestsMigrated = await db.collection('service_requests').updateMany(
          { status: { $in: ['EN_ATTENTE_VALIDATION_ADMIN', 'VALIDEE_PAR_ADMIN', 'ENVOYEE_AUX_PRESTATAIRES'] } },
          { $set: { status: 'COMPLETED', migratedAt: new Date() } }
        )

        // 3. Supprimer anciens leads non liés
        const leadsDeleted = await db.collection('leads').deleteMany({
          status: 'NEW',
          createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Plus de 7 jours
        })

        return handleCORS(NextResponse.json({ 
          success: true,
          summary: {
            matchesDeleted: matchesDeleted.deletedCount,
            requestsMigrated: requestsMigrated.modifiedCount,
            leadsDeleted: leadsDeleted.deletedCount
          },
          message: `Nettoyage terminé : ${matchesDeleted.deletedCount} matches supprimés, ${requestsMigrated.modifiedCount} demandes migrées, ${leadsDeleted.deletedCount} leads supprimés`
        }))
      } catch (error) {
        console.error('Erreur nettoyage:', error)
        return handleCORS(NextResponse.json({ 
          error: 'Erreur lors du nettoyage',
          details: error.message
        }, { status: 500 }))
      }
    }

    // 📋 POST /api/admin/delete-all-test-data - Supprimer TOUTES les données de test
    if (route === '/admin/delete-all-test-data' && method === 'POST') {
      try {
        // Supprimer TOUTES les demandes
        const requestsDeleted = await db.collection('service_requests').deleteMany({})
        
        // Supprimer TOUS les matches
        const matchesDeleted = await db.collection('request_matches').deleteMany({})
        
        // Supprimer TOUS les leads
        const leadsDeleted = await db.collection('leads').deleteMany({})
        
        // Réinitialiser compteur leads des abonnements
        await db.collection('subscriptions').updateMany(
          {},
          { $set: { leadsReceivedThisMonth: 0 } }
        )

        return handleCORS(NextResponse.json({ 
          success: true,
          summary: {
            requestsDeleted: requestsDeleted.deletedCount,
            matchesDeleted: matchesDeleted.deletedCount,
            leadsDeleted: leadsDeleted.deletedCount
          },
          message: `✅ Toutes les données de test supprimées !\n\nPrestataires et abonnements conservés.\n\nDétails :\n- ${requestsDeleted.deletedCount} demandes supprimées\n- ${matchesDeleted.deletedCount} matches supprimés\n- ${leadsDeleted.deletedCount} leads supprimés`
        }))
      } catch (error) {
        console.error('Erreur suppression:', error)
        return handleCORS(NextResponse.json({ 
          error: 'Erreur lors de la suppression',
          details: error.message
        }, { status: 500 }))
      }
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
