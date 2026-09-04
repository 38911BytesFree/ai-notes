import { useState } from "react";
import { Link, useLoaderData, useFetcher, redirect } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";
import { authenticationStorage } from "~/services/session.server";
import * as notesApi from "~/services/notes-api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // requireAuth already called GET /v1/me; reuse that profile.
  const { user } = await requireAuth(request);
  return { user };
}

export async function action({ request }: ActionFunctionArgs) {
  const { user } = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update_keep_transcript") {
    const keepVal = formData.get("default_keep_transcript") === "true";
    const res = await notesApi.patchMe(request, { default_keep_transcript: keepVal });
    if (!res.ok) {
      return Response.json({ code: res.code }, { status: 400 });
    }
    return Response.json({ ok: true, user: res.data });
  }

  if (intent === "delete_account") {
    const confirmEmail = String(formData.get("confirm_email") ?? "").trim();
    if (confirmEmail.toLowerCase() !== user?.email.toLowerCase()) {
      return Response.json({ error: "Email does not match" }, { status: 400 });
    }

    const res = await notesApi.deleteMe(request);
    if (!res.ok) {
      return Response.json({ code: res.code }, { status: 500 });
    }

    // Destroy local session cookie
    const authSession = await authenticationStorage.getSession(request.headers.get("Cookie"));
    const clearCookie = await authenticationStorage.destroySession(authSession);

    return redirect("/", {
      headers: {
        "Set-Cookie": clearCookie,
      },
    });
  }

  return Response.json({ code: "invalid_argument" }, { status: 400 });
}

export default function SettingsView() {
  const { user } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok?: boolean; error?: string; code?: string }>();

  const [keepTranscript, setKeepTranscript] = useState(user.default_keep_transcript);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleToggleKeepTranscript = (checked: boolean) => {
    setKeepTranscript(checked);
    const fd = new FormData();
    fd.append("intent", "update_keep_transcript");
    fd.append("default_keep_transcript", String(checked));
    fetcher.submit(fd, { method: "post" });
  };

  const isDeleteDisabled = confirmEmail.trim().toLowerCase() !== user.email.toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-16">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/app"
            className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Back to library
          </Link>
          <span className="text-sm font-semibold text-gray-900">Settings</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-6">
        {/* Account & Plan Summary */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Account</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-gray-500 block">Email Address</span>
              <span className="font-medium text-gray-900">{user.email}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Monthly Ingest Usage</span>
              <span className="font-medium text-gray-900">
                {user.ingest_count} / {user.ingest_limit} conversations used this month
              </span>
            </div>
          </div>
        </section>

        {/* Preferences */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Preferences</h2>

          <div className="flex items-center justify-between py-2">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Keep original transcripts by default</h3>
              <p className="text-xs text-gray-500">
                When enabled, the full conversation text is kept in private storage so you can download it later. Turn it off to keep only the summary.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                checked={keepTranscript}
                onChange={(e) => handleToggleKeepTranscript(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-hidden peer-focus:ring-2 peer-focus:ring-gray-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></div>
            </label>
          </div>
        </section>

        {/* Data & Privacy */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Your Data</h2>
          <p className="text-sm text-gray-600">
            Export a complete archive of all your saved notes and transcripts as a JSON file.
          </p>
          <div>
            <a
              href="/api/me/export"
              download="ai-notes-export.json"
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors"
            >
              Download my data
            </a>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="rounded-xl border border-red-200 bg-red-50/50 p-6 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-red-900">Danger Zone</h2>
          <p className="text-sm text-red-700">
            Permanently delete your account and all associated notes, vector embeddings, and transcripts. This action is irreversible.
          </p>
          <div>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-red-700 transition-colors"
            >
              Delete my account
            </button>
          </div>
        </section>

        {/* Delete Account Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-red-600">Delete Account</h3>
              <p className="text-sm text-gray-600">
                This will permanently delete all your data including notes, summaries, and transcripts.
                To confirm, please type your email address (<strong>{user.email}</strong>) below:
              </p>

              <div>
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder={user.email}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-red-600 focus:outline-hidden focus:ring-1 focus:ring-red-600"
                />
              </div>

              {fetcher.data?.error && (
                <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                  {fetcher.data.error}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setConfirmEmail("");
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="delete_account" />
                  <input type="hidden" name="confirm_email" value={confirmEmail} />
                  <button
                    type="submit"
                    disabled={isDeleteDisabled || fetcher.state !== "idle"}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {fetcher.state !== "idle" ? "Deleting..." : "Permanently Delete Account"}
                  </button>
                </fetcher.Form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
