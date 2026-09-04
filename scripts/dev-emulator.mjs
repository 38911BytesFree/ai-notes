#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FIRESTORE_PORT = 8088;
const AUTH_PORT = 9099;
const BACKEND_PORT = 8000;
const WEB_PORT = 5173;

const FIRESTORE = `127.0.0.1:${FIRESTORE_PORT}`;
const AUTH = `127.0.0.1:${AUTH_PORT}`;
const BACKEND = `127.0.0.1:${BACKEND_PORT}`;
const WEB = `127.0.0.1:${WEB_PORT}`;

function envFile() {
  const out = {};
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = envFile();
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || "";

if (!PROJECT_ID) {
  console.error(
    "GOOGLE_CLOUD_PROJECT is not set and .env has none.\n" +
      "The emulator project id must equal GOOGLE_CLOUD_PROJECT or the Admin SDK\n" +
      "rejects every token with an invalid 'aud' claim."
  );
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function run(name, command, args, extraEnv = {}, cwd = ROOT) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  const tag = `[${name}]`;
  const pipe = (stream, sink) => {
    stream.setEncoding("utf8");
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) sink(`${tag} ${l}`);
    });
  };
  pipe(child.stdout, (l) => console.log(l));
  pipe(child.stderr, (l) => console.error(l));
  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.error(`${tag} exited with ${code} — shutting down`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      if (process.platform === "win32" && c.pid) {
        spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        c.kill();
      }
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function tryConnect(host, port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.setTimeout(2000, () => done(false));
  });
}

function hostsFor(host) {
  return host === "localhost" || host === "127.0.0.1" ? ["127.0.0.1", "::1"] : [host];
}

async function portInUse(hostPort) {
  const [host, portStr] = hostPort.split(":");
  for (const h of hostsFor(host)) {
    if (await tryConnect(h, Number(portStr))) return true;
  }
  return false;
}

function waitForPort(hostPort, timeoutMs = 90_000) {
  const [host, portStr] = hostPort.split(":");
  const port = Number(portStr);
  const hosts = hostsFor(host);
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      for (const h of hosts) {
        if (await tryConnect(h, port)) return resolve();
      }
      if (Date.now() > deadline) reject(new Error(`timed out waiting for ${hostPort}`));
      else setTimeout(attempt, 500);
    };
    attempt();
  });
}

async function requirePortsFree() {
  const wanted = [
    [FIRESTORE, "the Firestore emulator"],
    [AUTH, "the Auth emulator"],
    [BACKEND, "the Go API"],
    [WEB, "the web dev server"],
  ];
  const busy = [];
  for (const [hostPort, what] of wanted) {
    if (await portInUse(hostPort)) busy.push(`    ${hostPort}  (wanted for ${what})`);
  }
  if (busy.length === 0) return;
  console.error(
    [
      "",
      "  Refusing to start — these ports are already in use:",
      "",
      ...busy,
      "",
      "  Please terminate any stale processes before running dev.",
      "",
    ].join("\n")
  );
  process.exit(1);
}

await requirePortsFree();

console.log(`Starting the emulator stack for project ${PROJECT_ID}…`);

// 1. Start Firebase Emulators (Auth & Firestore)
run("emu", "pnpm", [
  "exec",
  "firebase",
  "emulators:start",
  "--project",
  PROJECT_ID,
  "--only",
  "auth,firestore",
]);

await waitForPort(FIRESTORE);
await waitForPort(AUTH);
console.log("Firebase emulators are up.");

// 2. Start Go API
run(
  "api",
  "go",
  ["run", "./cmd/api"],
  {
    FIRESTORE_EMULATOR_HOST: FIRESTORE,
    FIREBASE_AUTH_EMULATOR_HOST: AUTH,
    GOOGLE_CLOUD_PROJECT: PROJECT_ID,
    BIND_ADDRESS: BACKEND,
  },
  path.join(ROOT, "api")
);

await waitForPort(BACKEND);
console.log("Go API is up.");

// 3. Start Web app
run(
  "web",
  "pnpm",
  ["exec", "tsx", "server.ts"],
  {
    PORT: String(WEB_PORT),
    BACKEND_URL: `http://${BACKEND}`,
    VITE_FIREBASE_AUTH_EMULATOR_HOST: AUTH,
  },
  path.join(ROOT, "web")
);

await waitForPort(WEB);

console.log(
  [
    "",
    "  Stack ready:",
    `    web       http://${WEB}`,
    `    api       http://${BACKEND}`,
    `    auth      http://${AUTH}`,
    `    firestore http://${FIRESTORE}`,
    "",
    "  Press Ctrl-C to stop.",
    "",
  ].join("\n")
);
