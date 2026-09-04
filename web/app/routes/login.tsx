import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router";

export function sanitizeReturnTo(rawReturnTo: string | null | undefined): string {
  if (!rawReturnTo) return "/app";
  return rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
    ? rawReturnTo
    : "/app";
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      const { auth } = await import("~/services/firebase.client");
      const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
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
      console.error("Sign-in failed", err);
      setError(err?.message || "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setEmailLoading(true);
      setError(null);
      const { auth } = await import("~/services/firebase.client");
      const { sendSignInLinkToEmail } = await import("firebase/auth");

      const actionCodeSettings = {
        url: `${window.location.origin}/login/email?returnTo=${encodeURIComponent(returnTo)}`,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, email.trim(), actionCodeSettings);
      window.localStorage.setItem("emailForSignIn", email.trim());
      setEmailSent(true);
    } catch (err: any) {
      console.error("Failed to send email link", err);
      setError(err?.message || "Failed to send email link. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-sm space-y-6 text-center rounded-xl bg-white p-8 border border-gray-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Sign in to AI Notes</h1>
          <p className="mt-1 text-xs text-gray-500">Your private library for AI conversations</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200 text-left">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading || emailLoading}
          className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
        >
          <span>{loading ? "Signing in..." : "Continue with Google"}</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-gray-200 w-full" />
          <span className="bg-white px-2 text-xs text-gray-400 uppercase tracking-wider relative">or</span>
        </div>

        {emailSent ? (
          <div className="rounded-lg bg-green-50 p-4 border border-green-200 text-sm text-green-800 text-left space-y-2">
            <p className="font-semibold">Check your inbox!</p>
            <p className="text-xs text-green-700">
              We emailed a sign-in link to <strong>{email}</strong>. Click the link to complete your sign in.
            </p>
            <button
              type="button"
              onClick={() => setEmailSent(false)}
              className="text-xs text-green-800 underline hover:text-green-900 pt-1"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleEmailSignIn} className="space-y-3 text-left">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                required
                disabled={loading || emailLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-gray-900 focus:outline-hidden focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <button
              type="submit"
              disabled={loading || emailLoading || !email.trim()}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {emailLoading ? "Sending link..." : "Email me a sign-in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
