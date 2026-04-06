'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  useEffect(() => {
    // Rediriger automatiquement vers la homepage
    router.push('/')
  }, [router])

  return null
}
