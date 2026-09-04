import { Link } from "react-router";

export default function Landing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">AI Notes</h1>
        <p className="text-lg text-gray-600">
          Save useful AI conversations into one private, searchable library.
        </p>
        <div>
          <Link
            to="/login"
            className="inline-block rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-800"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
