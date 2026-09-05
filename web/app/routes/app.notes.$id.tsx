import { useState, useEffect } from "react";
import { Link, useLoaderData, useNavigate, useFetcher, redirect } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";
import * as notesApi from "~/services/notes-api.server";
import type { Note } from "~/services/notes-api.server";
import { CATEGORIES } from "~/components/CategoryChips";
import { CodeBlock } from "~/components/CodeBlock";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAuth(request);
  const id = params.id;
  if (!id) {
    throw new Response("Note not found", { status: 404 });
  }

  const res = await notesApi.getNote(request, id);
  if (!res.ok) {
    throw new Response("Note not found", { status: 404 });
  }

  return { note: res.data };
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAuth(request);
  const id = params.id;
  if (!id) {
    throw new Response("Missing note id", { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete_note") {
    const res = await notesApi.deleteNote(request, id);
    if (!res.ok) {
      return Response.json({ code: res.code }, { status: 500 });
    }
    return redirect("/app");
  }

  if (intent === "delete_transcript") {
    const res = await notesApi.deleteTranscript(request, id);
    if (!res.ok) {
      return Response.json({ code: res.code }, { status: 500 });
    }
    return Response.json({ ok: true });
  }

  if (intent === "patch") {
    const title = String(formData.get("title") ?? "").trim();
    const summary = String(formData.get("summary") ?? "").trim();
    const takeawaysRaw = String(formData.get("takeaways") ?? "");
    const takeaways = takeawaysRaw
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    const category = String(formData.get("category") ?? "").trim();
    const tagsRaw = String(formData.get("tags") ?? "");
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const res = await notesApi.patchNote(request, id, {
      title,
      summary,
      takeaways,
      category,
      tags,
    });

    if (!res.ok) {
      return Response.json({ code: res.code }, { status: 400 });
    }
    return Response.json({ ok: true, note: res.data });
  }

  return Response.json({ code: "invalid_argument" }, { status: 400 });
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kb = Math.round(bytes / 1024);
  return `${kb} KB`;
}

export default function NoteDetailView() {
  const { note: initialNote } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: boolean; note?: Note; code?: string }>();

  const note = (fetcher.data?.note as Note | undefined) ?? initialNote;

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState(note.title);
  const [editSummary, setEditSummary] = useState(note.summary);
  const [editTakeaways, setEditTakeaways] = useState((note.takeaways ?? []).join("\n"));
  const [editCategory, setEditCategory] = useState(note.category);
  const [editTags, setEditTags] = useState((note.tags ?? []).join(", "));

  const startEditing = () => {
    setEditTitle(note.title);
    setEditSummary(note.summary);
    setEditTakeaways((note.takeaways ?? []).join("\n"));
    setEditCategory(note.category);
    setEditTags((note.tags ?? []).join(", "));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const isPatching = fetcher.state !== "idle";

  // When patch succeeds, exit edit mode
  useEffect(() => {
    if (isEditing && fetcher.data?.ok && fetcher.state === "idle") {
      setIsEditing(false);
    }
  }, [isEditing, fetcher.data?.ok, fetcher.state]);

  // Provenance formatting
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
      : "manual paste";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-16">
      {/* Top Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/app"
            className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Back to library
          </Link>
          <div className="flex items-center space-x-2">
            {!isEditing && (
              <>
                <button
                  type="button"
                  onClick={startEditing}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors"
                >
                  Edit note
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 shadow-xs hover:bg-red-100 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Delete note?</h3>
              <p className="text-sm text-gray-600">
                Are you sure you want to delete &quot;{note.title}&quot;? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="delete_note" />
                  <button
                    type="submit"
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Confirm Delete
                  </button>
                </fetcher.Form>
              </div>
            </div>
          </div>
        )}

        {isEditing ? (
          /* Edit Form */
          <fetcher.Form method="post" className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-5">
            <input type="hidden" name="intent" value="patch" />
            <h2 className="text-lg font-semibold text-gray-900">Edit Note</h2>

            <div>
              <label htmlFor="edit-title" className="block text-xs font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                id="edit-title"
                type="text"
                name="title"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-category" className="block text-xs font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  id="edit-category"
                  name="category"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900 bg-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-tags" className="block text-xs font-medium text-gray-700 mb-1">
                  Tags (comma separated)
                </label>
                <input
                  id="edit-tags"
                  type="text"
                  name="tags"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="golang, concurrency, generics"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900"
                />
              </div>
            </div>

            <div>
              <label htmlFor="edit-summary" className="block text-xs font-medium text-gray-700 mb-1">
                Summary
              </label>
              <textarea
                id="edit-summary"
                name="summary"
                rows={5}
                required
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-3 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900"
              />
            </div>

            <div>
              <label htmlFor="edit-takeaways" className="block text-xs font-medium text-gray-700 mb-1">
                Takeaways (one per line)
              </label>
              <textarea
                id="edit-takeaways"
                name="takeaways"
                rows={5}
                value={editTakeaways}
                onChange={(e) => setEditTakeaways(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-3 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPatching}
                className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-xs hover:bg-gray-800 disabled:opacity-50"
              >
                {isPatching ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </fetcher.Form>
        ) : (
          /* View Mode */
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
                    rel="noopener noreferrer"
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

            {/* Transcript Section */}
            <div className="border-t border-gray-100 pt-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
                Transcript
              </h2>
              {note.has_transcript ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-700 border border-gray-200">
                  <div>
                    <span className="font-medium">Original transcript kept</span>{" "}
                    <span className="text-xs text-gray-500">({formatBytes(note.transcript_bytes)})</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <a
                      href={`/api/notes/${note.id}/transcript`}
                      download={`transcript-${note.id}.json`}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50"
                    >
                      Download
                    </a>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="delete_transcript" />
                      <button
                        type="submit"
                        disabled={fetcher.state !== "idle"}
                        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-xs hover:bg-red-50"
                      >
                        Delete transcript
                      </button>
                    </fetcher.Form>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Not kept</p>
              )}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
