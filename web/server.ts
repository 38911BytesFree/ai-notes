import compression from "compression";
import express from "express";

const app = express();
app.use(compression());
app.disable("x-powered-by");

const PORT = Number(process.env.PORT || 3000);

// Health check registered directly on Express before React Router handler
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// =============================================================================
// PHASE 2 MOUNT POINT: /mcp, /oauth/*, /.well-known/*
// In Phase 2, MCP streamable HTTP transport and OAuth routes will be mounted here.
// =============================================================================

if (process.env.NODE_ENV === "production") {
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" })
  );
  app.use(express.static("build/client", { maxAge: "1h" }));

  const { createRequestHandler } = await import("@react-router/express");
  let build;
  try {
    // When running from build/server/index.js
    // @ts-expect-error - built artifact in production
    build = await import("./app.js");
  } catch {
    // When running from web/ directory
    // @ts-expect-error - built artifact in production
    build = await import("./build/server/app.js");
  }
  app.all("*", createRequestHandler({ build: build as any }));
} else {
  const { createRequestHandler } = await import("@react-router/express");
  const vite = await import("vite");
  const viteDevServer = await vite.createServer({
    server: { middlewareMode: true },
  });
  app.use(viteDevServer.middlewares);
  app.use(
    createRequestHandler({
      build: () =>
        viteDevServer.ssrLoadModule("virtual:react-router/server-build") as any,
    })
  );
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
