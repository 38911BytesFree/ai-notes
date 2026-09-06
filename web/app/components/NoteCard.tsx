import { Link } from "react-router";
import type { NoteListItem } from "~/services/notes-api.server";

interface NoteCardProps {
  note: NoteListItem;
  to?: string;
}

export function NoteCard({ note, to }: NoteCardProps) {
  const firstLineSummary = note.summary ? note.summary.split("\n")[0] : "";
  const createdDate = note.created_at ? new Date(note.created_at) : null;
  const timeStr = createdDate
    ? createdDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";
  const dateStr = createdDate
    ? createdDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "";

  const providerLabel =
    note.source.provider === "chatgpt"
      ? "ChatGPT"
      : note.source.provider === "claude"
      ? "Claude"
      : note.source.provider === "gemini"
      ? "Gemini"
      : note.source.provider === "grok"
      ? "Grok"
      : "Manual";

  return (
    <Link
      to={to ?? `/app/notes/${note.id}`}
      className="group block py-3.5 px-4 rounded-xl border border-[#1e1e26] bg-[#14141a] hover:bg-[#191922] hover:border-[#2e2e3c] transition-all text-left"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-semibold text-zinc-100 group-hover:text-white leading-snug flex items-center space-x-1.5 line-clamp-1">
          <span>{note.title}</span>
          <span className="text-indigo-400 text-xs shrink-0" title="AI summarized">✦</span>
        </h3>
        <span className="text-xs text-zinc-500 font-mono shrink-0">
          {timeStr || dateStr}
        </span>
      </div>

      <p className="text-[13px] text-zinc-400 group-hover:text-zinc-300 line-clamp-2 leading-relaxed mt-1">
        {firstLineSummary}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <span className="inline-flex items-center rounded-md bg-[#1d1d28] px-2 py-0.5 text-xs font-medium text-indigo-400 font-mono border border-[#2b2b3c]">
          #{note.category.toLowerCase()}
        </span>
        <span className="inline-flex items-center rounded-md bg-[#191920] px-2 py-0.5 text-xs text-zinc-400 border border-[#262632]">
          {providerLabel}
        </span>
        {note.visibility === "public" && (
          <span className="inline-flex items-center rounded-md bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-800/50">
            Public
          </span>
        )}
        {note.visibility === "unlisted" && (
          <span className="inline-flex items-center rounded-md bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-800/50">
            Unlisted
          </span>
        )}
        {note.distance !== undefined && (
          <span className="inline-flex items-center rounded-md bg-purple-950/40 px-2 py-0.5 text-xs font-medium text-purple-300 border border-purple-800/40">
            Distance: {note.distance.toFixed(3)}
          </span>
        )}
      </div>
    </Link>
  );
}
