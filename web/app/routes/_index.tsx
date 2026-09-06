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
    <div className="flex min-h-screen flex-col justify-between bg-[#0e0e11] text-[#f4f4f5]">
      <div className="h-10" />
      <main className="flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 flex items-center justify-center mx-auto text-xl">
            ✦
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">AI Notes</h1>
          <p className="text-lg text-zinc-400">
            Save useful AI conversations into one private, searchable library.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              to="/login"
              className="inline-block rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/feed"
              className="inline-block rounded-xl border border-[#2b2b38] bg-[#161620] px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-[#20202c] hover:text-white transition-colors"
            >
              Public Feed
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#222228] py-6 text-center text-xs text-zinc-500">
        <div className="flex justify-center space-x-6">
          <Link to="/feed" className="hover:text-zinc-300 transition-colors">Public Feed</Link>
          <Link to="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
