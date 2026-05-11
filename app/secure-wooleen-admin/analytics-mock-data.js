// Empty analytics shape — populated at runtime from /api/admin/analytics
// All values are 0 / [] until real data is computed from MongoDB.
// No external API, no hardcoded numbers.

export const EMPTY_ANALYTICS = {
  mainKPIs: {
    visits:     { total: 0, unique: 0, change: '—', trend: 'neutral' },
    clicks:     { total: 0, engagementRate: 0, change: '—', trend: 'neutral' },
    conversion: { rate: 0, total: 0, change: '—', trend: 'neutral' },
    revenue:    { total: 0, avgBasket: 0, change: '—', trend: 'neutral' }
  },
  conversionFunnel: {
    visits:    { count: 0, percentage: 0 },
    clicks:    { count: 0, percentage: 0, conversionFromPrevious: 0 },
    requests:  { count: 0, percentage: 0, conversionFromPrevious: 0 },
    bookings:  { count: 0, percentage: 0, conversionFromPrevious: 0 },
    payments:  { count: 0, percentage: 0, conversionFromPrevious: 0 },
    globalConversionRate: 0,
    avgDropOffRate: 0
  },
  marketplaceData: {
    totalProviders: 0,
    activeProviders: 0,
    avgResponseRate: 0,
    avgResponseTime: '— min',
    topProviders: [{ name: '—', category: '—', views: 0, contacts: 0, rating: 0, revenue: 0 }],
    topCategories: [],
    topCities: []
  },
  qualityData: {
    avgRating: 0,
    totalReviews: 0,
    satisfactionRate: 0,
    cancellationRate: 0,
    untreatedRequestsRate: 0,
    topRatedProviders: []
  }
}

// ===== Helper formatters (pure utilities) =====
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount || 0)) + ' FCFA'
}

export const formatNumber = (num) => {
  return new Intl.NumberFormat('fr-FR').format(Math.round(num || 0))
}

export const formatPercentage = (num) => {
  return (Number(num) || 0).toFixed(1) + '%'
}
