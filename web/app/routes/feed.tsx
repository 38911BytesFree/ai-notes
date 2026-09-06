import { data, Link, useLoaderData, useNavigate } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { listPublicNotes } from "~/services/public-api.server";
import { CATEGORIES, CategoryChips } from "~/components/CategoryChips";
import { NoteCard } from "~/components/NoteCard";
import { RateLimiter } from "~/services/ratelimit.server";

const feedLimiter = new RateLimiter({ capacity: 60, refillPerMinute: 60 });

export async function loader({ request }: LoaderFunctionArgs) {
  if (!feedLimiter.checkRequest(request)) {
    throw new Response("Too Many Requests", { status: 429 });
  }

  const url = new URL(request.url);
  const rawCategory = url.searchParams.get("category");
  const category = rawCategory && CATEGORIES.includes(rawCategory as any) ? rawCategory : undefined;
  const cursor = url.searchParams.get("cursor") || undefined;

  const res = await listPublicNotes({
    category,
    cursor,
    limit: 30,
  });

  const notes = res.ok ? res.data.notes : [];
  const next_cursor = res.ok ? res.data.next_cursor : undefined;

  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=120");

  return data(
    {
      notes,
      next_cursor,
      selectedCategory: category,
    },
    { headers }
  );
}

export function headers() {
  return {
    "Cache-Control": "public, max-age=120",
  };
}

export const meta: MetaFunction = () => {
  return [
    { title: "Public Feed — AI Notes" },
    { name: "description", content: "Discover useful AI conversations shared by the community." },
  ];
};

export default function FeedRoute() {
  const { notes, next_cursor, selectedCategory } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handleSelectCategory = (cat?: string) => {
    if (!cat) {
      navigate("/feed");
    } else {
      navigate(`/feed?category=${encodeURIComponent(cat)}`);
    }
  };

  const nextParams = new URLSearchParams();
  if (selectedCategory) nextParams.set("category", selectedCategory);
  if (next_cursor) nextParams.set("cursor", next_cursor);

  return (
    <div className="min-h-screen bg-[#0e0e11] text-[#f4f4f5] pb-16">
      {/* Header */}
      <header className="border-b border-[#222228] bg-[#121216] sticky top-0 z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center space-x-2 font-bold text-white text-base tracking-tight hover:opacity-90"
          >
            <span className="text-indigo-400">✦</span>
            <span>AI Notes</span>
          </Link>
          <div className="flex items-center space-x-3 text-xs font-medium">
            <Link
              to="/app"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              My Library
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

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Public Feed</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Explore curated takeaways and notes shared by the AI Notes community.
          </p>
        </div>

        {/* Category Filter */}
        <div className="border-y border-[#222228] py-2">
          <CategoryChips
            selectedCategory={selectedCategory}
            onSelectCategory={handleSelectCategory}
          />
        </div>

        {/* Notes Stream */}
        {notes.length > 0 ? (
          <div className="space-y-3">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note as any}
                to={`/n/${note.id}`}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#242430] bg-[#14141a] p-12 text-center">
            <h3 className="text-sm font-semibold text-white">No public notes found</h3>
            <p className="text-xs text-zinc-400 mt-1">
              {selectedCategory
                ? `There are no public notes in the ${selectedCategory} category yet.`
                : "No notes have been shared publicly yet."}
            </p>
            {selectedCategory && (
              <button
                type="button"
                onClick={() => handleSelectCategory(undefined)}
                className="mt-4 rounded-lg border border-[#2e2e3e] bg-[#1a1a24] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Pagination */}
        {next_cursor && (
          <div className="flex justify-center pt-6">
            <Link
              to={`/feed?${nextParams.toString()}`}
              className="rounded-lg border border-[#2a2a38] bg-[#16161e] px-5 py-2 text-xs font-medium text-zinc-200 shadow-xs hover:bg-[#20202c] transition-colors"
            >
              Load more notes →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
