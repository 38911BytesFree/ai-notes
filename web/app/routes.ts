import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("app", "routes/app.tsx"),
  route("api/auth/session", "routes/api.auth.session.ts"),
  route("api/auth/logout", "routes/api.auth.logout.ts"),
  route("api/health", "routes/api.health.ts"),
  route("api/ingest", "routes/api.ingest.ts"),
] satisfies RouteConfig;
