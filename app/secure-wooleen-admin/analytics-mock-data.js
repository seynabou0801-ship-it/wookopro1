// 📊 DONNÉES MOCKÉES POUR ANALYTICS DASHBOARD
// Ce fichier contient toutes les données statiques pour la section Analytics
// Aucun appel API - données purement front-end pour démonstration

// ===== KPIs PRINCIPAUX =====
export const mainKPIs = {
  visits: {
    total: 12458,
    unique: 8942,
    change: '+24%',
    trend: 'up'
  },
  clicks: {
    total: 3267,
    engagementRate: 26.2,
    change: '+31%',
    trend: 'up'
  },
  conversion: {
    rate: 5.89,
    total: 734,
    change: '+18%',
    trend: 'up'
  },
  revenue: {
    total: 8200000, // en FCFA
    avgBasket: 11180,
    change: '+29%',
    trend: 'up'
  }
}

// ===== ACQUISITION =====
export const acquisitionData = {
  sessions: 10234,
  pageViews: 34567,
  bounceRate: 38.2,
  avgSessionDuration: '4m 32s',
  newVsReturning: {
    new: 6542,
    returning: 5916
  },
  trafficSources: [
    { name: 'Direct', value: 42, visits: 5232, color: '#0B2A4A' },
    { name: 'Google', value: 28, visits: 3488, color: '#FF6A00' },
    { name: 'Facebook', value: 15, visits: 1869, color: '#4267B2' },
    { name: 'WhatsApp', value: 10, visits: 1246, color: '#25D366' },
    { name: 'Instagram', value: 5, visits: 623, color: '#E4405F' }
  ]
}

// ===== ENGAGEMENT =====
export const engagementData = {
  totalClicks: 3267,
  clicksByType: {
    whatsappButton: 1234,
    findPro: 892,
    categories: 678,
    providerProfiles: 463
  },
  topPages: [
    { page: 'Accueil', views: 5432, ctr: 28.4 },
    { page: 'Plomberie', views: 2341, ctr: 31.2 },
    { page: 'Électricité', views: 1987, ctr: 29.8 },
    { page: 'Profils prestataires', views: 1654, ctr: 35.6 },
    { page: 'Nettoyage', views: 1432, ctr: 27.3 }
  ],
  globalCTR: 26.2
}

// ===== CONVERSION FUNNEL =====
export const conversionFunnel = {
  visits: { count: 12458, percentage: 100 },
  clicks: { count: 3267, percentage: 26.2, conversionFromPrevious: 26.2 },
  requests: { count: 1845, percentage: 14.8, conversionFromPrevious: 56.5 },
  bookings: { count: 892, percentage: 7.2, conversionFromPrevious: 48.4 },
  payments: { count: 734, percentage: 5.9, conversionFromPrevious: 82.3 },
  globalConversionRate: 5.89,
  avgDropOffRate: 23.7
}

// ===== MARKETPLACE =====
export const marketplaceData = {
  totalProviders: 847,
  activeProviders: 612,
  avgResponseRate: 87.3,
  avgResponseTime: '12 min',
  topProviders: [
    { name: 'Cheikh Électricien', category: 'Électricité', views: 342, contacts: 89, rating: 4.9, revenue: 485000 },
    { name: 'Fatou Plomberie', category: 'Plomberie', views: 298, contacts: 76, rating: 4.8, revenue: 412000 },
    { name: 'Moussa Climatisation', category: 'Climatisation', views: 267, contacts: 71, rating: 4.7, revenue: 398000 },
    { name: 'Awa Nettoyage Pro', category: 'Nettoyage', views: 245, contacts: 68, rating: 4.8, revenue: 356000 },
    { name: 'Ibrahima Menuiserie', category: 'Menuiserie', views: 223, contacts: 62, rating: 4.6, revenue: 334000 }
  ],
  topCategories: [
    { name: 'Plomberie', requests: 342, revenue: 1890000 },
    { name: 'Électricité', requests: 298, revenue: 1645000 },
    { name: 'Nettoyage', requests: 267, revenue: 1234000 },
    { name: 'Climatisation', requests: 234, revenue: 1098000 },
    { name: 'Menuiserie', requests: 189, revenue: 876000 }
  ],
  topCities: [
    { name: 'Dakar', requests: 589, revenue: 3245000 },
    { name: 'Thiès', requests: 234, revenue: 1287000 },
    { name: 'Saint-Louis', requests: 198, revenue: 1089000 },
    { name: 'Kaolack', requests: 156, revenue: 859000 },
    { name: 'Ziguinchor', requests: 123, revenue: 678000 }
  ]
}

// ===== QUALITÉ =====
export const qualityData = {
  avgRating: 4.7,
  totalReviews: 3482,
  satisfactionRate: 94.2,
  cancellationRate: 3.8,
  untreatedRequestsRate: 2.1,
  topRatedProviders: [
    { name: 'Cheikh Électricien', rating: 4.9, reviews: 127 },
    { name: 'Fatou Plomberie', rating: 4.8, reviews: 98 },
    { name: 'Awa Nettoyage Pro', rating: 4.8, reviews: 84 },
    { name: 'Moussa Climatisation', rating: 4.7, reviews: 76 },
    { name: 'Ibrahima Menuiserie', rating: 4.6, reviews: 62 }
  ]
}

