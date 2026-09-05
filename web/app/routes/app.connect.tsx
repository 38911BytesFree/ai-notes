import { useState } from "react";
import { Link, useLoaderData, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";
import {
  createPAT,
  listPATs,
  revokePAT,
  type PATListItem,
  type CreatePATResponse,
} from "~/services/pats-api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { user } = await requireAuth(request);
  const patsRes = await listPATs(request);
  const pats = patsRes.ok ? patsRes.data.pats : [];

  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL ||
    `${new URL(request.url).protocol}//${new URL(request.url).host}`;

  return {
    user,
    pats,
    publicBaseUrl,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_pat") {
    const label = String(formData.get("label") ?? "").trim();
    if (!label) {
      return Response.json(
        { error: "A label is required for the token." },
        { status: 400 }
      );
    }
    const res = await createPAT(request, label);
    if (!res.ok) {
      return Response.json({ code: res.code }, { status: 400 });
    }
    return Response.json({ ok: true, created: res.data });
  }

  if (intent === "revoke_pat") {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) {
      return Response.json({ error: "Token ID is required." }, { status: 400 });
    }
    const res = await revokePAT(request, id);
    if (!res.ok) {
      return Response.json({ code: res.code }, { status: 400 });
    }
    return Response.json({ ok: true, revokedId: id });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

export function ConnectContent({
  pats: initialPats,
  publicBaseUrl,
  initialCreatedToken,
}: {
  pats: PATListItem[];
  publicBaseUrl: string;
  initialCreatedToken?: CreatePATResponse | null;
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    created?: CreatePATResponse;
    revokedId?: string;
    error?: string;
    code?: string;
  }>();

  const [label, setLabel] = useState("");
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [tokenToRevoke, setTokenToRevoke] = useState<PATListItem | null>(null);

  // If newly created from action or passed as prop
  const createdToken = fetcher.data?.created ?? initialCreatedToken;

  const pats = initialPats.filter(
    (p) => p.id !== fetcher.data?.revokedId
  );

  const handleCopy = async (text: string, type: "token" | string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "token") {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2500);
      } else {
        setCopiedSnippet(type);
        setTimeout(() => setCopiedSnippet(null), 2500);
      }
    } catch (e) {
      console.error("Clipboard copy failed", e);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    fetcher.submit(
      { intent: "create_pat", label: label.trim() },
      { method: "post" }
    );
    setLabel("");
  };

  const handleConfirmRevoke = () => {
    if (!tokenToRevoke) return;
    fetcher.submit(
      { intent: "revoke_pat", id: tokenToRevoke.id },
      { method: "post" }
    );
    setTokenToRevoke(null);
  };

  const claudeCodeSnippet = `claude mcp add --transport http ai-notes ${publicBaseUrl}/mcp --header "Authorization: Bearer <token>"`;

  const cursorSnippet = JSON.stringify(
    {
      mcpServers: {
        "ai-notes": {
          url: `${publicBaseUrl}/mcp`,
          headers: {
            Authorization: "Bearer <token>",
          },
        },
      },
    },
    null,
    2
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Connect to AI Notes
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect Cursor, Claude Code, ChatGPT, or Claude.ai directly to your notes using the Model Context Protocol (MCP).
        </p>
      </div>

      {/* One-Time Reveal Alert */}
      {createdToken && (
        <div
          data-testid="pat-reveal-banner"
          className="rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-xs space-y-4"
        >
          <div className="flex items-start">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900">
                Personal Access Token Created: {createdToken.label}
              </h3>
              <p className="mt-1 text-xs text-amber-800">
                Make sure to copy your personal access token now. You won't be able to see it again!
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              data-testid="pat-token-input"
              value={createdToken.token}
              className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 select-all focus:outline-hidden"
            />
            <button
              type="button"
              data-testid="copy-pat-button"
              onClick={() => handleCopy(createdToken.token, "token")}
              className="rounded-md bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 transition-colors cursor-pointer"
            >
              {copiedToken ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Section 1: Personal Access Tokens */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Personal Access Tokens</h2>
          <p className="mt-1 text-xs text-gray-500">
            Tokens allow command-line and desktop AI assistants like Claude Code and Cursor to access your notes.
          </p>
        </div>

        {/* Create Token Form */}
        <form onSubmit={handleCreateSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            name="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Claude Code on MacBook"
            maxLength={60}
            required
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-hidden"
          />
          <button
            type="submit"
            disabled={fetcher.state !== "idle" || !label.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {fetcher.state !== "idle" ? "Creating..." : "Create Token"}
          </button>
        </form>

        {/* Existing Tokens Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Active Tokens
          </h3>

          {pats.length === 0 ? (
            <p className="text-sm text-gray-500 italic py-2">
              No personal access tokens created yet.
            </p>
          ) : (
            <div className="divide-y divide-gray-200 border-t border-b border-gray-200">
              {pats.map((pat) => (
                <div
                  key={pat.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">{pat.label}</span>
                      <code className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 font-mono">
                        {pat.prefix}...
                      </code>
                    </div>
                    <div className="flex space-x-4 text-xs text-gray-500">
                      <span>
                        Created: {new Date(pat.created_at).toLocaleDateString()}
                      </span>
                      <span>
                        Last used:{" "}
                        {pat.last_used_at
                          ? new Date(pat.last_used_at).toLocaleDateString()
                          : "Never"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTokenToRevoke(pat)}
                    className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors cursor-pointer"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Connect a Client */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Connect a Client</h2>
          <p className="mt-1 text-xs text-gray-500">
            Use these configurations to link your favorite AI clients to your notes.
          </p>
          <div className="mt-3 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            <span className="font-semibold">Notice:</span> The first call after idle can take a few seconds while the server starts up.
          </div>
        </div>

        <div className="space-y-6">
          {/* Claude Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">1. Claude Code</h3>
              <button
                type="button"
                onClick={() => handleCopy(claudeCodeSnippet, "claude")}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                {copiedSnippet === "claude" ? "Copied!" : "Copy command"}
              </button>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-gray-100">
              <code>{claudeCodeSnippet}</code>
            </pre>
          </div>

          {/* Cursor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">2. Cursor</h3>
              <button
                type="button"
                onClick={() => handleCopy(cursorSnippet, "cursor")}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                {copiedSnippet === "cursor" ? "Copied!" : "Copy JSON"}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Add to your Cursor MCP settings file (<code className="bg-gray-100 px-1 py-0.5 rounded-sm">.cursor/mcp.json</code>):
            </p>
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-gray-100">
              <code>{cursorSnippet}</code>
            </pre>
          </div>

          {/* Claude.ai */}
          <div className="space-y-2 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">3. Claude.ai</h3>
            <p className="text-xs text-gray-600">
              Go to <span className="font-medium">Settings → Connectors → Add custom connector</span>.
            </p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={`${publicBaseUrl}/mcp`}
                className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-800"
              />
              <button
                type="button"
                onClick={() => handleCopy(`${publicBaseUrl}/mcp`, "claude.ai")}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 cursor-pointer"
              >
                {copiedSnippet === "claude.ai" ? "Copied!" : "Copy URL"}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              No token needed. You will be prompted to sign in and grant access when Claude connects.
            </p>
          </div>

          {/* ChatGPT */}
          <div className="space-y-2 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">4. ChatGPT</h3>
            <p className="text-xs text-gray-600">
              Go to <span className="font-medium">Settings → Connectors → Developer mode</span> and enter the same URL:
            </p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={`${publicBaseUrl}/mcp`}
                className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-800"
              />
              <button
                type="button"
                onClick={() => handleCopy(`${publicBaseUrl}/mcp`, "chatgpt")}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 cursor-pointer"
              >
                {copiedSnippet === "chatgpt" ? "Copied!" : "Copy URL"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Revoke Confirmation Modal */}
      {tokenToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-gray-900">
              Revoke Access Token?
            </h3>
            <p className="text-sm text-gray-600">
              Are you sure you want to revoke the token{" "}
              <span className="font-semibold">"{tokenToRevoke.label}"</span>? Any client using this token will immediately lose access.
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setTokenToRevoke(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-700 cursor-pointer"
              >
                Revoke Token
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function AppConnect() {
  const { pats, publicBaseUrl } = useLoaderData<typeof loader>();

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
          <span className="text-sm font-semibold text-gray-900">Connect</span>
        </div>
      </header>

      <ConnectContent pats={pats} publicBaseUrl={publicBaseUrl} />
    </div>
  );
}
