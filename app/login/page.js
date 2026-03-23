'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const phone = process.env.NEXT_PUBLIC_DEFAULT_WHATSAPP_NUMBER || "+33746380448"
  const [phoneInput, setPhoneInput] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput, password })
      })

      const data = await res.json()

      if (res.ok && data.success) {
        localStorage.setItem('wooleen_token', data.token)
        localStorage.setItem('wooleen_user', JSON.stringify(data.user))

        // Redirect based on role
        if (data.user.role === 'CLIENT') {
          router.push('/client/dashboard')
        } else if (data.user.role === 'PROVIDER') {
          router.push('/provider/dashboard')
        } else if (data.user.role === 'ADMIN') {
          router.push('/secure-wooleen-admin')
        } else {
          router.push('/')
        }
      } else {
        setError(data.error || 'Erreur de connexion')
      }
    } catch (err) {
      setError('Erreur de connexion au serveur')
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Wooleen
          </Link>
          <Link href="/provider/login" className="text-sm text-gray-600 hover:text-black">
            Espace prestataire
          </Link>
        </div>
      </header>

      <div className="flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Connexion</h1>
            <p className="mt-2 text-gray-600">Accédez à votre espace client</p>
          </div>

          <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numéro de téléphone
                </label>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+33746380448"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
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
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </div>

            <p className="mt-4 text-xs text-gray-500 text-center">
              Mot de passe par défaut : <code className="bg-gray-100 px-1 rounded">wooleen2025</code>
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Vous êtes prestataire ?{" "}
            <Link href="/provider/login" className="text-green-600 hover:underline">
              Accédez à votre espace
            </Link>
          </p>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
              ← Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
