import type { ActionFunctionArgs } from "react-router";
import { validateToken } from "~/services/auth-api.server";
import { authenticationStorage } from "~/services/session.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Missing ID token", { status: 401 });
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    return new Response("Missing ID token", { status: 401 });
  }

  try {
    const result = await validateToken(idToken);
    if (!result.ok) {
      return new Response("Invalid token", { status: 401 });
    }

    const session = await authenticationStorage.getSession(request.headers.get("Cookie"));
    session.set("auth_token", idToken);

    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": await authenticationStorage.commitSession(session),
        },
      }
    );
  } catch (err) {
    console.error("Token validation failed", err);
    return new Response("Auth service unavailable", { status: 503 });
  }
}
