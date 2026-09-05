import compression from "compression";
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { mcpAuthRouter } from "@modelcontextprotocol/server-legacy/auth";
import { verifier, getMcpResourceMetadataUrl } from "./mcp/verifier";
import { buildServer } from "./mcp/server";
import { oauthProvider } from "./oauth/provider";

const app = express();
app.set("trust proxy", 1);
app.use(compression());
app.disable("x-powered-by");

const PORT = Number(process.env.PORT || 3000);

// Canonical host 301-redirect: redirect any request whose Host is not
// PUBLIC_BASE_URL's host to the same path on PUBLIC_BASE_URL.
// Skip when PUBLIC_BASE_URL is a localhost origin so dev and tests are unaffected.
const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
if (publicBaseUrl) {
  try {
    const parsedBase = new URL(publicBaseUrl);
    const targetHost = parsedBase.host;
    const isLocalhost =
      targetHost.startsWith("localhost") ||
      targetHost.startsWith("127.0.0.1") ||
      targetHost.startsWith("[::1]");

    if (!isLocalhost) {
      app.use((req: Request, res: Response, next: NextFunction) => {
        const hostHeader = req.headers.host;
        if (hostHeader && hostHeader !== targetHost) {
          const targetUrl = new URL(req.originalUrl || req.url, publicBaseUrl);
          return res.redirect(301, targetUrl.toString());
        }
        next();
      });
    }
  } catch (err) {
    console.warn("Failed to parse PUBLIC_BASE_URL for host redirect:", err);
  }
}

// Health check registered directly on Express before React Router handler
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// =============================================================================
// MCP ENDPOINT (/mcp)
// =============================================================================
app.use("/mcp", express.json());
app.use(
  "/mcp",
  cors({
    exposedHeaders: ["Mcp-Session-Id", "Mcp-Protocol-Version"],
  })
);

const bearerAuthMiddleware = requireBearerAuth({
  verifier,
  resourceMetadataUrl: getMcpResourceMetadataUrl(),
});

const allowedHosts = process.env.MCP_ALLOWED_HOSTS
  ? process.env.MCP_ALLOWED_HOSTS.split(",").map((h) => h.trim())
  : undefined;

const mcpHandler = createMcpHandler(buildServer, {
  responseMode: "json",
  ...(allowedHosts ? { allowedHosts } : {}),
});

const mcpNodeHandler = toNodeHandler(mcpHandler);

app.use("/mcp", bearerAuthMiddleware, (req: Request, res: Response) => {
  mcpNodeHandler(req, res, req.body);
});

// =============================================================================
// OAUTH AUTHORIZATION SERVER
// =============================================================================
const issuerBase = process.env.PUBLIC_BASE_URL?.trim() || `http://localhost:${PORT}`;
const issuerUrl = new URL(issuerBase);
const resourceServerUrl = new URL("/mcp", issuerUrl);

app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl,
    resourceServerUrl,
    scopesSupported: ["notes:read", "notes:write"],
    resourceName: "AI Notes",
    clientRegistrationOptions: {
      rateLimit: {
        validate: false,
      },
    },
    authorizationOptions: {
      rateLimit: {
        validate: false,
      },
    },
    tokenOptions: {
      rateLimit: {
        validate: false,
      },
    },
  })
);


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
