import { useState, useEffect } from "react";
import {
  Form,
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
import { CategoryChips } from "~/components/CategoryChips";
import { NoteCard } from "~/components/NoteCard";
import { detectProvider } from "~/services/share-url";
import { getErrorMessage } from "~/services/error-messages";

export async function loader({ request }: LoaderFunctionArgs) {
  const { user } = await requireAuth(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const category = url.searchParams.get("category")?.trim() || undefined;
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;

  const profileRes = await notesApi.getMe(request);
  const userProfile = profileRes.ok ? profileRes.data : undefined;

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
    user: userProfile ?? {
      uid: user?.uid || "",
      email: user?.email || "",
      display_name: user?.display_name || "",
      default_keep_transcript: true,
      ingest_count: 0,
      ingest_limit: 30,
    },
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
      navigate(`/app/notes/${ingestFetcher.data.id}`);
    }
  }, [ingestFetcher.data, navigate]);

  useEffect(() => {
    if (paginationFetcher.data?.notes) {
      setAllNotes((prev) => [...prev, ...(paginationFetcher.data?.notes || [])]);
      setCurrentCursor(paginationFetcher.data.nextCursor);
    }
  }, [paginationFetcher.data]);

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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* App Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center space-x-3">
            <Link to="/app" className="text-xl font-bold tracking-tight text-gray-900 hover:text-gray-700">
              AI Notes
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <span className="hidden sm:inline text-xs text-gray-500">{user.email}</span>
            <Link
              to="/app/settings"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8">
        {/* Add a conversation Card */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Add a conversation</h2>
          <p className="text-sm text-gray-500 mb-4">
            Paste a public share link from ChatGPT or Claude, or paste conversation text directly.
          </p>

          <ingestFetcher.Form method="post" action="/api/ingest" className="space-y-4">
            <div className="relative">
              <textarea
                name="input"
                rows={3}
                required
                disabled={isIngesting}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="https://chatgpt.com/share/... or paste conversation text here"
                className="w-full rounded-lg border border-gray-300 p-3 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900 font-sans"
              />
              {detected && (
                <div className="absolute right-3 bottom-3">
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200">
                    {detected === "chatgpt" ? "ChatGPT link detected" : "Claude link detected"}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="keep_transcript"
                  disabled={isIngesting}
                  checked={keepTranscript}
                  onChange={(e) => setKeepTranscript(e.target.checked)}
                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900 h-4 w-4"
                />
                <span>Keep original transcript</span>
              </label>

              <button
                type="submit"
                disabled={isIngesting || !inputVal.trim()}
                className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isIngesting ? "Processing..." : "Summarise & Save"}
              </button>
            </div>

            {isIngesting && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 flex items-center space-x-3">
                <svg
                  className="animate-spin h-5 w-5 text-blue-600 shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Fetching and summarising, this takes about thirty seconds</span>
              </div>
            )}

            {ingestFetcher.data?.code && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
                {getErrorMessage(ingestFetcher.data.code)}
              </div>
            )}
          </ingestFetcher.Form>
        </section>

        {/* Search & Filter Bar */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearchSubmit} className="relative flex-1">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search notes semantically..."
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900 pr-20"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 space-x-1">
                {query && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="rounded px-2 py-1 text-xs text-gray-400 hover:text-gray-700"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="submit"
                  className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  Search
                </button>
              </div>
            </form>
          </div>

          <CategoryChips
            selectedCategory={selectedCategory}
            onSelectCategory={handleCategorySelect}
          />
        </section>

        {/* Notes List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {query ? `Search results for "${query}"` : selectedCategory ? `${selectedCategory} Notes` : "All Notes"}
            </h2>
            <span className="text-xs text-gray-500">
              {allNotes.length} {allNotes.length === 1 ? "note" : "notes"}
            </span>
          </div>

          {allNotes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
              {query
                ? "No notes found matching your search. Try different keywords."
                : selectedCategory
                ? `No notes in the "${selectedCategory}" category yet.`
                : "Your library is empty. Add your first conversation above to get started!"}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-1">
              {allNotes.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          )}

          {currentCursor && !query && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={paginationFetcher.state !== "idle"}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-50"
              >
                {paginationFetcher.state !== "idle" ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
