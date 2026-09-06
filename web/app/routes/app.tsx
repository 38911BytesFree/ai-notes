import { useState, useEffect, useMemo } from "react";
import {
  Link,
  useLoaderData,
  useNavigate,
  useSearchParams,
  useFetcher,
} from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";
import * as notesApi from "~/services/notes-api.server";
import type { NoteListItem } from "~/services/notes-api.server";
import { NoteCard } from "~/components/NoteCard";
import { SidebarRail } from "~/components/SidebarRail";
import { AssistantRail } from "~/components/AssistantRail";
import { detectProvider } from "~/services/share-url";
import { getErrorMessage } from "~/services/error-messages";

export async function loader({ request }: LoaderFunctionArgs) {
  const { user } = await requireAuth(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const category = url.searchParams.get("category")?.trim() || undefined;
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;

  let notes: NoteListItem[] = [];
  let nextCursor: string | undefined;

  if (q) {
    const searchRes = await notesApi.searchNotes(request, { q, category, limit: 30 });
    if (searchRes.ok) {
      notes = searchRes.data.notes;
    }
  } else {
    const listRes = await notesApi.listNotes(request, { category, cursor, limit: 30 });
    if (listRes.ok) {
      notes = listRes.data.notes;
      nextCursor = listRes.data.next_cursor;
    }
  }

  return {
    user,
    notes,
    nextCursor,
    query: q,
    selectedCategory: category,
  };
}

export default function App() {
  const { user, notes, nextCursor: initialNextCursor, query, selectedCategory } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [inputVal, setInputVal] = useState("");
  const [keepTranscript, setKeepTranscript] = useState(user.default_keep_transcript);
  const [searchInput, setSearchInput] = useState(query);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");

  const [allNotes, setAllNotes] = useState<NoteListItem[]>(notes);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(initialNextCursor);

  useEffect(() => {
    setAllNotes(notes);
    setCurrentCursor(initialNextCursor);
  }, [notes, initialNextCursor]);

  const ingestFetcher = useFetcher<{ ok?: boolean; id?: string; code?: string }>();
  const paginationFetcher = useFetcher<{ notes: NoteListItem[]; nextCursor?: string }>();

  useEffect(() => {
    if (ingestFetcher.data?.id) {
      setShowCaptureModal(false);
      setInputVal("");
      navigate(`/app/notes/${ingestFetcher.data.id}`);
    }
  }, [ingestFetcher.data, navigate]);

  useEffect(() => {
    if (paginationFetcher.data?.notes) {
      setAllNotes((prev) => [...prev, ...(paginationFetcher.data?.notes || [])]);
      setCurrentCursor(paginationFetcher.data.nextCursor);
    }
  }, [paginationFetcher.data]);

  // Global hotkeys: 'N' for new note, '/' or ⌘K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";
      if (isInput) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setShowCaptureModal(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("stream-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSignOut = async () => {
    try {
      const { auth } = await import("~/services/firebase.client");
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    } catch (err) {
      console.warn("Client signOut failed", err);
    }

    await fetch("/api/auth/logout", {
      method: "POST",
    });

    navigate("/");
  };

  const isUrl = /^https?:\/\//i.test(inputVal.trim());
  const detected = isUrl ? detectProvider(inputVal) : null;
  const isIngesting = ingestFetcher.state !== "idle";

  const handleCategorySelect = (cat?: string) => {
    const params = new URLSearchParams(searchParams);
    if (cat) {
      params.set("category", cat);
    } else {
      params.delete("category");
    }
    params.delete("cursor");
    setSearchParams(params);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      params.set("q", searchInput.trim());
    } else {
      params.delete("q");
    }
    params.delete("cursor");
    setSearchParams(params);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    const params = new URLSearchParams(searchParams);
    params.delete("q");
    params.delete("cursor");
    setSearchParams(params);
  };

  const handleLoadMore = () => {
    if (!currentCursor) return;
    const params = new URLSearchParams();
    if (selectedCategory) params.set("category", selectedCategory);
    params.set("cursor", currentCursor);
    params.set("limit", "30");
    paginationFetcher.load(`/app?${params.toString()}`);
  };

  // Sort notes locally based on sort selection
  const sortedNotes = useMemo(() => {
    const list = [...allNotes];
    if (sortBy === "oldest") {
      return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    if (sortBy === "title") {
      return list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [allNotes, sortBy]);

  // Group notes chronologically into TODAY, YESTERDAY, EARLIER
  const groupedNotes = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { [key: string]: NoteListItem[] } = {
      TODAY: [],
      YESTERDAY: [],
      PREVIOUS: [],
    };

    sortedNotes.forEach((note) => {
      const noteDate = new Date(note.created_at);
      noteDate.setHours(0, 0, 0, 0);

      if (noteDate.getTime() === today.getTime()) {
        groups.TODAY.push(note);
      } else if (noteDate.getTime() === yesterday.getTime()) {
        groups.YESTERDAY.push(note);
      } else {
        groups.PREVIOUS.push(note);
      }
    });

    return groups;
  }, [sortedNotes]);

  return (
    <div className="flex min-h-screen bg-[#0e0e11] text-[#f4f4f5]">
      {/* 1. Left Quiet Navigation Rail */}
      <SidebarRail
        user={user}
        totalNotes={allNotes.length}
        selectedCategory={selectedCategory}
        onSelectCategory={handleCategorySelect}
        onNewNote={() => setShowCaptureModal(true)}
        onSignOut={handleSignOut}
      />

      {/* 2. Center Single Reading Column */}
      <main className="flex-1 min-w-0 max-w-4xl mx-auto px-4 py-6 md:px-8 space-y-6">
        {/* Top Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Search or ask input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-lg">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </span>
              <input
                id="stream-search-input"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search or ask your notes..."
                className="w-full rounded-lg bg-[#14141a] border border-[#222228] pl-9 pr-14 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 space-x-1">
                {query && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="text-xs text-zinc-400 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 bg-[#1e1e26] border border-[#2b2b36] rounded">
                  K
                </kbd>
              </div>
            </div>
          </form>

          {/* Sort pills */}
          <div className="flex items-center space-x-1 bg-[#14141a] p-1 rounded-lg border border-[#222228] self-start sm:self-auto text-xs">
            <button
              type="button"
              onClick={() => setSortBy("recent")}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                sortBy === "recent" ? "bg-[#22222e] text-zinc-100 font-medium" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Recent
            </button>
            <button
              type="button"
              onClick={() => setSortBy("oldest")}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                sortBy === "oldest" ? "bg-[#22222e] text-zinc-100 font-medium" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Oldest
            </button>
            <button
              type="button"
              onClick={() => setSortBy("title")}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                sortBy === "title" ? "bg-[#22222e] text-zinc-100 font-medium" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Title
            </button>
          </div>
        </div>

        {/* Stream Header */}
        <div className="space-y-3 pt-2">
          <div className="flex items-baseline space-x-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {query
                ? `Search: "${query}"`
                : selectedCategory
                ? `${selectedCategory} notes`
                : "All notes"}
            </h1>
            <span className="text-xs text-zinc-500 font-mono">
              {allNotes.length} {allNotes.length === 1 ? "note" : "notes"}
            </span>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleCategorySelect(undefined)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors cursor-pointer ${
                !selectedCategory
                  ? "bg-indigo-600 text-white font-medium"
                  : "bg-[#181820] text-zinc-400 hover:text-zinc-200 hover:bg-[#20202a] border border-[#252530]"
              }`}
            >
              All
            </button>
            {["Engineering", "Product", "Research", "Design", "Writing", "Personal"].map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategorySelect(active ? undefined : cat)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors cursor-pointer ${
                    active
                      ? "bg-indigo-600 text-white font-medium"
                      : "bg-[#181820] text-zinc-400 hover:text-zinc-200 hover:bg-[#20202a] border border-[#252530]"
                  }`}
                >
                  #{cat.toLowerCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes Timeline Stream */}
        <section className="space-y-6 pt-1">
          {allNotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#262632] bg-[#121217] p-12 text-center text-zinc-400 space-y-3">
              <span className="w-10 h-10 rounded-full bg-indigo-950/50 text-indigo-400 flex items-center justify-center mx-auto text-base">
                ✦
              </span>
              <p className="text-sm">
                {query
                  ? "No notes found matching your search."
                  : selectedCategory
                  ? `No notes in the "${selectedCategory}" category yet.`
                  : "Your library is empty. Add your first conversation to get started!"}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowCaptureModal(true)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors cursor-pointer"
                >
                  + Add conversation
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* TODAY group */}
              {groupedNotes.TODAY.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-2">
                    Today
                  </div>
                  <div className="space-y-1.5">
                    {groupedNotes.TODAY.map((note) => (
                      <NoteCard key={note.id} note={note} />
                    ))}
                  </div>
                </div>
              )}

              {/* YESTERDAY group */}
              {groupedNotes.YESTERDAY.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-2">
                    Yesterday
                  </div>
                  <div className="space-y-1.5">
                    {groupedNotes.YESTERDAY.map((note) => (
                      <NoteCard key={note.id} note={note} />
                    ))}
                  </div>
                </div>
              )}

              {/* PREVIOUS group */}
              {groupedNotes.PREVIOUS.length > 0 && (
                <div className="space-y-2">
                  {(groupedNotes.TODAY.length > 0 || groupedNotes.YESTERDAY.length > 0) && (
                    <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-2">
                      Earlier
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {groupedNotes.PREVIOUS.map((note) => (
                      <NoteCard key={note.id} note={note} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentCursor && !query && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={paginationFetcher.state !== "idle"}
                className="rounded-lg border border-[#2b2b36] bg-[#16161e] px-5 py-2 text-xs font-medium text-zinc-300 hover:text-white hover:bg-[#20202c] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {paginationFetcher.state !== "idle" ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </section>
      </main>

      {/* 3. Right Unified AI Surface */}
      <AssistantRail
        notes={allNotes}
        onAsk={(prompt) => {
          setSearchInput(prompt);
          const params = new URLSearchParams(searchParams);
          params.set("q", prompt);
          setSearchParams(params);
        }}
      />

      {/* Capture / Ingest Modal */}
      {showCaptureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-[#2b2b38] bg-[#14141a] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                <span className="text-indigo-400">✦</span>
                <span>Add conversation</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowCaptureModal(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Paste a public share link from ChatGPT, Claude, Gemini, or Grok, or paste raw transcript text.
            </p>

            <ingestFetcher.Form method="post" action="/api/ingest" className="space-y-4">
              <div className="relative">
                <textarea
                  name="input"
                  rows={4}
                  required
                  disabled={isIngesting}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="https://chatgpt.com/share/... or paste conversation text here"
                  className="w-full rounded-xl border border-[#292936] bg-[#1a1a24] p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-hidden font-sans resize-none"
                />
                {detected && (
                  <div className="absolute right-3 bottom-3">
                    <span className="inline-flex items-center rounded-md bg-indigo-950/60 px-2 py-1 text-xs font-medium text-indigo-300 border border-indigo-800/40">
                      {detected === "chatgpt"
                        ? "ChatGPT detected"
                        : detected === "claude"
                        ? "Claude detected"
                        : detected === "gemini"
                        ? "Gemini detected"
                        : "Grok detected"}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <input type="hidden" name="keep_transcript" value={keepTranscript ? "true" : "false"} />
                <label className="flex items-center space-x-2 text-xs text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={isIngesting}
                    checked={keepTranscript}
                    onChange={(e) => setKeepTranscript(e.target.checked)}
                    className="rounded border-[#2f2f3e] bg-[#1c1c26] text-indigo-600 focus:ring-0 h-4 w-4"
                  />
                  <span>Keep original transcript</span>
                </label>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowCaptureModal(false)}
                    className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isIngesting || !inputVal.trim()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {isIngesting ? "Summarising..." : "Summarise & Save"}
                  </button>
                </div>
              </div>

              {isIngesting && (
                <div className="rounded-lg bg-indigo-950/40 border border-indigo-800/50 p-3 text-xs text-indigo-300 flex items-center space-x-2.5">
                  <svg className="animate-spin h-4 w-4 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Fetching and summarising note (~30 seconds)...</span>
                </div>
              )}

              {ingestFetcher.data?.code && (
                <div className="rounded-lg bg-red-950/40 border border-red-800/50 p-3 text-xs text-red-300">
                  {getErrorMessage(ingestFetcher.data.code)}
                </div>
              )}
            </ingestFetcher.Form>
          </div>
        </div>
      )}

      {/* Mobile Bottom Thumb Bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-[#121216]/95 backdrop-blur-md border-t border-[#222228] p-3 flex items-center justify-between z-30">
        <button
          type="button"
          onClick={() => setShowCaptureModal(true)}
          className="flex-1 flex items-center justify-between bg-[#1a1a24] border border-[#2b2b3a] rounded-xl px-3 py-2 text-xs text-zinc-400"
        >
          <span>Write or paste link...</span>
          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
            +
          </span>
        </button>
      </div>
    </div>
  );
}
