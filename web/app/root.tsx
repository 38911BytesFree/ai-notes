import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
} from "react-router";
import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import { AuthProvider } from "~/components/AuthProvider";
import { authenticationStorage } from "~/services/session.server";
import stylesheet from "~/app.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await authenticationStorage.getSession(request.headers.get("Cookie"));
  const isAuthenticated = Boolean(session.get("auth_token"));
  return { isAuthenticated };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-full flex flex-col font-sans antialiased text-gray-900 bg-white" suppressHydrationWarning>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { isAuthenticated } = useLoaderData<typeof loader>();

  return (
    <AuthProvider initialAuthenticated={isAuthenticated}>
      <Outlet />
    </AuthProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let title = "Something went wrong";
  let message = "An unexpected error occurred. Please try again.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Page not found";
      message = "We couldn't find what you were looking for.";
    } else {
      title = `${error.status} ${error.statusText}`;
      if (typeof error.data === "string" && error.data) message = error.data;
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
      <p className="mt-2 text-gray-600">{message}</p>
    </main>
  );
}
