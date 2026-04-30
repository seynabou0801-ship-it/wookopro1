import { NextResponse } from 'next/server'
import { MongoClient, ObjectId } from 'mongodb'

// MongoDB Connection
let client
let db

async function connectDB() {
  if (db) return db
  
  try {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db()
    console.log('✅ MongoDB connected successfully')
    return db
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    throw error
  }
}

// CORS Helper
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

// Main Route Handler
export async function GET(request) {
  return handleRequest(request, 'GET')
}

export async function POST(request) {
  return handleRequest(request, 'POST')
}

export async function PUT(request) {
  return handleRequest(request, 'PUT')
}

export async function PATCH(request) {
  return handleRequest(request, 'PATCH')
}

export async function DELETE(request) {
  return handleRequest(request, 'DELETE')
}

export async function OPTIONS(request) {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

async function handleRequest(request, method) {
  try {
    const db = await connectDB()
    const url = new URL(request.url)
    const route = url.pathname.replace('/api', '')

    console.log(`${method} ${route}`)

    // ============ AUTH ROUTES ============
    
    // Admin Login
    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json()
      const { phone, password } = body

      const user = await db.collection('users').findOne({ 
        phone, 
        role: 'admin' 
      })

      if (!user || user.password !== password) {
        return handleCORS(NextResponse.json({ 
          error: 'Identifiants invalides' 
        }, { status: 401 }))
      }

      const { _id, password: _, ...cleanUser } = user
      const token = Buffer.from(user.id).toString('base64')

      return handleCORS(NextResponse.json({ 
        success: true, 
        token, 
        user: cleanUser 
      }))
    }

    // Provider Login
    if (route === '/auth/provider/login' && method === 'POST') {
      const body = await request.json()
      const { phone, password } = body

      const user = await db.collection('users').findOne({ 
        phone, 
        role: 'provider' 
      })

      if (!user) {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_INEXISTANT',
          message: 'Aucun compte trouvé avec ce numéro.' 
        }, { status: 404 }))
      }

      if (user.password !== password) {
        return handleCORS(NextResponse.json({ 
          error: 'MOT_DE_PASSE_INCORRECT',
          message: 'Mot de passe incorrect.' 
        }, { status: 401 }))
      }

      // Check account status
      if (user.status === 'EN_ATTENTE' || user.status === 'PENDING') {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_EN_ATTENTE',
          message: 'Votre compte est en attente de validation par l\'administrateur.'
        }, { status: 403 }))
      }

      if (user.status === 'REJETE') {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_REJETE',
          message: 'Votre demande d\'inscription a été refusée.'
        }, { status: 403 }))
      }

      if (user.status === 'INACTIVE' || user.status === 'SUSPENDED') {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_INACTIF',
          message: 'Votre compte a été désactivé. Contactez le support au 77 338 90 95.'
        }, { status: 403 }))
      }

      // Only VALIDE or ACTIVE accounts can login
      if (user.status && user.status !== 'VALIDE' && user.status !== 'ACTIVE') {
        return handleCORS(NextResponse.json({ 
          error: 'COMPTE_INACTIF',
          message: 'Votre compte n\'est pas actif.'
        }, { status: 403 }))
      }

      const { _id, password: _, ...cleanUser } = user
      const token = Buffer.from(user.id).toString('base64')

      const profile = await db.collection('provider_profiles').findOne({ 
        userId: user.id 
      })

      return handleCORS(NextResponse.json({ 
        success: true, 
        token, 
        user: cleanUser,
        profile: profile ? { ...profile, _id: undefined } : null
      }))
    }

    // Provider Register
    if (route === '/auth/provider/register' && method === 'POST') {
      const body = await request.json()
      const { name, phone, city, service, password } = body

      // Check if phone already exists
      const existing = await db.collection('users').findOne({ phone })
      if (existing) {
        return handleCORS(NextResponse.json({ 
          error: 'Numéro déjà enregistré' 
        }, { status: 400 }))
      }

      const userId = `provider_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Create user
      const user = {
        id: userId,
        phone,
        password,
        role: 'provider',
        status: 'ACTIVE',
        createdAt: new Date()
      }

      await db.collection('users').insertOne(user)

      // Create provider profile
      const profile = {
        id: `profile_${Date.now()}`,
        userId,
        businessName: name,
        city,
        serviceCategory: service,
        phone,
        isAvailable: true,
        rating: 0,
        tier: 'free',
        createdAt: new Date()
      }

      await db.collection('provider_profiles').insertOne(profile)

      const { _id, password: _, ...cleanUser } = user
      const token = Buffer.from(userId).toString('base64')

      return handleCORS(NextResponse.json({ 
        success: true, 
        token, 
        user: cleanUser,
        profile: { ...profile, _id: undefined }
      }))
    }

    // ============ PROVIDERS ROUTES ============
    
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
          { $sort: { tier: -1, rating: -1, createdAt: -1 } }
        ])
        .toArray()
      
      const enrichedProviders = providers.map(({ _id, ...p }) => ({
        ...p,
        accountStatus: p.user?.status || 'ACTIVE',
        disabledReason: p.user?.disabledReason || null,
        disabledAt: p.user?.disabledAt || null
      }))
      
      return handleCORS(NextResponse.json(enrichedProviders))
    }

    // Provider Status Management
    const statusMatch = route.match(/^\/providers\/([a-zA-Z0-9-_]+)\/status$/)
    if (statusMatch && method === 'PATCH') {
      const providerId = statusMatch[1]
      const body = await request.json()
      
      const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']
      if (!validStatuses.includes(body.status)) {
        return handleCORS(NextResponse.json({ 
          error: 'Statut invalide' 
        }, { status: 400 }))
      }

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

      const updatedUser = await db.collection('users').findOne({ id: providerId })
      const { _id, ...cleanUser } = updatedUser

      return handleCORS(NextResponse.json({
        success: true,
        user: cleanUser,
        message: `Statut changé vers ${body.status}`
      }))
    }

    // ============ SUBSCRIPTIONS ROUTES ============
    
    if (route === '/subscriptions/create' && method === 'POST') {
      const body = await request.json()
      const { providerId, plan, paymentProof } = body

      const subscriptionId = `sub_${Date.now()}`

      const subscription = {
        id: subscriptionId,
        providerId,
        plan,
        status: 'PENDING_VALIDATION',
        paymentProof,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days trial
      }

      await db.collection('subscriptions').insertOne(subscription)

      return handleCORS(NextResponse.json({ 
        success: true, 
        subscription: { ...subscription, _id: undefined }
      }))
    }

    if (route === '/admin/subscriptions/pending' && method === 'GET') {
      const subscriptions = await db.collection('subscriptions')
        .aggregate([
          { $match: { status: 'PENDING_VALIDATION' } },
          { 
            $lookup: { 
              from: 'provider_profiles', 
              localField: 'providerId', 
              foreignField: 'userId', 
              as: 'provider' 
            } 
          },
          { $unwind: '$provider' },
          { $sort: { createdAt: -1 } }
        ])
        .toArray()

      return handleCORS(NextResponse.json({
        subscriptions: subscriptions.map(({ _id, ...sub }) => sub)
      }))
    }

    const validateSubMatch = route.match(/^\/admin\/subscriptions\/([a-zA-Z0-9-_]+)\/validate$/)
    if (validateSubMatch && method === 'POST') {
      const subId = validateSubMatch[1]
      const body = await request.json()

      if (body.action === 'approve') {
        await db.collection('subscriptions').updateOne(
          { id: subId },
          { 
            $set: { 
              status: 'ACTIVE',
              validatedAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } 
          }
        )

        return handleCORS(NextResponse.json({ 
          success: true, 
          message: 'Abonnement validé' 
        }))
      } else {
        await db.collection('subscriptions').updateOne(
          { id: subId },
          { 
            $set: { 
              status: 'REJECTED',
              rejectedAt: new Date(),
              paymentProof: null
            } 
          }
        )

        return handleCORS(NextResponse.json({ 
          success: true, 
          message: 'Abonnement rejeté' 
        }))
      }
    }

    // ============ ADMIN STATS ============
    
    if (route === '/admin/stats' && method === 'GET') {
      const [
        totalProviders,
        activeProviders,
        totalRequests,
        pendingRequests
      ] = await Promise.all([
        db.collection('provider_profiles').countDocuments(),
        db.collection('provider_profiles').countDocuments({ isAvailable: true }),
        db.collection('service_requests').countDocuments(),
        db.collection('service_requests').countDocuments({ status: 'SUBMITTED' })
      ])

      return handleCORS(NextResponse.json({
        totalProviders,
        activeProviders,
        totalRequests,
        pendingRequests
      }))
    }

    // ============ REQUESTS ROUTES ============
    
    if (route === '/requests' && method === 'GET') {
      const requests = await db.collection('service_requests')
        .find()
        .sort({ createdAt: -1 })
        .toArray()

      return handleCORS(NextResponse.json(
        requests.map(({ _id, ...req }) => req)
      ))
    }

    // ============ DEFAULT 404 ============
    
    return handleCORS(NextResponse.json({ 
      error: 'Route not found',
      route,
      method 
    }, { status: 404 }))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json({ 
      error: 'Internal server error',
      message: error.message 
    }, { status: 500 }))
  }
}
