import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("login/email", "routes/login.email.tsx"),
  route("app", "routes/app.tsx"),
  route("app/notes/:id", "routes/app.notes.$id.tsx"),
  route("app/settings", "routes/app.settings.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("api/auth/session", "routes/api.auth.session.ts"),
  route("api/auth/logout", "routes/api.auth.logout.ts"),
  route("api/health", "routes/api.health.ts"),
  route("api/ingest", "routes/api.ingest.ts"),
  route("api/notes/:id/transcript", "routes/api.notes.$id.transcript.ts"),
  route("api/me/export", "routes/api.me.export.ts"),
] satisfies RouteConfig;
