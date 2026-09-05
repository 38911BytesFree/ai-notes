import { Form, redirect, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";
import {
  parsePendingCookie,
  clearPendingCookieHeader,
} from "../../oauth/pending";
import { generateAuthorizationCode } from "../../oauth/tokens";
import {
  getClient,
  storeAuthorizationCode,
} from "~/services/oauth-api.server";

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "notes:read": "View and search your saved notes and transcripts",
  "notes:write": "Create and save new notes directly into your library",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { user } = await requireAuth(request);
  const pending = await parsePendingCookie(request.headers.get("Cookie"));

  if (!pending) {
    throw new Response(
      "No valid authorization request found or the request has expired (10 minute limit). Please restart the sign-in flow from your application.",
      { status: 400 }
    );
  }

  const client = await getClient(pending.client_id).catch(() => null);
  const clientName = client?.client_name || pending.client_id;

  return {
    user,
    clientName,
    scopes: pending.scopes,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { user } = await requireAuth(request);
  const pending = await parsePendingCookie(request.headers.get("Cookie"));

  if (!pending) {
    throw new Response(
      "Authorization request has expired. Please restart the sign-in flow from your application.",
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const decision = formData.get("decision");
  const clearCookie = await clearPendingCookieHeader();

  if (decision === "deny") {
    const redirectUrl = new URL(pending.redirect_uri);
    redirectUrl.searchParams.set("error", "access_denied");
    if (pending.state) {
      redirectUrl.searchParams.set("state", pending.state);
    }
    return redirect(redirectUrl.toString(), {
      headers: {
        "Set-Cookie": clearCookie,
      },
    });
  }

  if (decision === "approve") {
    const { token: code, hash: codeHash } = generateAuthorizationCode();
    // 10 minutes expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await storeAuthorizationCode({
      code_hash: codeHash,
      client_id: pending.client_id,
      uid: user.uid,
      scopes: pending.scopes,
      code_challenge: pending.code_challenge,
      code_challenge_method: "S256",
      redirect_uri: pending.redirect_uri,
      resource: pending.resource,
      expires_at: expiresAt,
    });

    const publicBase =
      process.env.PUBLIC_BASE_URL ||
      `${new URL(request.url).protocol}//${new URL(request.url).host}`;

    const redirectUrl = new URL(pending.redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (pending.state) {
      redirectUrl.searchParams.set("state", pending.state);
    }
    redirectUrl.searchParams.set("iss", publicBase);

    return redirect(redirectUrl.toString(), {
      headers: {
        "Set-Cookie": clearCookie,
      },
    });
  }

  return Response.json({ error: "Invalid decision" }, { status: 400 });
}

export default function OAuthConsent() {
  const { user, clientName, scopes } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          AI Notes
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Authorize Application Access
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm rounded-xl border border-gray-200 sm:px-10 space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900 text-center">
              Connect to {clientName}
            </h2>
            <p className="text-xs text-gray-500 text-center">
              Signed in as <span className="font-medium text-gray-700">{user.email}</span>
            </p>
          </div>

          <div className="border-t border-b border-gray-100 py-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Requested Permissions:
            </p>
            <ul className="space-y-2 text-sm text-gray-700">
              {scopes.map((scope) => (
                <li key={scope} className="flex items-start space-x-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>{SCOPE_DESCRIPTIONS[scope] || scope}</span>
                </li>
              ))}
            </ul>
          </div>

          <Form method="post" className="flex space-x-3">
            <button
              type="submit"
              name="decision"
              value="deny"
              className="flex-1 rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              name="decision"
              value="approve"
              className="flex-1 rounded-md bg-blue-600 py-2 px-4 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Authorize
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
