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
    <div className="min-h-screen bg-[#0e0e11] text-[#f4f4f5] pb-16">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      {/* Reader Top Header */}
      <header className="border-b border-[#222228] bg-[#121216] sticky top-0 z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center space-x-2 font-bold text-white text-base tracking-tight hover:opacity-90"
          >
            <span className="text-indigo-400">✦</span>
            <span>AI Notes</span>
          </Link>
          <div className="flex items-center space-x-4 text-xs font-medium">
            <Link to="/feed" className="text-zinc-400 hover:text-white transition-colors">
              Explore feed
            </Link>
            <Link
              to="/login"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-500 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12 space-y-6">
        <article className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <span className="inline-flex items-center rounded-md bg-[#1d1d28] px-2.5 py-0.5 text-xs font-medium text-indigo-400 font-mono border border-[#2b2b3c]">
                {note.category}
              </span>
              {(note.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md bg-[#181822] px-2 py-0.5 text-xs font-mono text-zinc-400 border border-[#262634]"
                >
                  #{tag}
                </span>
              ))}
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
              {note.title}
            </h1>

            {/* Provenance line */}
            <p className="mt-2 text-xs text-zinc-400">
              From a{" "}
              {note.source.share_url ? (
                <a
                  href={note.source.share_url}
                  target="_blank"
                  rel="noopener nofollow ugc"
                  className="text-indigo-400 hover:underline font-medium"
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

          {/* Marked AI Summary Accent Box */}
          <div className="rounded-2xl border border-indigo-900/50 bg-[#161524] p-5 my-6 space-y-2">
            <div className="text-[11px] font-bold text-indigo-400 tracking-wider uppercase flex items-center space-x-1.5">
              <span>✦</span>
              <span>SUMMARY</span>
            </div>
            <div className="text-sm text-zinc-200 whitespace-pre-line leading-relaxed font-sans">
              {note.summary}
            </div>
          </div>

          {/* Key Takeaways */}
          {note.takeaways && note.takeaways.length > 0 && (
            <div className="space-y-3 pt-2">
              <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
                Key Takeaways
              </h2>
              <ul className="space-y-2 text-sm text-zinc-300">
                {note.takeaways.map((takeaway, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <span className="text-indigo-400 font-bold shrink-0">•</span>
                    <span className="leading-relaxed">{takeaway}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Code Blocks */}
          {note.code_blocks && note.code_blocks.length > 0 && (
            <div className="space-y-3 pt-2">
              <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
                Code Snippets
              </h2>
              {note.code_blocks.map((block, idx) => (
                <CodeBlock key={idx} code={block.code} lang={block.lang} />
              ))}
            </div>
          )}

          {/* Reader Footer */}
          <div className="border-t border-[#222228] pt-6 mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
            <div>
              {note.source.share_url && (
                <a
                  href={note.source.share_url}
                  target="_blank"
                  rel="noopener nofollow ugc"
                  className="text-indigo-400 hover:underline font-medium"
                >
                  View original conversation ↗
                </a>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/" className="hover:text-white font-medium transition-colors">
                Made with AI Notes
              </Link>
              <span>•</span>
              <a
                href="mailto:abuse@ai-notes.app"
                className="hover:text-white transition-colors"
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
