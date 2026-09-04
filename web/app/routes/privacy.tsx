import { Link } from "react-router";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col justify-between">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="text-xl font-bold tracking-tight text-gray-900">
            AI Notes
          </Link>
          <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 space-y-8 flex-1">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Privacy Policy</h1>
        <p className="text-sm text-gray-500">Last updated: September 2026</p>

        <section className="space-y-4 text-sm text-gray-700 leading-relaxed">
          <h2 className="text-lg font-semibold text-gray-900">1. Information We Collect</h2>
          <p>
            We collect your email address and authentication profile when you register or sign in. When you ingest conversations, we store notes, AI summaries, and optional original transcripts strictly under your private account.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">2. How We Use Your Information</h2>
          <p>
            Your information is used exclusively to provide the AI Notes service, generate summaries, and enable semantic search over your private library. We do not sell your personal data or conversation history.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">3. Data Storage and Security</h2>
          <p>
            Your data is stored in Google Cloud Firestore and encrypted Cloud Storage within the European Union (europe-west1). All service-to-service communication is internal and authenticated.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">4. Your Rights &amp; Data Deletion</h2>
          <p>
            You can export all your saved notes and transcripts at any time via Settings. You can also permanently delete your account and all associated data with immediate effect from the Settings page.
          </p>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white py-6 text-center text-xs text-gray-500">
        <div className="flex justify-center space-x-6">
          <Link to="/terms" className="hover:text-gray-900">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-gray-900">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
