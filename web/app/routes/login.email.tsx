import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { sanitizeReturnTo } from "./login";

export default function LoginEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "need_email" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));

  const completeSignIn = async (emailToUse: string) => {
    try {
      setLoading(true);
      const { auth } = await import("~/services/firebase.client");
      const { isSignInWithEmailLink, signInWithEmailLink } = await import("firebase/auth");

      if (!isSignInWithEmailLink(auth, window.location.href)) {
        setStatus("error");
        setErrorMessage("This sign-in link is invalid or has already been used.");
        setLoading(false);
        return;
      }

      const result = await signInWithEmailLink(auth, emailToUse, window.location.href);
      window.localStorage.removeItem("emailForSignIn");
      const idToken = await result.user.getIdToken();

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to establish session");
      }

      navigate(returnTo);
    } catch (err: any) {
      console.error("Email sign-in completion failed", err);
      setStatus("error");
      setErrorMessage(err?.message || "Failed to complete sign-in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("emailForSignIn");
    if (savedEmail) {
      completeSignIn(savedEmail);
    } else {
      setStatus("need_email");
    }
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualEmail.trim()) {
      completeSignIn(manualEmail.trim());
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-sm space-y-6 text-center rounded-xl bg-white p-8 border border-gray-200 shadow-xs">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Sign in with Email Link</h1>

        {status === "verifying" && (
          <div className="py-6 space-y-3">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent align-[-0.125em]" />
            <p className="text-sm text-gray-600">Verifying sign-in link...</p>
          </div>
        )}

        {status === "need_email" && (
          <form onSubmit={handleManualSubmit} className="space-y-4 text-left">
            <p className="text-sm text-gray-600">
              Please confirm your email address to complete sign-in on this device:
            </p>
            <div>
              <label htmlFor="confirm-email" className="block text-xs font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                id="confirm-email"
                type="email"
                required
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !manualEmail.trim()}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Complete Sign In"}
            </button>
          </form>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {errorMessage}
            </div>
            <Link
              to="/login"
              className="inline-block text-sm font-medium text-gray-900 underline hover:text-gray-700"
            >
              Back to sign-in page
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
