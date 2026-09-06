import { Link, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { validateAuth } from "~/services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await validateAuth(request);
  if (auth.isAuthenticated) {
    return redirect("/app");
  }
  return null;
}

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-white">
      <div className="h-10" />
      <main className="flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">AI Notes</h1>
          <p className="text-lg text-gray-600">
            Save useful AI conversations into one private, searchable library.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/login"
              className="inline-block rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/feed"
              className="inline-block rounded-md border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Public Feed
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-500">
        <div className="flex justify-center space-x-6">
          <Link to="/feed" className="hover:text-gray-900 transition-colors">Public Feed</Link>
          <Link to="/terms" className="hover:text-gray-900 transition-colors">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
