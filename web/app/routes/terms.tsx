import { Link } from "react-router";

export default function Terms() {
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
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Terms of Service</h1>
        <p className="text-sm text-gray-500">Last updated: September 2026</p>

        <section className="space-y-4 text-sm text-gray-700 leading-relaxed">
          <h2 className="text-lg font-semibold text-gray-900">1. Acceptance of Terms</h2>
          <p>
            By accessing or using AI Notes, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">2. Service Description</h2>
          <p>
            AI Notes is a personal library tool that allows you to store, summarise, and search conversations from AI platforms. The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">3. User Accounts and Content</h2>
          <p>
            You are responsible for safeguarding your account credentials. You retain all rights to the conversations and notes stored in your library.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">4. Prohibited Uses</h2>
          <p>
            You agree not to misuse the service, attempt unauthorized access, or ingest content that violates applicable laws or intellectual property rights.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">5. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, AI Notes shall not be liable for any indirect, incidental, or consequential damages arising out of your use of the service.
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
