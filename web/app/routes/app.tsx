import { useLoaderData, useNavigate } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { user } = await requireAuth(request);
  return { email: user?.email || "" };
}

export default function AppShell() {
  const { email } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      const { auth } = await import("~/services/firebase.client");
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    } catch (err) {
      console.warn("Client signOut failed", err);
    }

    await fetch("/api/auth/logout", {
      method: "POST",
    });

    navigate("/");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">AI Notes</h1>
        <p className="text-gray-700">Signed in as {email}</p>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
