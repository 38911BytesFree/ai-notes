import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }
  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }
  const projectId =
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT;
  adminApp = initializeApp(projectId ? { projectId } : {});
  return adminApp;
}

interface CachedToken {
  idToken: string;
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedToken>();

/**
 * Exchanges a Firebase user UID for a valid Firebase ID token.
 * Caches the resulting ID token per UID with an expiration of (expiresIn - 5 minutes).
 */
export async function uidToIdToken(uid: string): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(uid);
  if (cached && cached.expiresAtMs > now) {
    return cached.idToken;
  }

  const auth = getAuth(getAdminApp());
  const customToken = await auth.createCustomToken(uid);

  const apiKey = process.env.VITE_FIREBASE_API_KEY || "";
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

  const url = emulatorHost
    ? `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`
    : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: customToken,
      returnSecureToken: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to exchange custom token for user ${uid}: ${res.status} ${errText}`
    );
  }

  const data = (await res.json()) as { idToken: string; expiresIn?: string | number };
  const expiresInSec = Number(data.expiresIn) || 3600;
  // Cache with expiresIn minus 5 minutes (300 seconds)
  const validForMs = Math.max(0, (expiresInSec - 300) * 1000);

  tokenCache.set(uid, {
    idToken: data.idToken,
    expiresAtMs: now + validForMs,
  });

  return data.idToken;
}

/**
 * Clears the in-memory token cache. Intended for testing.
 */
export function _clearIdentityCacheForTesting(): void {
  tokenCache.clear();
}
