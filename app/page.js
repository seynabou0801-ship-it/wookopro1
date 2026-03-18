import Link from "next/link";

export default function HomePage() {
  const phone = "221770000000";

  return (
    <main className="min-h-screen bg-white flex flex-col justify-center items-center text-center px-6">
      
      <h1 className="text-4xl font-bold text-gray-900">
        Trouvez un prestataire rapidement
      </h1>

      <p className="mt-4 text-gray-600 max-w-xl">
        Décrivez votre besoin sur WhatsApp et recevez des réponses rapidement.
      </p>

      <a
        href={`https://wa.me/${phone}?text=Bonjour%20Wooleen`}
        target="_blank"
        className="mt-8 bg-green-600 text-white px-6 py-4 rounded-xl text-lg font-semibold"
      >
        💬 Décrire mon besoin sur WhatsApp
      </a>

      <Link
        href="/login"
        className="mt-4 text-sm text-gray-500 underline"
      >
        Se connecter
      </Link>

    </main>
  );
}
