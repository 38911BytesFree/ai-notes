import { createCookieSessionStorage } from "react-router";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET environment variable is required in production.");
  }
  console.warn("SESSION_SECRET is not set; using development fallback secret.");
}

const secret = sessionSecret || "dev-session-secret-change-in-production";

export const authenticationStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    sameSite: "lax",
    path: "/",
    httpOnly: true,
    secrets: [secret],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  },
});

export const { getSession, commitSession, destroySession } = authenticationStorage;
