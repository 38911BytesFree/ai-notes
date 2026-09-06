import { useState, useEffect } from "react";
import { data, redirect, useLoaderData, useFetcher, useNavigate, Link } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router";
import { requireAuth, validateAuth } from "~/services/auth.server";
import {
  extractShareUrl,
  getPendingShare,
  setPendingShare,
  clearPendingShare,
  type SharePendingPayload,
} from "~/services/share-pending.server";
import { detectProvider } from "~/services/share-url";
import { getErrorMessage } from "~/services/error-messages";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const rawUrl = formData.get("url") ? String(formData.get("url")) : null;
  const rawText = formData.get("text") ? String(formData.get("text")) : null;
  const rawTitle = formData.get("title") ? String(formData.get("title")) : null;

  const sharedUrl = extractShareUrl(rawUrl, rawText);
  const payload: SharePendingPayload = {
    url: sharedUrl,
    title: rawTitle?.trim() || undefined,
    text: rawText?.trim() || undefined,
  };

  const cookieHeader = await setPendingShare(payload);

  const auth = await validateAuth(request);
  if (!auth.isAuthenticated || !auth.user) {
    return redirect("/login?next=/app/share", {
      headers: {
        "Set-Cookie": cookieHeader,
      },
    });
  }

  // Authenticated: 303 redirect to /app/share with cookie
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/app/share",
      "Set-Cookie": cookieHeader,
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);

  const payload = (await getPendingShare(request)) || {};
  const clearCookieHeader = await clearPendingShare();

  return data(
    {
      url: payload.url || "",
      title: payload.title || "",
      text: payload.text || "",
    },
    {
      headers: {
        "Set-Cookie": clearCookieHeader,
      },
    }
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Save to AI Notes" },
    { name: "robots", content: "noindex, nofollow" },
  ];
};

export default function ShareTargetRoute() {
  const { url: initialUrl, text: initialText } = useLoaderData<typeof loader>();
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [inputText, setInputText] = useState(initialText);
  const [keepTranscript, setKeepTranscript] = useState(true);

  const fetcher = useFetcher<{ ok?: boolean; id?: string; code?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.id) {
      navigate(`/app/notes/${fetcher.data.id}`);
    }
  }, [fetcher.data, navigate]);

  const detectedProvider = inputUrl ? detectProvider(inputUrl) : null;
  const hasSupportedUrl = Boolean(detectedProvider);

  const isSubmitting = fetcher.state !== "idle";
  const errorMessage = fetcher.data?.code ? getErrorMessage(fetcher.data.code) : null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-16">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/app"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Back to library
          </Link>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Share Target
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Save to AI Notes</h1>
            <p className="text-sm text-gray-500 mt-1">
              Review and confirm the conversation to process and save into your library.
            </p>
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <fetcher.Form method="post" action="/api/ingest" className="space-y-5">
            {hasSupportedUrl ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Detected Provider
                    </span>
                    <span className="inline-flex items-center rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100 uppercase">
                      {detectedProvider}
                    </span>
                  </div>
                  <input
                    type="text"
                    name="input"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900 font-mono text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="share-input" className="block text-xs font-medium text-gray-700 mb-1">
                    Conversation URL or Raw Text
                  </label>
                  <textarea
                    id="share-input"
                    name="input"
                    rows={6}
                    required
                    value={inputText || inputUrl}
                    onChange={(e) => {
                      setInputText(e.target.value);
                      if (/^https?:\/\//i.test(e.target.value.trim())) {
                        setInputUrl(e.target.value.trim());
                      }
                    }}
                    placeholder="Paste a ChatGPT or Claude share link, or paste the raw conversation text..."
                    className="w-full rounded-md border border-gray-300 p-3 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <label className="flex items-center space-x-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  name="keep_transcript"
                  checked={keepTranscript}
                  onChange={(e) => setKeepTranscript(e.target.checked)}
                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900 h-4 w-4"
                />
                <span>Store original conversation transcript</span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Saving..." : "Save to AI Notes"}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </main>
    </div>
  );
}
