'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      })

      const data = await res.json()

      if (res.ok) {
        localStorage.setItem('wooleen_token', data.token)
        localStorage.setItem('wooleen_user', JSON.stringify(data.user))

        if (data.user.role === 'CLIENT') {
          router.push('/client/dashboard')
        } else if (data.user.role === 'PROVIDER') {
          router.push('/provider/dashboard')
        } else if (data.user.role === 'ADMIN') {
          router.push('/secure-wooleen-admin')
        }
      } else {
        setError(data.error || 'Erreur de connexion')
      }
    } catch (error) {
      setError('Erreur de connexion')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link href="/">
            <img 
              src="/wooko-logo.png" 
              alt="Wooko" 
              className="h-[80px] sm:h-[120px] w-auto mx-auto mb-6 object-contain" 
            />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Connexion</h1>
          <p className="text-gray-600 mt-2">Accédez à votre espace client</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Numéro de téléphone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+221..."
                className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>

            <p className="text-sm text-center text-gray-500">
              Mot de passe par défaut : <code className="bg-gray-100 px-2 py-1 rounded">wooleen2025</code>
            </p>
          </form>
        </div>

        <p className="text-center mt-4 text-sm text-gray-600">
          Vous êtes prestataire ? <Link href="/provider/login" className="text-orange-600 hover:underline">Accédez à votre espace</Link>
        </p>

        <p className="text-center mt-2">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← Retour à l'accueil</Link>
        </p>
      </div>
    </div>
  )
}
