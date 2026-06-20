import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// ============ AUTH HELPERS (JWT signé) ============
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

function signToken(payload) {
  // payload = { sub: userId, role: 'ADMIN' | 'PROVIDER' | 'CLIENT', tv: tokenVersion }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

// Helper pour signer un token utilisateur en intégrant le tokenVersion
function signUserToken(user) {
  return signToken({
    sub: user.id,
    role: user.role,
    tv: user.tokenVersion ?? 0
  })
}

// Extracts and verifies the Bearer token. Returns { user, payload } or null.
// Vérifie aussi que le tokenVersion du JWT correspond à celui en base
// (permet d'invalider toutes les sessions actives lors d'un changement
//  de mot de passe / reset admin).
async function getAuthUser(request, db) {
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const payload = verifyToken(m[1])
  if (!payload?.sub) return null
  const user = await db.collection('users').findOne({ id: payload.sub })
  if (!user) return null
  // Vérification du tokenVersion : undefined === 0 pour rétro-compatibilité
  const tokenTv = payload.tv ?? 0
  const userTv = user.tokenVersion ?? 0
  if (tokenTv !== userTv) return null
  return { user, payload }
}

// Génère un mot de passe temporaire lisible (8 chars: 1 maj, 1 min, 1 chiffre, etc.)
function generateTempPassword() {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const all = upper + lower + digits
  const pick = (s) => s[Math.floor(Math.random() * s.length)]
  let pwd = pick(upper) + pick(lower) + pick(digits)
  for (let i = 0; i < 5; i++) pwd += pick(all)
  // Shuffle
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

// ============ RATE LIMITING (LOT 3a) ============
// Politique: 5 tentatives échouées en 15 min → blocage 15 min sur ce phone+role
const RATE_LIMIT_MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000   // 15 minutes
const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000    // 15 minutes

function normalizePhone(phone) {
  return (phone || '').replace(/[^\d]/g, '').slice(-9)
}

// Vérifie si l'utilisateur est actuellement bloqué. Retourne null si OK,
// sinon { blocked: true, retryAfterSec, blockedUntil }.
async function checkLoginRateLimit(db, phone, role) {
  const key = `${normalizePhone(phone)}_${role}`
  const entry = await db.collection('login_attempts').findOne({ key })
  if (!entry) return null

  const now = Date.now()
  if (entry.blockedUntil && entry.blockedUntil.getTime() > now) {
    return {
      blocked: true,
      retryAfterSec: Math.ceil((entry.blockedUntil.getTime() - now) / 1000),
      blockedUntil: entry.blockedUntil
    }
  }
  return null
}

// Enregistre une tentative échouée. Si on atteint le seuil, on bloque.
// Retourne { count, blocked, retryAfterSec? }.
async function recordFailedLogin(db, phone, role) {
  const key = `${normalizePhone(phone)}_${role}`
  const now = new Date()
  const existing = await db.collection('login_attempts').findOne({ key })

  let count = 1
  let firstAttemptAt = now

  if (existing) {
    const windowExpired = (now.getTime() - existing.firstAttemptAt.getTime()) > RATE_LIMIT_WINDOW_MS
    if (windowExpired) {
      // Reset fenêtre glissante
      count = 1
      firstAttemptAt = now
    } else {
      count = (existing.count || 0) + 1
      firstAttemptAt = existing.firstAttemptAt
    }
  }

  const update = {
    key,
    phone,
    role,
    count,
    firstAttemptAt,
    lastAttemptAt: now,
    updatedAt: now
  }

  if (count >= RATE_LIMIT_MAX_ATTEMPTS) {
    update.blockedUntil = new Date(now.getTime() + RATE_LIMIT_BLOCK_MS)
  }

  await db.collection('login_attempts').updateOne(
    { key },
    { $set: update },
    { upsert: true }
  )

  return {
    count,
    blocked: count >= RATE_LIMIT_MAX_ATTEMPTS,
    retryAfterSec: count >= RATE_LIMIT_MAX_ATTEMPTS ? RATE_LIMIT_BLOCK_MS / 1000 : 0,
    remainingAttempts: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - count)
  }
}

// Réinitialise les tentatives sur login réussi.
async function clearLoginAttempts(db, phone, role) {
  const key = `${normalizePhone(phone)}_${role}`
  await db.collection('login_attempts').deleteOne({ key })
}

function rateLimitBlockedResponse(rl) {
  const minutes = Math.ceil(rl.retryAfterSec / 60)
  return handleCORS(NextResponse.json({
    error: 'RATE_LIMITED',
    message: `Trop de tentatives échouées. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    retryAfterSec: rl.retryAfterSec,
    blockedUntil: rl.blockedUntil
  }, { status: 429 }))
}

// ============ LOGIN HISTORY (LOT 3c) ============
// Trace toutes les tentatives de connexion (succès & échecs) pour audit.
async function recordLoginEvent(db, request, { userId, phone, role, success, reason }) {
  try {
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || request.headers.get('cf-connecting-ip')
      || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const now = new Date()

    await db.collection('login_history').insertOne({
      id: uuidv4(),
      userId: userId || null,
      phone,
      role,
      success: !!success,
      reason: reason || null,
      ip,
      userAgent: userAgent.substring(0, 300),
      createdAt: now
    })

    // Auto-purge des entrées > 30 jours (best-effort, non bloquant)
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    db.collection('login_history').deleteMany({ createdAt: { $lt: cutoff } }).catch(() => {})
  } catch (err) {
    console.error('[login-history] Erreur enregistrement:', err.message)
  }
}

// Validation complexité minimale du mot de passe.
// Renvoie null si OK, ou un message d'erreur sinon.
function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Le mot de passe doit contenir au moins 8 caractères'
  }
  if (!/[A-Z]/.test(password)) return 'Le mot de passe doit contenir au moins 1 majuscule'
  if (!/[a-z]/.test(password)) return 'Le mot de passe doit contenir au moins 1 minuscule'
  if (!/\d/.test(password))    return 'Le mot de passe doit contenir au moins 1 chiffre'
  return null
}

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
    serviceCategory: request.category,
    isAvailable: true
  }).toArray()

  const eligibleProviders = []

  for (const profile of providers) {
    // Récupérer user et abonnement
    const user = await db.collection('users').findOne({ id: profile.userId })
    if (!user) continue

    // ⚡ FILTRE: Exclure les prestataires désactivés/suspendus/supprimés
    const userStatus = user.status || 'ACTIVE'  // Par défaut ACTIVE pour rétrocompatibilité
    if (userStatus !== 'ACTIVE') {
      console.log(`⚠️ ${profile.businessName} exclu: statut=${userStatus}`)
      continue
    }

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

// ============ Message Parsing (100% local / autonome) ============
// NB: WookoPRO fonctionne désormais sans aucune dépendance externe.
// L'extraction d'intention est entièrement locale (heuristique multilingue FR/Wolof).
const SYSTEM_PROMPT = `Extraction locale des champs: service_category, city, zone, urgency, short_summary, missing_information, language, ready_for_matching.`

// Smart local parsing — autonomous, no external calls
function parseLocally(message) {
  const lowerMsg = message.toLowerCase()
  
  const categories = {
    plombier: ['plombier', 'plomberie', 'fuite', 'douche', 'robinet', 'tuyau', 'wc', 'toilette', 'évier', 'canalisation', 'eau'],
    electricien: ['électricien', 'electricien', 'électrique', 'electrique', 'courant', 'prise', 'lumière', 'ampoule', 'disjoncteur', 'panne de courant'],
    climatiseur: ['climatiseur', 'clim', 'climatisation', 'froid', 'chaud', 'ventilation', 'ac'],
    macon: ['maçon', 'macon', 'maçonnerie', 'maconnerie', 'mur', 'ciment', 'béton', 'beton', 'briques', 'brique', 'parpaing', 'fondation', 'construction', 'crépi', 'crepi', 'carrelage', 'dallage'],
    tapissier: ['tapissier', 'tapissière', 'tapisserie', 'tapisser', 'tissu', 'rideau', 'rideaux', 'canapé', 'canape', 'fauteuil', 'siège', 'siege', 'rembourrage', 'recouvrir', 'décoration intérieure', 'décoration interieure', 'décorateur', 'tenture'],
    architecte: ['architecte', 'architecture', 'plan', 'plans', 'esquisse', 'concept', 'aménagement', 'amenagement', 'agencement', 'rénovation', 'renovation', 'permis de construire'],
    'technicien-batiment': ['technicien du bâtiment', 'technicien du batiment', 'technicien bâtiment', 'technicien batiment', 'diagnostic', 'inspection', 'audit', 'expertise bâtiment', 'expertise batiment', 'contrôle technique', 'controle technique', 'conformité', 'conformite'],
    'entrepreneur-batiment': ['entrepreneur', 'entrepreneur du bâtiment', 'entrepreneur du batiment', 'entreprise bâtiment', 'entreprise batiment', 'chantier', 'maître d\'œuvre', 'maitre d\'oeuvre', 'général du bâtiment', 'general du batiment', 'tous corps d\'état'],
    menuisier: ['menuisier', 'menuiserie', 'bois', 'meuble', 'armoire', 'porte', 'fenêtre', 'étagère'],
    peintre: ['peintre', 'peinture', 'peindre', 'plafond'],
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
  
  const cities = ['dakar', 'thiès', 'thies', 'saint-louis', 'saint louis', 'kaolack', 'ziguinchor', 'touba', 'mbour', 'rufisque', 'tambacounda', 'tamba']
  let detectedCity = ''
  for (const city of cities) {
    if (lowerMsg.includes(city)) {
      detectedCity = city.charAt(0).toUpperCase() + city.slice(1)
      if (detectedCity.toLowerCase() === 'thies') detectedCity = 'Thiès'
      if (detectedCity.toLowerCase() === 'tamba') detectedCity = 'Tambacounda'
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

// Renommé en parseMessage : 100% local, aucune dépendance externe.
// Le wrapper parseWithOpenAI reste exporté pour compatibilité avec les call-sites existants.
function parseMessage(message) {
  return parseLocally(message)
}

async function parseWithOpenAI(message) {
  // Stub conservé pour compatibilité — délègue désormais au parser local.
  return parseMessage(message)
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

// ============ Internal Messaging Service (autonomous, DB-only) ============
// Aucun appel à WhatsApp Cloud API. Les messages sont uniquement stockés en base
// et exposés via les endpoints d'administration / monitoring.
const whatsappMessages = []

async function sendWhatsAppMessage(to, text, db = null) {
  const message = {
    id: uuidv4(),
    to,
    text,
    status: 'sent',
    timestamp: new Date(),
    channel: 'internal'
  }

  whatsappMessages.push(message)

  if (db) {
    try {
      await db.collection('whatsapp_messages').insertOne(message)
    } catch (e) {
      console.error('Error storing internal message:', e)
    }
  }

  return {
    messaging_product: 'internal',
    contacts: [{ wa_id: to }],
    messages: [{ id: message.id }]
  }
}

// ============ Request Service Functions ============
async function createServiceRequestFromParsed(db, phone, rawMessage, parsed) {
  // ✅ Résolution par rôle : un même numéro peut avoir un compte CLIENT et un compte PROVIDER.
  // Pour une demande de service entrante, on cherche/crée toujours le compte CLIENT.
  let user = await db.collection('users').findOne({ phone, role: 'CLIENT' })

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

    // ============ ADMIN AUTH GUARD (Lot 1 sécurité) ============
    // Protège toutes les mutations admin + les changements de statut prestataire.
    // Les GET restent ouverts pour ne pas casser la compat front (durcissement Lot 3).
    const isAdminMutation =
      (route.startsWith('/admin/') && ['POST', 'PATCH', 'DELETE'].includes(method)) ||
      (route.match(/^\/providers\/[^/]+\/status$/) && method === 'PATCH')

    if (isAdminMutation) {
      const auth = await getAuthUser(request, db)
      if (!auth || auth.user.role !== 'ADMIN') {
        return handleCORS(NextResponse.json(
          { error: 'Authentification admin requise', code: 'UNAUTHORIZED' },
          { status: 401 }
        ))
      }
    }

    // ============ ROOT ============
    if ((route === '/root' || route === '/') && method === 'GET') {
      return handleCORS(NextResponse.json({ 
        message: 'Bienvenue sur Wooleen API',
        version: '2.1.0',
        features: ['Lead capture', 'Autonomous local parsing', 'Improved matching', 'Subscriptions']
      }))
    }

    // ============ LEAD CAPTURE (NEW) ============
    if (route === '/leads' && method === 'POST') {
      const body = await request.json()
      const { serviceCategory, city, phone, description, source } = body
      
      // ✅ Find-or-create user *par rôle* : un même numéro peut être à la fois
      // client et prestataire. Ici on cherche/crée un compte CLIENT spécifiquement.
      let user = await db.collection('users').findOne({
        phone: { $regex: new RegExp(phone?.replace(/[^\d]/g, '').slice(-9) || '') },
        role: 'CLIENT'
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
        serviceCategory: serviceCategory || 'autre', // 🔧 Compat analytics ($group on $serviceCategory)
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

      // ⚡ Récupère le meilleur prestataire matché (pour ouverture wa.me directe)
      let bestProvider = null
      if (matches.length > 0) {
        const top = matches[0]   // ordre déjà par score décroissant
        const profile = await db.collection('provider_profiles').findOne({ userId: top.providerId })
        const userDoc = await db.collection('users').findOne({ id: top.providerId })
        if (profile && userDoc) {
          bestProvider = {
            id: top.providerId,
            businessName: profile.businessName || userDoc.name,
            phone: userDoc.phone,
            whatsappNumber: profile.whatsappNumber || userDoc.phone,
            serviceCategory: profile.serviceCategory,
            city: profile.city,
            tier: profile.tier || 'free',
            rating: profile.rating || 0
          }
        }
      }

      return handleCORS(NextResponse.json({
        success: true,
        leadId: lead.id,
        requestId: serviceRequest.id,
        dispatchedTo: matches.length,
        bestProvider,                                 // ⚡ nouveau : prestataire prioritaire
        matchedCount: matches.length,
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

      // ⚡ Lot 3a — Rate limiting : vérifie le blocage AVANT toute opération
      const rl = await checkLoginRateLimit(db, phone, 'PROVIDER')
      if (rl?.blocked) {
        return rateLimitBlockedResponse(rl)
      }
      
      const user = await db.collection('users').findOne({ 
        phone: { $regex: new RegExp(phone.replace(/[^\d]/g, '').slice(-9)) },
        role: 'PROVIDER'
      })
      
      if (!user) {
        const r = await recordFailedLogin(db, phone, 'PROVIDER')
        await recordLoginEvent(db, request, { userId: null, phone, role: 'PROVIDER', success: false, reason: 'USER_NOT_FOUND' })
        if (r.blocked) return rateLimitBlockedResponse(r)
        return handleCORS(NextResponse.json({
          error: 'Prestataire non trouvé',
          remainingAttempts: r.remainingAttempts
        }, { status: 401 }))
      }

      // ⚡ NOUVEAU : Vérifier le statut du compte AVANT validation mot de passe
      if (user.status === 'EN_ATTENTE' || user.status === 'PENDING') {
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

      if (user.status === 'INACTIVE' || user.status === 'SUSPENDED') {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_INACTIF',
          message: 'Votre compte a été désactivé par l\'administration. Contactez le support au +33 7 77 36 94 62.'
        }, { status: 403 }))
      }

      if (user.status === 'DELETED') {
        return handleCORS(NextResponse.json({
          error: 'COMPTE_SUPPRIME',
          message: 'Ce compte a été supprimé. Veuillez créer un nouveau compte ou contacter le support au +33 7 77 36 94 62.'
        }, { status: 403 }))
      }

      // Seuls les comptes VALIDES ou ACTIVE peuvent se connecter
      if (user.status && user.status !== 'VALIDE' && user.status !== 'ACTIVE') {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_INACTIF',
          message: 'Votre compte n\'est pas actif. Contactez l\'administrateur.'
        }, { status: 403 }))
      }
      
      if (!user.passwordHash) {
        // ⚠️ Sécurité : on REFUSE désormais tout login sans hash valide.
        // Si un user a été créé par seed sans passwordHash, il doit utiliser
        // le flux "Mot de passe oublié" pour en définir un.
        return handleCORS(NextResponse.json({
          error: 'COMPTE_SANS_MOT_DE_PASSE',
          message: 'Aucun mot de passe défini. Utilisez la procédure "Mot de passe oublié".'
        }, { status: 401 }))
      }
      const validPassword = await bcrypt.compare(password, user.passwordHash)
      if (!validPassword) {
        const r = await recordFailedLogin(db, phone, 'PROVIDER')
        await recordLoginEvent(db, request, { userId: user.id, phone, role: 'PROVIDER', success: false, reason: 'WRONG_PASSWORD' })
        if (r.blocked) return rateLimitBlockedResponse(r)
        return handleCORS(NextResponse.json({
          error: 'Mot de passe incorrect',
          remainingAttempts: r.remainingAttempts
        }, { status: 401 }))
      }
      
      const provider = await db.collection('provider_profiles').findOne({ userId: user.id })
      const token = signUserToken(user)
      
      // ⚡ Lot 3a — Reset des tentatives échouées sur login réussi
      await clearLoginAttempts(db, phone, 'PROVIDER')
      // ⚡ Lot 3c — Trace la connexion réussie
      await recordLoginEvent(db, request, { userId: user.id, phone, role: 'PROVIDER', success: true })
      
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

      // ✅ Validation de complexité du mot de passe (8+ chars, 1 maj, 1 min, 1 chiffre)
      const pwdErr = validatePasswordStrength(password)
      if (pwdErr) {
        return handleCORS(NextResponse.json({ error: pwdErr }, { status: 400 }))
      }
      
      // ✅ Unicité du numéro PAR RÔLE (et non globale).
      // Un même WhatsApp peut être à la fois client ET prestataire (2 comptes distincts).
      // On ne bloque que si un PRESTATAIRE existe déjà avec ce numéro.
      const existingUser = await db.collection('users').findOne({
        phone: { $regex: new RegExp(phone.replace(/[^\d]/g, '').slice(-9)) },
        role: 'PROVIDER'
      })

      if (existingUser) {
        return handleCORS(NextResponse.json({ error: 'Ce numéro est déjà utilisé pour un compte prestataire' }, { status: 400 }))
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

      // ⚡ Option C — Notification admin (fail-safe, sans API externe)
      // Logge l'inscription en base. L'admin verra un badge dans le dashboard
      // et pourra envoyer la notification WhatsApp d'un clic (lien wa.me pré-rempli).
      try {
        const supportPhone = (process.env.SUPPORT_NOTIFICATION_PHONE || '+33777369462').replace(/[^\d]/g, '')
        const inscriptionDate = new Date()
        const dateStr = inscriptionDate.toLocaleString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
        // Map slug → libellé pour le message de notification
        const proLabels = {
          plombier: 'Plombier', electricien: 'Électricien', climatiseur: 'Frigoriste',
          macon: 'Maçon', tapissier: 'Tapissier', menuisier: 'Menuisier',
          peintre: 'Peintre', serrurier: 'Serrurier',
          nettoyage: 'Agent de nettoyage', mecanicien: 'Mécanicien automobile',
          architecte: 'Architecte', 'technicien-batiment': 'Technicien du bâtiment',
          'entrepreneur-batiment': 'Entrepreneur du bâtiment',
          demenagement: 'Déménagement', technicien: 'Technicien',
          autre: 'Autre professionnel'
        }
        const metierLabel = proLabels[serviceCategory] || serviceCategory

        const message =
          '🚀 Nouveau prestataire inscrit sur WookoPRO\n\n' +
          `Nom : ${businessName}\n` +
          `Téléphone : ${phone}\n` +
          `Email : ${email || '—'}\n` +
          `Métier : ${metierLabel}\n` +
          `Ville : ${city}\n` +
          `Date d'inscription : ${dateStr}\n\n` +
          'Accéder au tableau de bord administrateur pour validation et suivi.'

        const notification = {
          id: uuidv4(),
          type: 'NEW_PROVIDER',
          targetPhone: '+' + supportPhone,
          targetWaUrl: `https://wa.me/${supportPhone}?text=${encodeURIComponent(message)}`,
          message,
          payload: {
            providerId: provider.id,
            userId: user.id,
            businessName,
            phone,
            email: email || null,
            serviceCategory,
            city
          },
          status: 'PENDING',  // PENDING | SENT | FAILED
          attempts: 0,
          createdAt: inscriptionDate,
          updatedAt: inscriptionDate
        }
        await db.collection('admin_notifications').insertOne(notification)
        console.log(`[notification] Nouvelle inscription prestataire loggée : ${businessName} (${provider.id})`)
      } catch (notifErr) {
        // ⚠️ L'échec d'enregistrement de la notification NE doit JAMAIS bloquer l'inscription
        console.error('[notification] Erreur enregistrement notification:', notifErr.message)
      }

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

      // ⚡ Lot 3a — Rate limiting (admin login)
      const rl = await checkLoginRateLimit(db, phone, 'ADMIN')
      if (rl?.blocked) {
        return rateLimitBlockedResponse(rl)
      }
      
      const user = await db.collection('users').findOne({ 
        phone: { $regex: new RegExp(phone.replace(/[^\d]/g, '').slice(-9)) }
      })
      
      if (!user) {
        const r = await recordFailedLogin(db, phone, 'ADMIN')
        await recordLoginEvent(db, request, { userId: null, phone, role: 'ADMIN', success: false, reason: 'USER_NOT_FOUND' })
        if (r.blocked) return rateLimitBlockedResponse(r)
        return handleCORS(NextResponse.json({
          error: 'Utilisateur non trouvé',
          remainingAttempts: r.remainingAttempts
        }, { status: 401 }))
      }
      
      if (!user.passwordHash) {
        return handleCORS(NextResponse.json({
          error: 'COMPTE_SANS_MOT_DE_PASSE',
          message: 'Aucun mot de passe défini. Utilisez la procédure "Mot de passe oublié".'
        }, { status: 401 }))
      }
      const validPassword = await bcrypt.compare(password, user.passwordHash)
      if (!validPassword) {
        const r = await recordFailedLogin(db, phone, 'ADMIN')
        await recordLoginEvent(db, request, { userId: user.id, phone, role: 'ADMIN', success: false, reason: 'WRONG_PASSWORD' })
        if (r.blocked) return rateLimitBlockedResponse(r)
        return handleCORS(NextResponse.json({
          error: 'Mot de passe incorrect',
          remainingAttempts: r.remainingAttempts
        }, { status: 401 }))
      }
      
      let provider = null
      if (user.role === 'PROVIDER') {
        provider = await db.collection('provider_profiles').findOne({ userId: user.id })
      }
      
      const token = signUserToken(user)

      // ⚡ Lot 3a — Reset des tentatives échouées sur login réussi
      await clearLoginAttempts(db, phone, 'ADMIN')
      // ⚡ Lot 3c — Trace la connexion réussie
      await recordLoginEvent(db, request, { userId: user.id, phone, role: user.role || 'ADMIN', success: true })

      return handleCORS(NextResponse.json({
        success: true,
        token,
        user: {
          id: user.id, name: user.name, phone: user.phone, role: user.role,
          mustChangePassword: !!user.mustChangePassword
        },
        mustChangePassword: !!user.mustChangePassword,
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
      
      // Update provider response rate (avec count optimisés)
      const totalMatches = await db.collection('request_matches').countDocuments({ providerId })
      const respondedMatches = await db.collection('request_matches').countDocuments({
        providerId,
        status: { $ne: 'SENT' }
      })
      const responseRate = totalMatches > 0 ? Math.round((respondedMatches / totalMatches) * 100) : 0
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
      const url = new URL(request.url)
      const includeDeleted = url.searchParams.get('includeDeleted') === 'true'

      const providers = await db.collection('provider_profiles')
        .aggregate([
          { $lookup: { from: 'users', localField: 'userId', foreignField: 'id', as: 'user' } },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          // ⚡ Exclut les prestataires supprimés (sauf si includeDeleted=true)
          ...(includeDeleted ? [] : [{ $match: { 'user.status': { $ne: 'DELETED' } } }]),
          { $sort: { tier: -1, rating: -1, createdAt: -1 } }
        ])
        .toArray()
      
      // Ajouter les champs status, disabledReason, disabledAt depuis user
      const enrichedProviders = providers.map(({ _id, ...p }) => ({
        ...p,
        accountStatus: p.user?.status || 'ACTIVE',  // Status du compte user
        disabledReason: p.user?.disabledReason || null,
        disabledAt: p.user?.disabledAt || null,
        deletedAt: p.user?.deletedAt || null,
        deletedReason: p.user?.deletedReason || null
      }))
      
      return handleCORS(NextResponse.json(enrichedProviders))
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

    // ============ PROVIDER STATUS MANAGEMENT ============
    const statusMatch = route.match(/^\/providers\/([a-zA-Z0-9-]+)\/status$/)
    if (statusMatch && method === 'PATCH') {
      const providerId = statusMatch[1]
      const body = await request.json()
      
      // Validation du statut
      const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']
      if (!validStatuses.includes(body.status)) {
        return handleCORS(NextResponse.json(
          { error: 'Statut invalide. Valeurs acceptées: ACTIVE, INACTIVE, SUSPENDED, PENDING' },
          { status: 400 }
        ))
      }

      // Récupérer le provider et le user associé
      const provider = await db.collection('provider_profiles').findOne({ userId: providerId })
      if (!provider) {
        return handleCORS(NextResponse.json({ error: 'Prestataire non trouvé' }, { status: 404 }))
      }

      // Mettre à jour le statut dans users
      const updateData = {
        status: body.status,
        updatedAt: new Date()
      }

      if (body.status !== 'ACTIVE' && body.reason) {
        updateData.disabledReason = body.reason
        updateData.disabledAt = new Date()
      } else if (body.status === 'ACTIVE') {
        updateData.disabledReason = null
        updateData.disabledAt = null
      }

      await db.collection('users').updateOne(
        { id: providerId },
        { $set: updateData }
      )

      // Récupérer les données mises à jour
      const updatedUser = await db.collection('users').findOne({ id: providerId })
      const { _id, ...cleanUser } = updatedUser

      console.log(`✅ Statut prestataire ${providerId} changé vers ${body.status}`)

      return handleCORS(NextResponse.json({
        success: true,
        user: cleanUser,
        message: `Statut changé vers ${body.status}`
      }))
    }

    // ============ SOFT DELETE PRESTATAIRE (ADMIN) ============
    // DELETE /api/admin/providers/:userId
    // Soft delete : marque user.status = 'DELETED', conserve tout l'historique
    // (subscriptions + request_matches) pour audit. Invalide les sessions.
    const adminDeleteMatch = route.match(/^\/admin\/providers\/([a-zA-Z0-9-]+)$/)
    if (adminDeleteMatch && method === 'DELETE') {
      const authData = await getAuthUser(request, db)
      if (!authData || authData.user.role !== 'ADMIN') {
        return handleCORS(NextResponse.json({ error: 'Non autorisé' }, { status: 401 }))
      }

      const userId = adminDeleteMatch[1]
      const body = await request.json().catch(() => ({}))
      const reason = body.reason || 'Suppression administrative'

      const targetUser = await db.collection('users').findOne({ id: userId })
      if (!targetUser) {
        return handleCORS(NextResponse.json({ error: 'Prestataire non trouvé' }, { status: 404 }))
      }
      if (targetUser.role !== 'PROVIDER') {
        return handleCORS(NextResponse.json({
          error: 'Cet utilisateur n\'est pas un prestataire'
        }, { status: 400 }))
      }
      if (targetUser.status === 'DELETED') {
        return handleCORS(NextResponse.json({
          error: 'Ce prestataire est déjà supprimé'
        }, { status: 400 }))
      }

      // Récupérer le profil pour le log
      const profile = await db.collection('provider_profiles').findOne({ userId })
      const businessName = profile?.businessName || targetUser.name

      // Vérifier abonnement actif (warning, pas bloquant)
      const activeSub = await db.collection('subscriptions').findOne({
        providerId: userId,
        status: { $in: ['ACTIVE', 'TRIAL'] }
      })

      const now = new Date()
      // Soft-delete : marque user comme DELETED + incrémente tokenVersion (invalide sessions)
      await db.collection('users').updateOne(
        { id: userId },
        {
          $set: {
            status: 'DELETED',
            deletedAt: now,
            deletedBy: authData.user.id,
            deletedReason: reason,
            isAvailable: false,
            updatedAt: now
          },
          $inc: { tokenVersion: 1 }
        }
      )

      // Marque le profil comme indisponible (pour exclure du dispatch)
      await db.collection('provider_profiles').updateOne(
        { userId },
        {
          $set: {
            isAvailable: false,
            deletedAt: now,
            updatedAt: now
          }
        }
      )

      console.log(`🗑️ Prestataire ${businessName} (${userId}) supprimé par admin ${authData.user.id}`)

      return handleCORS(NextResponse.json({
        success: true,
        message: `Prestataire "${businessName}" supprimé avec succès.`,
        warning: activeSub
          ? `Ce prestataire avait un abonnement ${activeSub.plan} (${activeSub.status}) actif. Il a été conservé pour traçabilité financière.`
          : null,
        userId
      }))
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
        aiStatus: 'Système autonome (local)',
        whatsappStatus: 'Local (base de données)'
      }))
    }

    // ============ ADMIN ANALYTICS (computed live from MongoDB) ============
    if (route === '/admin/analytics' && method === 'GET') {
      // --- Aggregations ---
      const [
        totalProviders,
        activeProviders,
        totalRequests,
        totalMatches,
        acceptedMatches,
        cancelledMatches,
        matchingRequests,
        verifiedPayments,
        verifiedPaymentsAgg,
        providersAgg,
        categoryAgg,
        cityAgg,
        topProvidersByRating
      ] = await Promise.all([
        db.collection('provider_profiles').countDocuments(),
        db.collection('provider_profiles').countDocuments({
          $or: [{ status: 'ACTIVE' }, { isAvailable: true }]
        }),
        db.collection('service_requests').countDocuments(),
        db.collection('request_matches').countDocuments(),
        db.collection('request_matches').countDocuments({ status: 'ACCEPTED' }),
        db.collection('request_matches').countDocuments({ status: 'CANCELLED' }),
        db.collection('service_requests').countDocuments({ status: 'MATCHING' }),
        db.collection('match_payments').countDocuments({ status: 'VERIFIED' }),
        db.collection('match_payments').aggregate([
          { $match: { status: 'VERIFIED' } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]).toArray(),
        db.collection('provider_profiles').aggregate([
          { $group: { _id: null, avgRating: { $avg: '$rating' }, avgResponseRate: { $avg: '$responseRate' } } }
        ]).toArray(),
        db.collection('service_requests').aggregate([
          { $group: { _id: '$serviceCategory', requests: { $sum: 1 } } },
          { $sort: { requests: -1 } },
          { $limit: 5 }
        ]).toArray(),
        db.collection('service_requests').aggregate([
          { $match: { city: { $ne: '' } } },
          { $group: { _id: '$city', requests: { $sum: 1 } } },
          { $sort: { requests: -1 } },
          { $limit: 5 }
        ]).toArray(),
        db.collection('provider_profiles').find({})
          .sort({ rating: -1 })
          .limit(5)
          .toArray()
      ])

      const totalRevenue = verifiedPaymentsAgg[0]?.total || 0
      const paidCount = verifiedPaymentsAgg[0]?.count || 0
      const avgBasket = paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0
      const avgRating = providersAgg[0]?.avgRating ? Number(providersAgg[0].avgRating.toFixed(1)) : 0
      const avgResponseRate = providersAgg[0]?.avgResponseRate ? Number(providersAgg[0].avgResponseRate.toFixed(1)) : 0
      const cancellationRate = totalMatches > 0 ? Number(((cancelledMatches / totalMatches) * 100).toFixed(1)) : 0
      const untreatedRequestsRate = totalRequests > 0 ? Number(((matchingRequests / totalRequests) * 100).toFixed(1)) : 0
      const satisfactionRate = totalMatches > 0 ? Number((100 - cancellationRate).toFixed(1)) : 0

      // Conversion funnel (visits/clicks not tracked → 0)
      const requestsCount = totalRequests
      const bookingsCount = acceptedMatches
      const paymentsCount = verifiedPayments
      const baseline = Math.max(requestsCount, 1)
      const conversionRate = requestsCount > 0 ? Number(((paymentsCount / requestsCount) * 100).toFixed(2)) : 0

      // Catégories : slugs identiques, labels mis à jour (notion "professionnel")
      const categoryLabels = {
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
        // Compat avec demandes historiques :
        demenagement: 'Déménagement',
        technicien: 'Technicien',
        autre: 'Autre professionnel'
      }

      const topCategories = categoryAgg.map(c => ({
        name: categoryLabels[c._id] || c._id || 'Autre',
        requests: c.requests,
        revenue: 0
      }))
      const topCities = cityAgg.map(c => ({
        name: c._id || '—',
        requests: c.requests,
        revenue: 0
      }))

      // Top providers (real, by rating)
      const topProviders = topProvidersByRating.length > 0
        ? topProvidersByRating.map(p => ({
            name: p.businessName || p.name || '—',
            category: categoryLabels[p.serviceCategory] || p.serviceCategory || '—',
            views: 0,
            contacts: 0,
            rating: Number((p.rating || 0).toFixed(1)),
            revenue: 0
          }))
        : [{ name: '—', category: '—', views: 0, contacts: 0, rating: 0, revenue: 0 }]

      const analytics = {
        mainKPIs: {
          visits:     { total: 0, unique: 0, change: '—', trend: 'neutral' },
          clicks:     { total: 0, engagementRate: 0, change: '—', trend: 'neutral' },
          conversion: { rate: conversionRate, total: paymentsCount, change: '—', trend: 'neutral' },
          revenue:    { total: totalRevenue, avgBasket, change: '—', trend: 'neutral' }
        },
        conversionFunnel: {
          visits:   { count: 0, percentage: 0 },
          clicks:   { count: 0, percentage: 0, conversionFromPrevious: 0 },
          requests: {
            count: requestsCount,
            percentage: 100,
            conversionFromPrevious: 0
          },
          bookings: {
            count: bookingsCount,
            percentage: Number(((bookingsCount / baseline) * 100).toFixed(1)),
            conversionFromPrevious: Number(((bookingsCount / baseline) * 100).toFixed(1))
          },
          payments: {
            count: paymentsCount,
            percentage: Number(((paymentsCount / baseline) * 100).toFixed(1)),
            conversionFromPrevious: bookingsCount > 0
              ? Number(((paymentsCount / bookingsCount) * 100).toFixed(1))
              : 0
          },
          globalConversionRate: conversionRate,
          avgDropOffRate: 0
        },
        marketplaceData: {
          totalProviders,
          activeProviders,
          avgResponseRate,
          avgResponseTime: '— min',
          topProviders,
          topCategories,
          topCities
        },
        qualityData: {
          avgRating,
          totalReviews: 0,
          satisfactionRate,
          cancellationRate,
          untreatedRequestsRate,
          topRatedProviders: topProvidersByRating.map(p => ({
            name: p.businessName || p.name || '—',
            rating: Number((p.rating || 0).toFixed(1)),
            reviews: 0
          }))
        },
        generatedAt: new Date().toISOString()
      }

      return handleCORS(NextResponse.json(analytics))
    }

    // ============ WOOKOTV — VIDEOS (new feature, isolated) ============
    // Public endpoint: only published videos
    if (route === '/videos/published' && method === 'GET') {
      const videos = await db
        .collection('videos')
        .find({ status: 'published' })
        .project({ _id: 0 })
        .sort({ createdAt: -1 })
        .toArray()
      return handleCORS(NextResponse.json({ videos }))
    }

    // Admin: list all videos
    if (route === '/admin/videos' && method === 'GET') {
      const videos = await db
        .collection('videos')
        .find({})
        .project({ _id: 0 })
        .sort({ createdAt: -1 })
        .toArray()
      return handleCORS(NextResponse.json({ videos }))
    }

    // Admin: create video
    if (route === '/admin/videos' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const title = (body.title || '').trim()
      const videoUrl = (body.videoUrl || '').trim()
      if (!title || !videoUrl) {
        return handleCORS(NextResponse.json(
          { error: 'title et videoUrl sont requis' },
          { status: 400 }
        ))
      }
      const allowedStatus = ['draft', 'published']
      const allowedCategories = ['Pub', 'Tutoriel', 'Témoignage']
      const status = allowedStatus.includes(body.status) ? body.status : 'draft'
      const category = allowedCategories.includes(body.category) ? body.category : 'Pub'

      const video = {
        id: uuidv4(),
        title,
        category,
        videoUrl,
        thumbnailUrl: (body.thumbnailUrl || '').trim() || null,
        duration: Number.isFinite(Number(body.duration)) ? Math.round(Number(body.duration)) : null,
        description: (body.description || '').trim() || null,
        status,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('videos').insertOne(video)
      const { _id, ...safe } = video
      return handleCORS(NextResponse.json({ ok: true, video: safe }))
    }

    // Admin: update video (PATCH /admin/videos/:id) — including status toggle
    if (route.startsWith('/admin/videos/') && method === 'PATCH') {
      const id = route.split('/').pop()
      const body = await request.json().catch(() => ({}))
      const update = { updatedAt: new Date() }
      const allowedStatus = ['draft', 'published']
      const allowedCategories = ['Pub', 'Tutoriel', 'Témoignage']
      if (typeof body.title === 'string')        update.title = body.title.trim()
      if (typeof body.videoUrl === 'string')     update.videoUrl = body.videoUrl.trim()
      if (typeof body.thumbnailUrl === 'string') update.thumbnailUrl = body.thumbnailUrl.trim() || null
      if (typeof body.description === 'string')  update.description = body.description.trim() || null
      if (Number.isFinite(Number(body.duration))) update.duration = Math.round(Number(body.duration))
      if (allowedStatus.includes(body.status))   update.status = body.status
      if (allowedCategories.includes(body.category)) update.category = body.category

      const result = await db.collection('videos').findOneAndUpdate(
        { id },
        { $set: update },
        { returnDocument: 'after', projection: { _id: 0 } }
      )
      if (!result?.value && !result) {
        return handleCORS(NextResponse.json({ error: 'Video non trouvée' }, { status: 404 }))
      }
      return handleCORS(NextResponse.json({ ok: true, video: result.value || result }))
    }

    // Admin: delete video
    if (route.startsWith('/admin/videos/') && method === 'DELETE') {
      const id = route.split('/').pop()
      const r = await db.collection('videos').deleteOne({ id })
      if (r.deletedCount === 0) {
        return handleCORS(NextResponse.json({ error: 'Video non trouvée' }, { status: 404 }))
      }
      return handleCORS(NextResponse.json({ ok: true, deleted: id }))
    }

    // ============ ADMIN NOTIFICATIONS (Option C — fail-safe) ============
    // Liste les notifications avec compteur PENDING (badge dashboard)
    if (route === '/admin/notifications' && method === 'GET') {
      const [items, pendingCount] = await Promise.all([
        db.collection('admin_notifications')
          .find({})
          .project({ _id: 0 })
          .sort({ createdAt: -1 })
          .limit(50)
          .toArray(),
        db.collection('admin_notifications').countDocuments({ status: 'PENDING' })
      ])
      return handleCORS(NextResponse.json({ notifications: items, pendingCount }))
    }

    // Marquer comme envoyé (clic sur le bouton "Notifier sur WhatsApp")
    if (route.startsWith('/admin/notifications/') && route.endsWith('/sent') && method === 'POST') {
      const id = route.split('/')[3]
      const r = await db.collection('admin_notifications').findOneAndUpdate(
        { id },
        {
          $set: { status: 'SENT', updatedAt: new Date(), sentAt: new Date() },
          $inc: { attempts: 1 }
        },
        { returnDocument: 'after', projection: { _id: 0 } }
      )
      const notif = r?.value || r
      if (!notif) {
        return handleCORS(NextResponse.json({ error: 'Notification non trouvée' }, { status: 404 }))
      }
      console.log(`[notification] Marquée comme envoyée: ${id}`)
      return handleCORS(NextResponse.json({ ok: true, notification: notif }))
    }

    // Supprimer une notification (clear de la liste)
    if (route.startsWith('/admin/notifications/') && method === 'DELETE') {
      const id = route.split('/').pop()
      const r = await db.collection('admin_notifications').deleteOne({ id })
      if (r.deletedCount === 0) {
        return handleCORS(NextResponse.json({ error: 'Notification non trouvée' }, { status: 404 }))
      }
      return handleCORS(NextResponse.json({ ok: true, deleted: id }))
    }

    // ============ PASSWORD MANAGEMENT (LOT 2 - UX) ============

    // GET LOGIN HISTORY (LOT 3c) — affiche les dernières connexions de l'utilisateur connecté
    if (route === '/auth/login-history' && method === 'GET') {
      const authData = await getAuthUser(request, db)
      if (!authData) {
        return handleCORS(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }))
      }
      const items = await db.collection('login_history')
        .find({ userId: authData.user.id })
        .project({ _id: 0 })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray()
      return handleCORS(NextResponse.json({ history: items }))
    }


    // 1) FORGOT PASSWORD — Le prestataire (ou admin) demande une réinitialisation
    //    On crée une notification admin de type PASSWORD_RESET_REQUEST.
    //    Pour des raisons de sécurité, on retourne toujours success=true
    //    même si l'utilisateur n'existe pas (anti-énumération).
    if (route === '/auth/forgot-password' && method === 'POST') {
      const body = await request.json()
      const { phone, role } = body || {}

      if (!phone) {
        return handleCORS(NextResponse.json({ error: 'Numéro WhatsApp requis' }, { status: 400 }))
      }

      const normalizedPhone = phone.replace(/[^\d]/g, '').slice(-9)
      const queryRole = role === 'ADMIN' ? 'ADMIN' : 'PROVIDER'

      const user = await db.collection('users').findOne({
        phone: { $regex: new RegExp(normalizedPhone) },
        role: queryRole
      })

      // Réponse identique dans les deux cas (anti-énumération)
      const genericMessage = 'Si ce numéro est enregistré, votre demande a été transmise à l\'administrateur. Vous recevrez votre nouveau mot de passe par WhatsApp.'

      if (!user) {
        console.log(`[forgot-password] Demande pour numéro inconnu : ${phone}`)
        return handleCORS(NextResponse.json({
          success: true,
          message: genericMessage
        }))
      }

      // Vérifie qu'il n'y a pas déjà une demande PENDING pour cet user
      const existing = await db.collection('admin_notifications').findOne({
        type: 'PASSWORD_RESET_REQUEST',
        status: 'PENDING',
        'payload.userId': user.id
      })

      if (existing) {
        return handleCORS(NextResponse.json({
          success: true,
          message: 'Une demande de réinitialisation est déjà en attente pour ce compte. Veuillez patienter ou contacter le support.'
        }))
      }

      // Récupérer le businessName si prestataire
      let displayName = user.name
      if (user.role === 'PROVIDER') {
        const prof = await db.collection('provider_profiles').findOne({ userId: user.id })
        if (prof?.businessName) displayName = prof.businessName
      }

      const now = new Date()
      const message =
        '🔐 Demande de réinitialisation de mot de passe\n\n' +
        `Compte : ${displayName}\n` +
        `Téléphone : ${user.phone}\n` +
        `Rôle : ${user.role}\n` +
        `Date : ${now.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n\n` +
        'Action requise : générer un mot de passe temporaire et le transmettre par WhatsApp.'

      const notification = {
        id: uuidv4(),
        type: 'PASSWORD_RESET_REQUEST',
        targetPhone: user.phone,
        message,
        payload: {
          userId: user.id,
          phone: user.phone,
          name: displayName,
          role: user.role
        },
        status: 'PENDING',
        attempts: 0,
        createdAt: now,
        updatedAt: now
      }
      await db.collection('admin_notifications').insertOne(notification)
      console.log(`[forgot-password] Notification créée pour ${displayName} (${user.id})`)

      return handleCORS(NextResponse.json({
        success: true,
        message: genericMessage
      }))
    }

    // 2) ADMIN RESET PASSWORD — L'admin clique sur la notification
    //    et génère un mot de passe temporaire pour transmission WhatsApp.
    //    Invalide toutes les sessions actives de l'utilisateur (tokenVersion++).
    if (route.match(/^\/admin\/notifications\/[^/]+\/reset-password$/) && method === 'POST') {
      const authData = await getAuthUser(request, db)
      if (!authData || authData.user.role !== 'ADMIN') {
        return handleCORS(NextResponse.json({ error: 'Non autorisé' }, { status: 401 }))
      }

      const notificationId = route.split('/')[3]
      const notification = await db.collection('admin_notifications').findOne({ id: notificationId })

      if (!notification) {
        return handleCORS(NextResponse.json({ error: 'Notification non trouvée' }, { status: 404 }))
      }
      if (notification.type !== 'PASSWORD_RESET_REQUEST') {
        return handleCORS(NextResponse.json({ error: 'Type de notification invalide' }, { status: 400 }))
      }

      const userId = notification.payload?.userId
      if (!userId) {
        return handleCORS(NextResponse.json({ error: 'Notification sans userId' }, { status: 400 }))
      }

      const targetUser = await db.collection('users').findOne({ id: userId })
      if (!targetUser) {
        return handleCORS(NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 }))
      }

      // Génère le mot de passe temporaire et le hash
      const tempPassword = generateTempPassword()
      const passwordHash = await bcrypt.hash(tempPassword, 10)

      // Incrémente tokenVersion pour invalider toutes les sessions actives
      await db.collection('users').updateOne(
        { id: userId },
        {
          $set: { passwordHash, updatedAt: new Date() },
          $inc: { tokenVersion: 1 }
        }
      )

      // Construit l'URL wa.me pour transmission au prestataire
      const supportPhone = (targetUser.phone || '').replace(/[^\d]/g, '')
      const waMessage =
        '🔐 WookoPRO - Réinitialisation de votre mot de passe\n\n' +
        `Bonjour ${notification.payload?.name || 'Prestataire'},\n\n` +
        'Votre mot de passe temporaire est :\n\n' +
        `🔑 ${tempPassword}\n\n` +
        'Veuillez vous connecter avec ce mot de passe puis le changer immédiatement depuis votre tableau de bord (section "Mon compte").\n\n' +
        'Pour votre sécurité, ce mot de passe ne devrait être utilisé qu\'une seule fois.'

      const waUrl = supportPhone
        ? `https://wa.me/${supportPhone}?text=${encodeURIComponent(waMessage)}`
        : null

      // Marquer la notification comme traitée
      await db.collection('admin_notifications').updateOne(
        { id: notificationId },
        {
          $set: {
            status: 'SENT',
            sentAt: new Date(),
            updatedAt: new Date(),
            resetBy: authData.user.id,
            tempPasswordGeneratedAt: new Date()
          },
          $inc: { attempts: 1 }
        }
      )

      console.log(`[admin-reset-password] Admin ${authData.user.id} a réinitialisé le mot de passe de ${userId}`)

      return handleCORS(NextResponse.json({
        success: true,
        tempPassword,
        waUrl,
        waMessage,
        message: 'Mot de passe temporaire généré. Toutes les sessions actives ont été invalidées.'
      }))
    }

    // 3) CHANGE PASSWORD — L'utilisateur connecté change son propre mot de passe
    //    Conserve la session actuelle (nouveau token avec tokenVersion incrémenté),
    //    invalide toutes les AUTRES sessions actives.
    if (route === '/auth/change-password' && method === 'POST') {
      const authData = await getAuthUser(request, db)
      if (!authData) {
        return handleCORS(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }))
      }

      const body = await request.json()
      const { currentPassword, newPassword } = body || {}

      if (!currentPassword || !newPassword) {
        return handleCORS(NextResponse.json({ error: 'Mot de passe actuel et nouveau requis' }, { status: 400 }))
      }

      const user = authData.user
      if (!user.passwordHash) {
        return handleCORS(NextResponse.json({ error: 'Aucun mot de passe défini sur ce compte' }, { status: 400 }))
      }

      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) {
        return handleCORS(NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 401 }))
      }

      // Empêche de réutiliser exactement le même mot de passe
      const sameAsBefore = await bcrypt.compare(newPassword, user.passwordHash)
      if (sameAsBefore) {
        return handleCORS(NextResponse.json({ error: 'Le nouveau mot de passe doit être différent de l\'ancien' }, { status: 400 }))
      }

      const pwdErr = validatePasswordStrength(newPassword)
      if (pwdErr) {
        return handleCORS(NextResponse.json({ error: pwdErr }, { status: 400 }))
      }

      const newHash = await bcrypt.hash(newPassword, 10)
      const newTokenVersion = (user.tokenVersion ?? 0) + 1

      await db.collection('users').updateOne(
        { id: user.id },
        {
          $set: {
            passwordHash: newHash,
            tokenVersion: newTokenVersion,
            updatedAt: new Date(),
            lastPasswordChange: new Date(),
            mustChangePassword: false
          }
        }
      )

      // Génère un nouveau token avec le tokenVersion mis à jour (conserve la session actuelle)
      const newToken = signUserToken({ ...user, tokenVersion: newTokenVersion })

      // Notification admin (audit / traçabilité) - non bloquante
      try {
        let displayName = user.name
        if (user.role === 'PROVIDER') {
          const prof = await db.collection('provider_profiles').findOne({ userId: user.id })
          if (prof?.businessName) displayName = prof.businessName
        }
        const now = new Date()
        const auditMessage =
          '🔒 Changement de mot de passe\n\n' +
          `Compte : ${displayName}\n` +
          `Téléphone : ${user.phone}\n` +
          `Rôle : ${user.role}\n` +
          `Date : ${now.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n\n` +
          'Toutes les autres sessions ont été déconnectées automatiquement.'

        await db.collection('admin_notifications').insertOne({
          id: uuidv4(),
          type: 'PASSWORD_CHANGED',
          targetPhone: user.phone,
          message: auditMessage,
          payload: { userId: user.id, name: displayName, role: user.role },
          status: 'SENT',
          attempts: 0,
          createdAt: now,
          updatedAt: now,
          sentAt: now
        })
      } catch (auditErr) {
        console.error('[change-password] Erreur enregistrement audit:', auditErr.message)
      }

      console.log(`[change-password] User ${user.id} a changé son mot de passe (tokenVersion=${newTokenVersion})`)

      return handleCORS(NextResponse.json({
        success: true,
        token: newToken,
        message: 'Mot de passe modifié avec succès. Les autres sessions actives ont été déconnectées.'
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
      await db.collection('users').updateOne(
        { phone: admin.phone },
        {
          $setOnInsert: { id: admin.id, role: admin.role, createdAt: admin.createdAt },
          $set: { name: admin.name, email: admin.email, phone: admin.phone, passwordHash, updatedAt: new Date() }
        },
        { upsert: true }
      )

      const categories = [
        { id: uuidv4(), name: 'Plomberie', slug: 'plombier' },
        { id: uuidv4(), name: 'Électricité', slug: 'electricien' },
        { id: uuidv4(), name: 'Climatisation', slug: 'climatiseur' },
        { id: uuidv4(), name: 'Maçonnerie', slug: 'macon' },
        { id: uuidv4(), name: 'Tapisserie', slug: 'tapissier' },
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
        } else if (!existingUser.passwordHash) {
          // 🔧 Upgrade : si un user seed existant n'a pas de hash (cas legacy), on le rétablit
          await db.collection('users').updateOne(
            { id: existingUser.id },
            { $set: { passwordHash, updatedAt: new Date() } }
          )
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

      // ============ Demo requests + matches (idempotent) ============
      // Crée 5 demandes client + dispatch automatique (max 3 matches/demande)
      // si la base est vide, pour que le dashboard affiche immédiatement des compteurs non-nuls.
      const existingRequestsCount = await db.collection('service_requests').countDocuments()
      let seededRequests = 0
      let seededMatches = 0

      if (existingRequestsCount === 0) {
        const allCategories = await db.collection('categories').find({}).toArray()
        const allProviderProfiles = await db.collection('provider_profiles').find({}).toArray()

        const demoRequests = [
          { clientPhone: '+221770000201', name: 'Aïssatou Diop',  serviceCategory: 'plombier',    city: 'Dakar', zone: 'Ouakam',      rawMessage: 'Fuite urgente sous évier cuisine, besoin d\'un plombier rapidement.', urgency: 'urgente' },
          { clientPhone: '+221770000202', name: 'Moussa Ndiaye',  serviceCategory: 'electricien', city: 'Dakar', zone: 'Pikine',      rawMessage: 'Tableau électrique disjoncte sans arrêt, panne courant secteur.', urgency: 'urgente' },
          { clientPhone: '+221770000203', name: 'Fatou Sall',     serviceCategory: 'climatiseur', city: 'Thiès', zone: 'Thiès Nord',  rawMessage: 'Climatisation bureau ne fait plus de froid, intervention demandée.', urgency: 'normale' },
          { clientPhone: '+221770000204', name: 'Ibrahima Faye',  serviceCategory: 'menuisier',   city: 'Dakar', zone: 'Médina',      rawMessage: 'Besoin d\'un menuisier pour réparer une porte d\'entrée.', urgency: 'normale' },
          { clientPhone: '+221770000205', name: 'Mariama Kane',   serviceCategory: 'nettoyage',   city: 'Dakar', zone: 'Almadies',    rawMessage: 'Nettoyage complet appartement 3 pièces avant emménagement.', urgency: 'faible' }
        ]

        for (const dr of demoRequests) {
          // Crée/retrouve le user client
          let clientUser = await db.collection('users').findOne({ phone: dr.clientPhone })
          if (!clientUser) {
            clientUser = {
              id: uuidv4(),
              name: dr.name,
              phone: dr.clientPhone,
              role: 'CLIENT',
              createdAt: new Date(),
              updatedAt: new Date()
            }
            await db.collection('users').insertOne(clientUser)
          }

          const requestId = uuidv4()
          const serviceRequest = {
            id: requestId,
            clientId: clientUser.id,
            clientPhone: dr.clientPhone,
            rawMessage: dr.rawMessage,
            normalizedText: dr.rawMessage,
            serviceCategory: dr.serviceCategory,
            city: dr.city,
            zone: dr.zone,
            urgency: dr.urgency,
            status: 'MATCHING',
            source: 'seed',
            canal: 'seed',
            createdAt: new Date(),
            updatedAt: new Date()
          }
          await db.collection('service_requests').insertOne(serviceRequest)
          seededRequests++

          // Trouve jusqu'à 3 prestataires éligibles (catégorie + ville)
          const eligible = allProviderProfiles
            .filter(p => p.serviceCategory === dr.serviceCategory && p.city === dr.city)
            .slice(0, 3)

          for (let i = 0; i < eligible.length; i++) {
            const p = eligible[i]
            // 1er match accepté pour la 1ère demande pour montrer un "Accepté" non-nul,
            // les autres en statut SENT (= "En attente" côté dashboard).
            const matchStatus = (seededRequests === 1 && i === 0) ? 'ACCEPTED' : 'SENT'
            const match = {
              id: uuidv4(),
              requestId,
              providerId: p.id,
              providerUserId: p.userId,
              score: 80 - i * 5,
              status: matchStatus,
              reason: 'Catégorie + ville',
              createdAt: new Date(),
              updatedAt: new Date()
            }
            await db.collection('request_matches').insertOne(match)
            seededMatches++
          }
        }
      }

      // Stats post-seed pour feedback frontend
      const [providersCount, requestsCount, matchesCount, pendingCount, acceptedCount] = await Promise.all([
        db.collection('provider_profiles').countDocuments(),
        db.collection('service_requests').countDocuments(),
        db.collection('request_matches').countDocuments(),
        db.collection('request_matches').countDocuments({ status: 'PENDING' }),
        db.collection('request_matches').countDocuments({ status: 'ACCEPTED' })
      ])

      return handleCORS(NextResponse.json({
        ok: true,
        message: 'Base de données initialisée',
        seededProviders: providerData.length,
        seededRequests,
        seededMatches,
        stats: {
          providers: providersCount,
          requests: requestsCount,
          matches: matchesCount,
          pending: pendingCount,
          accepted: acceptedCount
        },
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
