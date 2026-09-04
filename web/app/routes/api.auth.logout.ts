import { redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { authenticationStorage } from "~/services/session.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const session = await authenticationStorage.getSession(request.headers.get("Cookie"));

  return redirect("/", {
    headers: {
      "Set-Cookie": await authenticationStorage.destroySession(session),
    },
  });
}
