import { useState } from "react";
import { useSearchParams, useNavigate, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { validateAuth } from "~/services/auth.server";

export function sanitizeReturnTo(rawReturnTo: string | null | undefined): string {
  if (!rawReturnTo) return "/app";
  return rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
    ? rawReturnTo
    : "/app";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await validateAuth(request);
  if (auth.isAuthenticated) {
    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
    return redirect(returnTo);
  }
  return null;
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
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#0e0e11] text-[#f4f4f5]">
      <div className="w-full max-w-sm space-y-6 text-center rounded-2xl bg-[#14141a] p-8 border border-[#242430] shadow-xl">
        <div>
          <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 flex items-center justify-center mx-auto text-lg mb-3">
            ✦
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sign in to AI Notes</h1>
          <p className="mt-1 text-xs text-zinc-400">Your private library for AI conversations</p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-950/50 p-3 text-xs text-red-300 border border-red-800/50 text-left">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading || emailLoading}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 transition-colors flex items-center justify-center space-x-2 cursor-pointer"
        >
          <span>{loading ? "Signing in..." : "Continue with Google"}</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-[#252532] w-full" />
          <span className="bg-[#14141a] px-2 text-xs text-zinc-500 uppercase tracking-wider relative">or</span>
        </div>

        {emailSent ? (
          <div className="rounded-xl bg-emerald-950/40 p-4 border border-emerald-800/50 text-xs text-emerald-300 text-left space-y-2">
            <p className="font-semibold text-sm">Check your inbox!</p>
            <p className="text-zinc-300">
              We emailed a sign-in link to <strong>{email}</strong>. Click the link to complete your sign in.
            </p>
            <button
              type="button"
              onClick={() => setEmailSent(false)}
              className="text-xs text-emerald-400 underline hover:text-emerald-300 pt-1 cursor-pointer"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleEmailSignIn} className="space-y-3 text-left">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-zinc-400 mb-1">
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
                className="w-full rounded-xl border border-[#272736] bg-[#1a1a24] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading || emailLoading || !email.trim()}
              className="w-full rounded-xl border border-[#2c2c3c] bg-[#1a1a24] px-4 py-2 text-xs font-medium text-zinc-200 shadow-xs hover:bg-[#222230] hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              {emailLoading ? "Sending link..." : "Email me a sign-in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
