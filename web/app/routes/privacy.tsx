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

          <h2 className="text-lg font-semibold text-gray-900">3. Note Visibility and Publishing</h2>
          <p>
            By default, all notes and conversation transcripts you save are strictly <strong>private</strong> and accessible only to you when authenticated.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Public Notes</strong>: If you explicitly publish a note as public, its title, summary, takeaways, category, tags, code blocks, and source attribution become viewable by anyone on the internet, are listed in the public feed, and are indexed by search engines.
            </li>
            <li>
              <strong>Unlisted Notes</strong>: If you set a note to unlisted, it is accessible to anyone who has its URL. We do not list unlisted notes on the public feed and we send search engine directives instructing crawlers not to index them. However, <em>unlisted links are not password-protected or encrypted secrets</em>; anyone in possession of the link can access the note.
            </li>
            <li>
              <strong>Transcripts Are Never Public</strong>: Even when a note is marked public or unlisted, raw conversation transcripts are <em>never</em> shared, displayed on public pages, or made accessible to third parties.
            </li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900">4. Automated PII Scanning</h2>
          <p>
            To help prevent unintended disclosure of sensitive information, notes are scanned deterministically for personal identifiers (such as email addresses, phone numbers, API keys, and cryptographic private keys) before publishing. If potential personal data or secrets are detected, you must explicitly review and acknowledge them before publishing is permitted.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">5. Data Storage and Security</h2>
          <p>
            Your data is stored in Google Cloud Firestore and encrypted Cloud Storage within the European Union (europe-west1). All service-to-service communication is internal and authenticated.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">6. Your Rights &amp; Data Deletion</h2>
          <p>
            You can export all your saved notes and transcripts at any time via Settings. You can also unpublish any note back to private at any time, or permanently delete your account and all associated data with immediate effect from the Settings page.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">7. Privacy and Abuse Inquiries</h2>
          <p>
            If you have questions regarding this Privacy Policy or wish to report content that inadvertently exposes personal information, please contact us at{" "}
            <a href="mailto:abuse@ai-notes.io" className="text-blue-600 underline hover:text-blue-800">
              abuse@ai-notes.io
            </a>.
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
