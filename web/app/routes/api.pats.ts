import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";
import { createPAT, listPATs, revokePAT } from "~/services/pats-api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  const result = await listPATs(request);
  if (!result.ok) {
    return Response.json({ code: result.code }, { status: 400 });
  }
  return Response.json(result.data);
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request);

  if (request.method === "POST") {
    let label = "";
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await request.json().catch(() => ({}));
      label = String(json.label ?? "").trim();
    } else {
      const formData = await request.formData();
      label = String(formData.get("label") ?? "").trim();
    }

    if (!label) {
      return Response.json(
        { code: "invalid_argument", error: "Label is required" },
        { status: 400 }
      );
    }

    const result = await createPAT(request, label);
    if (!result.ok) {
      return Response.json({ code: result.code }, { status: 400 });
    }
    return Response.json(result.data, { status: 201 });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    let id = url.searchParams.get("id")?.trim();

    if (!id) {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await request.json().catch(() => ({}));
        id = String(json.id ?? "").trim();
      } else {
        const formData = await request.formData().catch(() => null);
        id = String(formData?.get("id") ?? "").trim();
      }
    }

    if (!id) {
      return Response.json(
        { code: "invalid_argument", error: "Token ID is required" },
        { status: 400 }
      );
    }

    const result = await revokePAT(request, id);
    if (!result.ok) {
      return Response.json({ code: result.code }, { status: 400 });
    }
    return new Response(null, { status: 204 });
  }

  return Response.json({ code: "method_not_allowed" }, { status: 405 });
}