// ===== BUSINESS =====
export const businessData = {
  totalRevenue: 8200000,
  paymentVolume: 7380000,
  avgBasket: 11180,
  platformCommission: 820000,
  commissionRate: 10,
  revenueByCategory: [
    { category: 'Plomberie', revenue: 1890000, percentage: 23.0 },
    { category: 'Électricité', revenue: 1645000, percentage: 20.1 },
    { category: 'Nettoyage', revenue: 1234000, percentage: 15.0 },
    { category: 'Climatisation', revenue: 1098000, percentage: 13.4 },
    { category: 'Menuiserie', revenue: 876000, percentage: 10.7 },
    { category: 'Autres', revenue: 1457000, percentage: 17.8 }
  ],
  revenueByCity: [
    { city: 'Dakar', revenue: 3245000, percentage: 39.6 },
    { city: 'Thiès', revenue: 1287000, percentage: 15.7 },
    { city: 'Saint-Louis', revenue: 1089000, percentage: 13.3 },
    { city: 'Kaolack', revenue: 859000, percentage: 10.5 },
    { city: 'Autres', revenue: 1720000, percentage: 21.0 }
  ],
  growthRate: 28.9,
  previousPeriodRevenue: 6356000
}

// ===== ÉVOLUTION TRAFIC (7 derniers jours) =====
export const trafficEvolution = [
  { day: 'Lun', date: '15/04', visits: 1420, uniqueVisitors: 1089, clicks: 384, requests: 198 },
  { day: 'Mar', date: '16/04', visits: 1680, uniqueVisitors: 1298, clicks: 445, requests: 234 },
  { day: 'Mer', date: '17/04', visits: 1890, uniqueVisitors: 1456, clicks: 512, requests: 276 },
  { day: 'Jeu', date: '18/04', visits: 2100, uniqueVisitors: 1623, clicks: 567, requests: 298 },
  { day: 'Ven', date: '19/04', visits: 2340, uniqueVisitors: 1801, clicks: 634, requests: 342 },
  { day: 'Sam', date: '20/04', visits: 1950, uniqueVisitors: 1501, clicks: 523, requests: 287 },
  { day: 'Dim', date: '21/04', visits: 1580, uniqueVisitors: 1174, clicks: 402, requests: 210 }
]

// ===== ÉVOLUTION TRAFIC (30 derniers jours - simplifié) =====
export const trafficEvolution30Days = [
  { week: 'S1', visits: 8234, conversion: 5.2 },
  { week: 'S2', visits: 9156, conversion: 5.5 },
  { week: 'S3', visits: 10890, conversion: 5.8 },
  { week: 'S4', visits: 12458, conversion: 5.9 }
]

// ===== TABLEAU DÉTAILLÉ PRESTATAIRES =====
export const providersDetailedTable = [
  {
    id: 1,
    name: 'Cheikh Électricien',
    category: 'Électricité',
    city: 'Dakar',
    profileViews: 342,
    clicks: 189,
    contactsReceived: 89,
    responseRate: 92.1,
    avgRating: 4.9,
    totalReviews: 127,
    revenue: 485000,
    conversions: 76
  },
  {
    id: 2,
    name: 'Fatou Plomberie',
    category: 'Plomberie',
    city: 'Dakar',
    profileViews: 298,
    clicks: 167,
    contactsReceived: 76,
    responseRate: 89.5,
    avgRating: 4.8,
    totalReviews: 98,
    revenue: 412000,
    conversions: 64
  },
  {
    id: 3,
    name: 'Moussa Climatisation',
    category: 'Climatisation',
    city: 'Thiès',
    profileViews: 267,
    clicks: 145,
    contactsReceived: 71,
    responseRate: 88.7,
    avgRating: 4.7,
    totalReviews: 76,
    revenue: 398000,
    conversions: 59
  },
  {
    id: 4,
    name: 'Awa Nettoyage Pro',
    category: 'Nettoyage',
    city: 'Dakar',
    profileViews: 245,
    clicks: 134,
    contactsReceived: 68,
    responseRate: 90.2,
    avgRating: 4.8,
    totalReviews: 84,
    revenue: 356000,
    conversions: 58
  },
  {
    id: 5,
    name: 'Ibrahima Menuiserie',
    category: 'Menuiserie',
    city: 'Saint-Louis',
    profileViews: 223,
    clicks: 121,
    contactsReceived: 62,
    responseRate: 85.5,
    avgRating: 4.6,
    totalReviews: 62,
    revenue: 334000,
    conversions: 51
  }
]

// ===== HELPER FUNCTIONS =====
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
}

export const formatNumber = (num) => {
  return new Intl.NumberFormat('fr-FR').format(num)
}

export const formatPercentage = (num) => {
  return num.toFixed(1) + '%'
}
