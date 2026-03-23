'use client'

import Link from "next/link";
import { openWhatsApp, getDefaultWhatsAppNumber, getWhatsAppUrl } from "@/lib/whatsapp";

export default function HomePage() {
  const phone = getDefaultWhatsAppNumber();

  const handleWhatsAppClick = () => {
    openWhatsApp(phone, "Bonjour Wooleen");
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Wooleen
          </Link>
          
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-black"
            >
              Connexion
            </Link>

            <Link
              href="/provider/login"
              className="text-sm text-gray-600 hover:text-black"
            >
              Espace prestataire
            </Link>

            <button
              onClick={() => openWhatsApp(phone)}
              className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700"
            >
              WhatsApp
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="flex flex-col justify-center items-center text-center px-6 py-24">
        <h1 className="text-4xl font-bold text-gray-900">
          Trouvez un prestataire rapidement
        </h1>

        <p className="mt-4 text-gray-600 max-w-xl">
          Décrivez votre besoin sur WhatsApp et recevez des réponses rapidement.
        </p>

        <button
          onClick={handleWhatsAppClick}
          className="mt-8 bg-green-600 text-white px-6 py-4 rounded-xl text-lg font-semibold hover:bg-green-700"
        >
          💬 Décrire mon besoin sur WhatsApp
        </button>

        <p className="mt-6 text-sm text-gray-500">
          Vous êtes prestataire ?{" "}
          <Link href="/provider/login" className="underline hover:text-gray-700">
            Rejoindre Wooleen
          </Link>
        </p>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📱</span>
            </div>
            <h3 className="font-semibold text-gray-900">Simple</h3>
            <p className="text-sm text-gray-600 mt-2">Envoyez votre demande sur WhatsApp en quelques secondes</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚡</span>
            </div>
            <h3 className="font-semibold text-gray-900">Rapide</h3>
            <p className="text-sm text-gray-600 mt-2">Recevez des réponses de prestataires qualifiés</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✅</span>
            </div>
            <h3 className="font-semibold text-gray-900">Fiable</h3>
            <p className="text-sm text-gray-600 mt-2">Prestataires vérifiés dans tout le Sénégal</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>© 2025 Wooleen - Marketplace de services au Sénégal</p>
        </div>
      </footer>
    </main>
  );
}
