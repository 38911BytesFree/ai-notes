import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
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

export default function App() {
  const { isAuthenticated } = useLoaderData<typeof loader>();

  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-full flex flex-col font-sans antialiased text-gray-900 bg-white">
        <AuthProvider initialAuthenticated={isAuthenticated}>
          <Outlet />
          <ScrollRestoration />
          <Scripts />
        </AuthProvider>
      </body>
    </html>
  );
}
