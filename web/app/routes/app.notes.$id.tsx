import { useState, useEffect } from "react";
import { Link, useLoaderData, useNavigate, useFetcher, redirect } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";
import * as notesApi from "~/services/notes-api.server";
import type { Note, UserProfile } from "~/services/notes-api.server";
import { CATEGORIES } from "~/components/CategoryChips";
import { CodeBlock } from "~/components/CodeBlock";
import { VisibilityControl } from "~/components/VisibilityControl";
import { SidebarRail } from "~/components/SidebarRail";
import { AssistantRail } from "~/components/AssistantRail";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { user } = await requireAuth(request);
  const id = params.id;
  if (!id) {
    throw new Response("Note not found", { status: 404 });
  }

  const res = await notesApi.getNote(request, id);
  if (!res.ok) {
    throw new Response("Note not found", { status: 404 });
  }

  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL ||
    `${new URL(request.url).protocol}//${new URL(request.url).host}`;

  return { note: res.data, publicBaseUrl, user };
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

  if (intent === "visibility") {
    const visibility = String(formData.get("visibility") ?? "").trim() as
      | "private"
      | "unlisted"
      | "public";
    if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public") {
      return Response.json({ code: "invalid_argument" }, { status: 400 });
    }
    const acknowledgePii =
      formData.get("acknowledge_pii") === "true" ||
      formData.get("acknowledge_pii") === "on";

    const res = await notesApi.setNoteVisibility(request, id, visibility, acknowledgePii);
    if (!res.ok) {
      return Response.json(
        { code: res.code, pii_unacknowledged: res.code === "pii_unacknowledged" },
        { status: res.code === "pii_unacknowledged" ? 403 : 400 }
      );
    }
    return Response.json({ ok: true, note: res.data });
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
    const acknowledgePii =
      formData.get("acknowledge_pii") === "true" ||
      formData.get("acknowledge_pii") === "on";

    const res = await notesApi.patchNote(request, id, {
      title,
      summary,
      takeaways,
      category,
      tags,
      acknowledge_pii: acknowledgePii,
    });

    if (!res.ok) {
      return Response.json(
        { code: res.code, pii_unacknowledged: res.code === "pii_unacknowledged" },
        { status: res.code === "pii_unacknowledged" ? 403 : 400 }
      );
    }
    return Response.json({ ok: true, note: res.data });
  }

  if (intent === "refine") {
    const instruction = String(formData.get("instruction") ?? "").trim();
    if (!instruction) {
      return Response.json({ code: "invalid_argument" }, { status: 400 });
    }
    const res = await notesApi.refineNote(request, id, instruction);
    if (!res.ok) {
      return Response.json({ code: res.code }, { status: 400 });
    }
    return Response.json({ ok: true, refined: res.data });
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
  const data = useLoaderData<typeof loader>();
  const initialNote = data.note;
  const publicBaseUrl = data.publicBaseUrl;
  const user: UserProfile = (data as any).user || {
    uid: initialNote.owner_uid,
    email: "user@example.com",
    created_at: initialNote.created_at,
    default_keep_transcript: true,
  };

  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: boolean; note?: Note; code?: string }>();
  const refineFetcher = useFetcher<{ ok?: boolean; refined?: notesApi.RefinedNoteSummary; code?: string }>();

  const note = (fetcher.data?.note as Note | undefined) ?? initialNote;

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState(note.title);
  const [editSummary, setEditSummary] = useState(note.summary);
  const [editTakeaways, setEditTakeaways] = useState((note.takeaways ?? []).join("\n"));
  const [editCategory, setEditCategory] = useState(note.category);
  const [editTags, setEditTags] = useState((note.tags ?? []).join(", "));

  // AI Refine state
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refineSuccess, setRefineSuccess] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);

  type UndoSnapshot = {
    title: string;
    summary: string;
    takeaways: string;
    category: string;
    tags: string;
  };
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);

  const isRefining = refineFetcher.state !== "idle";

  const startEditing = () => {
    setEditTitle(note.title);
    setEditSummary(note.summary);
    setEditTakeaways((note.takeaways ?? []).join("\n"));
    setEditCategory(note.category);
    setEditTags((note.tags ?? []).join(", "));
    setRefineInstruction("");
    setRefineSuccess(false);
    setRefineError(null);
    setUndoSnapshot(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setUndoSnapshot(null);
    setRefineSuccess(false);
    setRefineError(null);
  };

  const handleRefineSubmit = () => {
    if (!refineInstruction.trim() || isRefining) return;
    setUndoSnapshot({
      title: editTitle,
      summary: editSummary,
      takeaways: editTakeaways,
      category: editCategory,
      tags: editTags,
    });
    setRefineSuccess(false);
    setRefineError(null);
    refineFetcher.submit(
      { intent: "refine", instruction: refineInstruction.trim() },
      { method: "post" }
    );
  };

  const handleUndoRefine = () => {
    if (!undoSnapshot) return;
    setEditTitle(undoSnapshot.title);
    setEditSummary(undoSnapshot.summary);
    setEditTakeaways(undoSnapshot.takeaways);
    setEditCategory(undoSnapshot.category);
    setEditTags(undoSnapshot.tags);
    setUndoSnapshot(null);
    setRefineSuccess(false);
  };

  useEffect(() => {
    if (refineFetcher.data?.ok && refineFetcher.data.refined && refineFetcher.state === "idle") {
      const refined = refineFetcher.data.refined;
      if (refined.title) setEditTitle(refined.title);
      if (refined.summary) setEditSummary(refined.summary);
      if (refined.takeaways) setEditTakeaways(refined.takeaways.join("\n"));
      if (refined.category) setEditCategory(refined.category);
      if (refined.tags) setEditTags(refined.tags.join(", "));
      setRefineSuccess(true);
      setRefineError(null);
    } else if (refineFetcher.data && !refineFetcher.data.ok && refineFetcher.data.code && refineFetcher.state === "idle") {
      setRefineError(
        refineFetcher.data.code === "invalid_argument"
          ? "Please provide an instruction for what to change."
          : "AI refinement failed. Please try again."
      );
      setRefineSuccess(false);
    }
  }, [refineFetcher.data, refineFetcher.state]);

  const isPatching = fetcher.state !== "idle";

  useEffect(() => {
    if (isEditing && fetcher.data?.ok && fetcher.state === "idle") {
      setIsEditing(false);
    }
  }, [isEditing, fetcher.data?.ok, fetcher.state]);

  const createdDate = note.created_at ? new Date(note.created_at) : new Date();
  const timeStr = createdDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = note.source.conversation_date
    ? new Date(note.source.conversation_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : createdDate.toLocaleDateString("en-GB", {
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
      : "manual paste";

  return (
    <div className="flex min-h-screen bg-[#0e0e11] text-[#f4f4f5]">
      {/* Collapsed quiet icon rail */}
      <SidebarRail user={user} collapsed={true} />

      {/* Center Reading Measure */}
      <div className="flex-1 min-w-0 flex flex-col items-center">
        {/* Top Action Bar */}
        <header className="w-full border-b border-[#222228] bg-[#121216] sticky top-0 z-10 px-4 py-2.5">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <Link
              to="/app"
              className="inline-flex items-center space-x-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
            >
              <span>←</span>
              <span>All notes</span>
            </Link>

            <div className="flex items-center space-x-3 text-xs">
              <span className="text-zinc-500 font-mono hidden sm:inline">
                Saved {timeStr}
              </span>

              <button
                type="button"
                onClick={() => setIsStarred(!isStarred)}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  isStarred ? "text-amber-400" : "text-zinc-400 hover:text-zinc-200"
                }`}
                title={isStarred ? "Starred" : "Star note"}
              >
                {isStarred ? "★" : "☆"} Star
              </button>

              <button
                type="button"
                onClick={() => setShowShareModal(!showShareModal)}
                className="px-2.5 py-1 rounded bg-[#1e1e28] hover:bg-[#282836] border border-[#2b2b3b] text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Share
              </button>

              {!isEditing && (
                <>
                  <button
                    type="button"
                    onClick={startEditing}
                    className="text-zinc-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
                    title="Edit note"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-red-400 hover:text-red-300 p-1 rounded transition-colors cursor-pointer"
                    title="Delete note"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Document Reading Column (Measure: max-w-2xl / max-w-3xl) */}
        <main className="w-full max-w-2xl px-4 py-8 md:py-12 space-y-6">
          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
              <div className="w-full max-w-sm rounded-2xl border border-[#2b2b38] bg-[#14141a] p-6 shadow-2xl space-y-4">
                <h3 className="text-base font-semibold text-white">Delete note?</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Are you sure you want to delete &quot;{note.title}&quot;? This action cannot be undone.
                </p>
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="delete_note" />
                    <button
                      type="submit"
                      className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-500 cursor-pointer"
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
            <fetcher.Form method="post" className="rounded-2xl border border-[#2b2b38] bg-[#14141a] p-6 space-y-5">
              <input type="hidden" name="intent" value="patch" />
              <h2 className="text-base font-semibold text-white">Edit Note</h2>

              {/* AI Refinement Box */}
              <div className="rounded-xl border border-indigo-500/30 bg-[#161526] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-indigo-400 text-sm">✦</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                      Refine with AI
                    </span>
                  </div>
                  {undoSnapshot && (
                    <button
                      type="button"
                      onClick={handleUndoRefine}
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                    >
                      Undo AI changes
                    </button>
                  )}
                </div>

                <p className="text-xs text-zinc-400">
                  Describe what you would like to change in plain English (e.g. &ldquo;the summary includes two recipes - rewrite so it only focuses on the second one&rdquo; or &ldquo;make takeaways more concise&rdquo;).
                </p>

                <div className="space-y-2">
                  <textarea
                    id="refine-instruction"
                    rows={2}
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    placeholder="What would you like to change?"
                    disabled={isRefining}
                    className="w-full rounded-xl border border-[#2a2a38] bg-[#1a1a24] p-3 text-sm text-white placeholder-zinc-500 focus:outline-hidden focus:border-indigo-500 font-sans disabled:opacity-50"
                  />

                  {refineSuccess && (
                    <div className="flex items-center space-x-2 text-xs text-emerald-400 font-medium">
                      <span>✓</span>
                      <span>AI changes applied to fields below. Review and click &ldquo;Save Changes&rdquo; to save.</span>
                    </div>
                  )}

                  {refineError && (
                    <div className="text-xs text-rose-400 font-medium">
                      {refineError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleRefineSubmit}
                      disabled={isRefining || !refineInstruction.trim()}
                      className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isRefining ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>Refining...</span>
                        </>
                      ) : (
                        <>
                          <span>✦</span>
                          <span>Refine Note</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="edit-title" className="block text-xs font-medium text-zinc-400 mb-1">
                  Title
                </label>
                <input
                  id="edit-title"
                  type="text"
                  name="title"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-[#2a2a38] bg-[#1a1a24] px-3 py-2 text-sm text-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-category" className="block text-xs font-medium text-zinc-400 mb-1">
                    Category
                  </label>
                  <select
                    id="edit-category"
                    name="category"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full rounded-xl border border-[#2a2a38] bg-[#1a1a24] px-3 py-2 text-sm text-white focus:outline-hidden focus:border-indigo-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} className="bg-[#1a1a24] text-white">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-tags" className="block text-xs font-medium text-zinc-400 mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    id="edit-tags"
                    type="text"
                    name="tags"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="golang, concurrency, generics"
                    className="w-full rounded-xl border border-[#2a2a38] bg-[#1a1a24] px-3 py-2 text-sm text-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="edit-summary" className="block text-xs font-medium text-zinc-400 mb-1">
                  Summary
                </label>
                <textarea
                  id="edit-summary"
                  name="summary"
                  rows={5}
                  required
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full rounded-xl border border-[#2a2a38] bg-[#1a1a24] p-3 text-sm text-white focus:outline-hidden focus:border-indigo-500 font-sans"
                />
              </div>

              <div>
                <label htmlFor="edit-takeaways" className="block text-xs font-medium text-zinc-400 mb-1">
                  Takeaways (one per line)
                </label>
                <textarea
                  id="edit-takeaways"
                  name="takeaways"
                  rows={5}
                  value={editTakeaways}
                  onChange={(e) => setEditTakeaways(e.target.value)}
                  className="w-full rounded-xl border border-[#2a2a38] bg-[#1a1a24] p-3 text-sm text-white focus:outline-hidden focus:border-indigo-500 font-sans"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPatching}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {isPatching ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </fetcher.Form>
          ) : (
            /* Document Reading View */
            <article className="space-y-6">
              {/* Metadata line (Fri 6 Sep · 14:20 · #tag Category) */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 font-mono">
                <span>{dateStr}</span>
                <span>·</span>
                <span>{timeStr}</span>
                <span>·</span>
                <span className="text-indigo-400 font-medium font-sans">
                  {note.category}
                </span>
                {(note.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-md bg-[#191924] px-2 py-0.5 text-xs font-mono text-zinc-400 border border-[#262638]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Note Title */}
              <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
                {note.title}
              </h1>

              {/* Provenance info */}
              <p className="text-xs text-zinc-400">
                From a{" "}
                {note.source.share_url ? (
                  <a
                    href={note.source.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
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

              {/* Marked AI Summary Accent Box */}
              <div className="rounded-2xl border border-indigo-900/50 bg-[#161524] p-5 my-6 space-y-2">
                <div className="text-[11px] font-bold text-indigo-400 tracking-wider uppercase flex items-center space-x-1.5">
                  <span>✦</span>
                  <span>SUMMARY</span>
                </div>
                <div className="text-sm text-zinc-200 whitespace-pre-line leading-relaxed">
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

              {/* Code Snippets */}
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

              {/* Transcript Section */}
              <div className="space-y-3 pt-4 border-t border-[#222228]">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Transcript
                </h2>
                {note.has_transcript ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#14141a] border border-[#242430] p-4 text-xs text-zinc-300">
                    <div>
                      <span className="font-medium text-white">Original transcript kept</span>{" "}
                      <span className="text-zinc-500">({formatBytes(note.transcript_bytes)})</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <a
                        href={`/api/notes/${note.id}/transcript`}
                        download={`transcript-${note.id}.json`}
                        className="rounded-lg border border-[#2b2b3a] bg-[#1c1c26] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:text-white hover:bg-[#252533] transition-colors"
                      >
                        Download
                      </a>
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="delete_transcript" />
                        <button
                          type="submit"
                          disabled={fetcher.state !== "idle"}
                          className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/40 transition-colors cursor-pointer"
                        >
                          Delete transcript
                        </button>
                      </fetcher.Form>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">Not kept</p>
                )}
              </div>

              {/* Visibility & Sharing Control */}
              <div className="pt-4 border-t border-[#222228]">
                <VisibilityControl
                  noteId={note.id}
                  visibility={note.visibility}
                  piiFlags={note.pii_flags}
                  publicBaseUrl={publicBaseUrl}
                />
              </div>
            </article>
          )}
        </main>
      </div>

      {/* Right Rail: This Note Context */}
      <AssistantRail
        notes={[]}
        noteMode={true}
        activeNote={{
          title: note.title,
          takeaways: note.takeaways,
          category: note.category,
        }}
      />
    </div>
  );
}
