import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router";

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rawReturnTo = searchParams.get("returnTo") || "/app";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/app";

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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Sign in to AI Notes</h1>
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full rounded-md bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}
