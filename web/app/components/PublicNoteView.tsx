import { Link } from "react-router";
import type { PublicNote } from "~/services/public-api.server";
import { CodeBlock } from "~/components/CodeBlock";

export interface PublicNoteViewProps {
  note: PublicNote;
  jsonLd: string;
}

export function PublicNoteView({ note, jsonLd }: PublicNoteViewProps) {
  const dateStr = note.source.conversation_date
    ? new Date(note.source.conversation_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : new Date(note.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

  const providerLabel =
    note.source.provider === "chatgpt"
      ? "ChatGPT"
      : note.source.provider === "claude"
      ? "Claude"
      : note.source.provider === "gemini"
      ? "Gemini"
      : note.source.provider === "grok"
      ? "Grok"
      : note.source.provider;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-16">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      {/* Reader Top Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center space-x-2 font-bold text-gray-900 text-base tracking-tight hover:opacity-90"
          >
            <span>AI Notes</span>
          </Link>
          <div className="flex items-center space-x-4 text-xs font-medium">
            <Link to="/feed" className="text-gray-600 hover:text-gray-900 transition-colors">
              Explore feed
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-800 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        <article className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center rounded-sm bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-800">
                {note.category}
              </span>
              {(note.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-sm bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 border border-gray-200"
                >
                  #{tag}
                </span>
              ))}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{note.title}</h1>

            {/* Provenance line */}
            <p className="mt-2 text-xs text-gray-500">
              From a{" "}
              {note.source.share_url ? (
                <a
                  href={note.source.share_url}
                  target="_blank"
                  rel="noopener nofollow ugc"
                  className="text-blue-600 hover:underline font-medium"
                >
                  {providerLabel} conversation
                </a>
              ) : (
                <span>{providerLabel} conversation</span>
              )}
              , {dateStr}
              {note.source.model ? `, ${note.source.model}` : ""}
            </p>
          </div>

          {/* Summary */}
          <div className="border-t border-gray-100 pt-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">Summary</h2>
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line leading-relaxed">
              {note.summary}
            </div>
          </div>

          {/* Key Takeaways */}
          {note.takeaways && note.takeaways.length > 0 && (
            <div className="border-t border-gray-100 pt-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                Key Takeaways
              </h2>
              <ul className="space-y-2 text-sm text-gray-700">
                {note.takeaways.map((takeaway, idx) => (
                  <li key={idx} className="flex items-start">
                    <span className="mr-2 text-gray-400 font-bold">•</span>
                    <span>{takeaway}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Code Blocks */}
          {note.code_blocks && note.code_blocks.length > 0 && (
            <div className="border-t border-gray-100 pt-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                Code Snippets
              </h2>
              {note.code_blocks.map((block, idx) => (
                <CodeBlock key={idx} code={block.code} lang={block.lang} />
              ))}
            </div>
          )}

          {/* Reader Footer */}
          <div className="border-t border-gray-100 pt-6 mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
            <div>
              {note.source.share_url && (
                <a
                  href={note.source.share_url}
                  target="_blank"
                  rel="noopener nofollow ugc"
                  className="text-blue-600 hover:underline font-medium"
                >
                  View original conversation ↗
                </a>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/" className="hover:text-gray-900 font-medium transition-colors">
                Made with AI Notes
              </Link>
              <span>•</span>
              <a
                href="mailto:abuse@ai-notes.app"
                className="hover:text-gray-900 transition-colors"
              >
                Report abuse
              </a>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
