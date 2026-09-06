import { useState } from "react";
import { Link } from "react-router";
import type { NoteListItem } from "~/services/notes-api.server";

interface AssistantRailProps {
  notes: NoteListItem[];
  onAsk?: (prompt: string) => void;
  noteMode?: boolean; // When viewing a single note
  activeNote?: {
    title: string;
    takeaways?: string[];
    category?: string;
  };
}

export function AssistantRail({
  notes,
  onAsk,
  noteMode = false,
  activeNote,
}: AssistantRailProps) {
  const [askQuery, setAskQuery] = useState("");
  const [digestDismissed, setDigestDismissed] = useState(false);
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>({});

  const toggleTask = (id: string) => {
    setCheckedTasks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (askQuery.trim() && onAsk) {
      onAsk(askQuery.trim());
    }
  };

  const handleSuggestion = (prompt: string) => {
    setAskQuery(prompt);
    if (onAsk) {
      onAsk(prompt);
    }
  };

  // Compile tasks from active note or recent notes
  const tasks = noteMode && activeNote?.takeaways
    ? activeNote.takeaways.map((t, idx) => ({ id: `task-${idx}`, text: `Action: ${t}`, from: activeNote.title }))
    : notes.slice(0, 3).flatMap((n, nIdx) =>
        (n.summary ? [n.summary.split(". ")[0]] : []).map((t, tIdx) => ({
          id: `task-${nIdx}-${tIdx}`,
          text: t.replace(/^[-*•]\s*/, ""),
          from: n.title,
        }))
      );

  return (
    <aside className="w-80 shrink-0 border-l border-[#222228] bg-[#121216] select-none h-screen sticky top-0 z-20 hidden lg:flex flex-col justify-between p-4 overflow-y-auto">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#222228]">
          <div className="flex items-center space-x-2 text-zinc-100 font-medium text-sm">
            <span className="text-indigo-400">✦</span>
            <span className="font-semibold text-zinc-200">
              {noteMode ? "This note" : "Assistant"}
            </span>
          </div>
          <Link
            to="/app/settings"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Settings
          </Link>
        </div>

        {/* Digest Card (Stream mode only) */}
        {!noteMode && !digestDismissed && notes.length > 0 && (
          <div className="rounded-xl border border-[#2a2a38] bg-[#181822] p-3.5 space-y-2.5">
            <div className="text-[11px] font-semibold text-indigo-400 tracking-wider uppercase">
              Weekly Digest
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {notes.length} notes captured across your library. The latest conversations focus on{" "}
              <span className="text-white font-medium">
                {notes[0]?.category || "Engineering"}
              </span>{" "}
              and key architectural decisions.
            </p>
            <div className="flex items-center space-x-3 pt-1">
              <Link
                to={`/app/notes/${notes[0]?.id}`}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Open latest →
              </Link>
              <button
                type="button"
                onClick={() => setDigestDismissed(true)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Waiting on you / Action items */}
        {tasks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-zinc-500 tracking-wider uppercase px-1">
              {noteMode ? "Extracted Action Items" : "Waiting on you"}
            </div>
            <div className="space-y-1.5">
              {tasks.slice(0, 4).map((task) => {
                const checked = checkedTasks[task.id] || false;
                return (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className="flex items-start space-x-2.5 p-2 rounded-lg hover:bg-[#181822] transition-colors cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="mt-0.5 rounded border-zinc-700 bg-[#1e1e28] text-indigo-500 focus:ring-0 h-3.5 w-3.5 shrink-0 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-xs leading-snug transition-colors ${
                          checked
                            ? "text-zinc-600 line-through"
                            : "text-zinc-300 group-hover:text-zinc-100"
                        }`}
                      >
                        {task.text}
                      </p>
                      <span className="text-[10px] text-zinc-500 truncate block mt-0.5">
                        from {task.from}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Try asking prompt suggestions */}
        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-semibold text-zinc-500 tracking-wider uppercase px-1">
            Try Asking
          </div>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => handleSuggestion("What did we decide about pricing?")}
              className="w-full text-left p-2 rounded-lg bg-[#16161e] hover:bg-[#1e1e2a] border border-[#232330] text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              What did we decide about pricing?
            </button>
            <button
              type="button"
              onClick={() => handleSuggestion("Summarise every interview this month")}
              className="w-full text-left p-2 rounded-lg bg-[#16161e] hover:bg-[#1e1e2a] border border-[#232330] text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              Summarise every interview this month
            </button>
          </div>
        </div>
      </div>

      {/* Ask Input at Bottom */}
      <div className="pt-3 border-t border-[#222228]">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={askQuery}
            onChange={(e) => setAskQuery(e.target.value)}
            placeholder={noteMode ? "Ask about this note..." : "Ask across notes..."}
            className="w-full rounded-lg bg-[#181822] border border-[#2a2a38] pl-3 pr-8 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!askQuery.trim()}
            title="Ask"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center text-xs disabled:opacity-30 disabled:hover:bg-indigo-600 transition-colors cursor-pointer"
          >
            ↑
          </button>
        </form>
      </div>
    </aside>
  );
}
