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

          <h2 className="text-lg font-semibold text-gray-900">4. Publishing and Visibility</h2>
          <p>
            Notes in AI Notes are private by default. You may optionally publish notes by setting their visibility to <strong>public</strong> or <strong>unlisted</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Public</strong> notes are displayed in the public feed, included in public sitemaps, and accessible to search engines and web crawlers.
            </li>
            <li>
              <strong>Unlisted</strong> notes are accessible to anyone who possesses the direct link (URL). While unlisted notes are omitted from public feeds and served with no-index directives for search engines, <em>an unlisted link is not secret or confidential</em>. Anyone with access to the link may view its content.
            </li>
          </ul>
          <p>
            You represent and warrant that any content you publish (whether public or unlisted) does not violate third-party rights, contain illegal materials, or disclose sensitive confidential credentials. Raw conversation transcripts are never published or made publicly accessible.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">5. Content Moderation and Abuse Contact</h2>
          <p>
            AI Notes reserves the right to remove or restrict access to any public or unlisted note that violates these Terms or applicable laws. To report abuse, copyright infringement, or illicit content, please contact us at{" "}
            <a href="mailto:abuse@ai-notes.io" className="text-blue-600 underline hover:text-blue-800">
              abuse@ai-notes.io
            </a>.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">6. Prohibited Uses</h2>
          <p>
            You agree not to misuse the service, attempt unauthorized access, bypass automated rate limits or PII scanning gates, or ingest content that violates applicable laws or intellectual property rights.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, AI Notes shall not be liable for any indirect, incidental, or consequential damages arising out of your use of the service or the publication of user-generated notes.
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
