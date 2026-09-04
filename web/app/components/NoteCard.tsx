import { Link } from "react-router";
import type { NoteListItem } from "~/services/notes-api.server";

interface NoteCardProps {
  note: NoteListItem;
}

export function NoteCard({ note }: NoteCardProps) {
  const firstLineSummary = note.summary ? note.summary.split("\n")[0] : "";
  const dateStr = note.created_at
    ? new Date(note.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  const providerLabel =
    note.source.provider === "chatgpt"
      ? "ChatGPT"
      : note.source.provider === "claude"
      ? "Claude"
      : "Manual";

  return (
    <Link
      to={`/app/notes/${note.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-5 shadow-xs hover:border-gray-300 hover:shadow-sm transition-all text-left"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <h3 className="text-base font-semibold text-gray-900 line-clamp-1">{note.title}</h3>
        <span className="text-xs text-gray-500 shrink-0">{dateStr}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="inline-flex items-center rounded-sm bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
          {note.category}
        </span>
        <span className="inline-flex items-center rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">
          {providerLabel}
        </span>
        {note.distance !== undefined && (
          <span className="inline-flex items-center rounded-sm bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 border border-purple-100">
            Distance: {note.distance.toFixed(3)}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">{firstLineSummary}</p>
    </Link>
  );
}
