import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import type { Note } from "~/services/notes-api.server";

export const PII_FLAG_DESCRIPTIONS: Record<string, string> = {
  api_key: "API key or secret token",
  bearer_token: "Bearer authentication token",
  jwt: "JSON Web Token (JWT)",
  private_key: "Cryptographic private key",
  ip_address: "IP address",
  email: "Email address",
  us_ssn: "Social Security Number",
  credit_card: "Payment card number",
};

export function formatPiiFlag(flag: string): string {
  return PII_FLAG_DESCRIPTIONS[flag] || flag.replace(/_/g, " ");
}

export interface VisibilityControlProps {
  noteId: string;
  visibility: "private" | "unlisted" | "public" | string;
  piiFlags?: string[];
  publicBaseUrl: string;
  actionData?: {
    ok?: boolean;
    code?: string;
    pii_unacknowledged?: boolean;
    note?: Note;
  } | null;
  isSubmitting?: boolean;
}

export function VisibilityControl({
  noteId,
  visibility: initialVisibility,
  piiFlags = [],
  publicBaseUrl,
  actionData: externalActionData,
  isSubmitting: externalIsSubmitting,
}: VisibilityControlProps) {
  const fetcher = useFetcher<{
    ok?: boolean;
    code?: string;
    pii_unacknowledged?: boolean;
    note?: Note;
  }>();

  const actionData = externalActionData !== undefined ? externalActionData : fetcher.data;
  const isSubmitting = externalIsSubmitting !== undefined ? externalIsSubmitting : fetcher.state !== "idle";

  const [currentVisibility, setCurrentVisibility] = useState(initialVisibility);
  const [selectedVisibility, setSelectedVisibility] = useState(initialVisibility);
  const [acknowledgeChecked, setAcknowledgeChecked] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync state when initialVisibility changes or fetcher succeeds
  useEffect(() => {
    if (initialVisibility) {
      setCurrentVisibility(initialVisibility);
      setSelectedVisibility(initialVisibility);
    }
  }, [initialVisibility]);

  useEffect(() => {
    if (actionData?.ok && actionData.note?.visibility) {
      setCurrentVisibility(actionData.note.visibility);
      setSelectedVisibility(actionData.note.visibility);
      setAcknowledgeChecked(false);
    }
  }, [actionData]);

  const cleanBaseUrl = publicBaseUrl.replace(/\/$/, "");
  const publicUrl = `${cleanBaseUrl}/n/${noteId}`;

  const hasPii = (piiFlags && piiFlags.length > 0) || actionData?.code === "pii_unacknowledged";
  const showPublicLink = currentVisibility === "unlisted" || currentVisibility === "public";
  const isPiiUnacknowledged = actionData?.code === "pii_unacknowledged";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const options = [
    {
      value: "private",
      label: "Private",
      description: "Only you can view this note.",
    },
    {
      value: "unlisted",
      label: "Unlisted",
      description: "Anyone with the link can view. Excluded from public feed and search engines.",
    },
    {
      value: "public",
      label: "Public",
      description: "Visible to everyone on the public feed and indexed by search engines.",
    },
  ];

  return (
    <div className="rounded-2xl border border-[#242430] bg-[#14141a] p-6 shadow-xs space-y-6 text-zinc-200">
      <div className="flex items-center justify-between border-b border-[#22222c] pb-4">
        <div>
          <h2 className="text-base font-semibold text-white">Visibility & Sharing</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Control who can access and view this note.</p>
        </div>
        <div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
              currentVisibility === "public"
                ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/50"
                : currentVisibility === "unlisted"
                ? "bg-amber-950/50 text-amber-300 border-amber-800/50"
                : "bg-[#1f1f2a] text-zinc-300 border-[#2f2f40]"
            }`}
          >
            {currentVisibility.charAt(0).toUpperCase() + currentVisibility.slice(1)}
          </span>
        </div>
      </div>

      {showPublicLink && (
        <div className="rounded-xl border border-indigo-900/40 bg-[#161526] p-4 space-y-2">
          <span className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider">
            Public link
          </span>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={publicUrl}
              className="w-full rounded-lg border border-[#2f2f42] bg-[#101016] px-3 py-1.5 text-xs text-zinc-200 shadow-xs focus:outline-hidden"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded-lg border border-[#37374e] bg-[#1f1f2e] px-3 py-1.5 text-xs font-medium text-indigo-300 hover:text-white hover:bg-[#27273a] transition-colors cursor-pointer"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-[#2d2d3c] bg-[#181822] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-[#20202c] transition-colors"
              >
                Open ↗
              </a>
            </div>
          </div>
        </div>
      )}

      <fetcher.Form method="post" className="space-y-5">
        <input type="hidden" name="intent" value="visibility" />

        <div className="space-y-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${
                selectedVisibility === option.value
                  ? "border-indigo-500/80 bg-[#1a1926]"
                  : "border-[#22222d] hover:border-[#2f2f3e] bg-[#121217]"
              }`}
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={selectedVisibility === option.value}
                onChange={() => setSelectedVisibility(option.value)}
                className="mt-0.5 h-4 w-4 text-indigo-600 border-zinc-700 bg-[#1e1e28] focus:ring-0 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="block text-sm font-medium text-zinc-100">{option.label}</span>
                <span className="block text-xs text-zinc-400">{option.description}</span>
              </div>
            </label>
          ))}
        </div>

        {/* PII Alert Panel */}
        {hasPii && (
          <div
            data-testid="pii-panel"
            className={`rounded-xl border p-4 space-y-3 ${
              isPiiUnacknowledged
                ? "border-red-900/60 bg-red-950/40 text-red-200"
                : "border-amber-900/60 bg-amber-950/30 text-amber-200"
            }`}
          >
            <div className="space-y-1">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <span>⚠</span>
                <span>Potential sensitive information detected</span>
              </h3>
              <p className="text-xs leading-relaxed opacity-90">
                The scanner detected data that may be sensitive or confidential. If you publish or
                share this note, ensure no real credentials or personal identifiers are exposed.
              </p>
            </div>

            {piiFlags && piiFlags.length > 0 && (
              <ul className="list-disc list-inside text-xs space-y-1 pt-1 font-medium">
                {piiFlags.map((flag) => (
                  <li key={flag}>{formatPiiFlag(flag)}</li>
                ))}
              </ul>
            )}

            {isPiiUnacknowledged && (
              <p className="text-xs font-semibold text-red-300 bg-red-900/40 p-2 rounded-lg border border-red-800/50">
                Publishing refused: You must acknowledge the detected sensitive data before
                publishing.
              </p>
            )}

            <div className="pt-2 border-t border-current/15">
              <label className="flex items-start gap-2.5 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  name="acknowledge_pii"
                  value="true"
                  checked={acknowledgeChecked}
                  onChange={(e) => setAcknowledgeChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-[#1e1e28] text-indigo-600 focus:ring-0"
                />
                <span className="leading-tight">
                  I have reviewed this and want to publish it anyway
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isSubmitting ? "Updating..." : "Save visibility"}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
