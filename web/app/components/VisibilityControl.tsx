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
      // Fallback
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
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-6">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Visibility & Sharing</h2>
          <p className="text-xs text-gray-500 mt-0.5">Control who can access and view this note.</p>
        </div>
        <div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
              currentVisibility === "public"
                ? "bg-green-50 text-green-700 border-green-200"
                : currentVisibility === "unlisted"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-gray-100 text-gray-700 border-gray-200"
            }`}
          >
            {currentVisibility.charAt(0).toUpperCase() + currentVisibility.slice(1)}
          </span>
        </div>
      </div>

      {showPublicLink && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 space-y-2">
          <span className="block text-xs font-semibold text-blue-900 uppercase tracking-wider">
            Public link
          </span>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={publicUrl}
              className="w-full rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs text-gray-800 shadow-xs focus:outline-hidden"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 shadow-xs hover:bg-blue-50 transition-colors"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors"
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
              className={`flex items-start gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors ${
                selectedVisibility === option.value
                  ? "border-gray-900 bg-gray-50/50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={selectedVisibility === option.value}
                onChange={() => setSelectedVisibility(option.value)}
                className="mt-0.5 h-4 w-4 text-gray-900 border-gray-300 focus:ring-gray-900"
              />
              <div className="space-y-0.5">
                <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                <span className="block text-xs text-gray-500">{option.description}</span>
              </div>
            </label>
          ))}
        </div>

        {/* PII Alert Panel */}
        {hasPii && (
          <div
            data-testid="pii-panel"
            className={`rounded-lg border p-4 space-y-3 ${
              isPiiUnacknowledged
                ? "border-red-300 bg-red-50 text-red-900"
                : "border-amber-300 bg-amber-50 text-amber-900"
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
              <p className="text-xs font-semibold text-red-700 bg-red-100/70 p-2 rounded-md">
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
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
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
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Updating..." : "Save visibility"}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
