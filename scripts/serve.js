/**
 * Dependency-free web server for the SecureBank frontend (port 5303).
 *
 *   /rpc              → proxied to the Assignment 3 Hardhat node (same-origin JSON-RPC, no CORS issues)
 *   /runtime/*        → live project data: network config, demo accounts, deployment record, benchmark results
 *   everything else   → the production build in frontend/dist (SPA fallback to index.html)
 *
 * Why not the Vite dev server? The project path contains '#', which breaks Vite's dev server
 * (see docs/DEV_NOTES.md). Production builds are unaffected.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { ROOT, NETWORK, registerPid, unregisterPid } = require("./lib/runtime");

const DIST = path.join(ROOT, "frontend", "dist");
const PERF = path.join(ROOT, "performance-results");

const RUNTIME_FILES = {
  "/runtime/network.json": path.join(ROOT, "config", "network.json"),
  "/runtime/demo-accounts.json": path.join(ROOT, "config", "demo-accounts.json"),
  "/runtime/deployment.json": path.join(ROOT, "deployments", "a3local.json"),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".csv": "text/csv; charset=utf-8",
};

/** Resolve a URL path inside baseDir, refusing any path that escapes it. */
function safeJoin(baseDir, urlPath) {
  const resolved = path.resolve(baseDir, "." + decodeURIComponent(urlPath));
  return resolved === baseDir || resolved.startsWith(baseDir + path.sep) ? resolved : null;
}

function sendFile(res, file, { cache = false } = {}) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": cache ? "public, max-age=31536000, immutable" : "no-store",
    });
    res.end(data);
  });
}

function proxyRpc(req, res) {
  const upstream = http.request(
    { host: NETWORK.rpcHost, port: NETWORK.rpcPort, path: "/", method: "POST", headers: { "content-type": "application/json" } },
    (up) => {
      res.writeHead(up.statusCode, { "content-type": "application/json" });
      up.pipe(res);
    }
  );
  upstream.on("error", () => {
    // JSON-RPC convention: transport succeeded, the error is in the body (the UI shows "node unavailable").
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32099, message: "A3_NODE_UNAVAILABLE" } }));
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  if (pathname === "/rpc" && req.method === "POST") return proxyRpc(req, res);
  if (RUNTIME_FILES[pathname]) return sendFile(res, RUNTIME_FILES[pathname]);
  if (pathname.startsWith("/runtime/perf/")) {
    const file = safeJoin(PERF, pathname.slice("/runtime/perf".length));
    return file ? sendFile(res, file) : res.writeHead(400).end();
  }

  const file = safeJoin(DIST, pathname === "/" ? "/index.html" : pathname);
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return sendFile(res, file, { cache: pathname.startsWith("/assets/") });
  }
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    res.writeHead(503, { "content-type": "text/plain" });
    return res.end("Frontend not built yet. Run: a3 build");
  }
  return sendFile(res, path.join(DIST, "index.html")); // SPA route
});

server.on("error", (err) => {
  console.error(
    err.code === "EADDRINUSE"
      ? `Port ${NETWORK.frontendPort} is already in use by another program. Nothing was stopped.`
      : err.message
  );
  process.exit(1);
});

server.listen(NETWORK.frontendPort, "127.0.0.1", () => {
  registerPid("frontend", process.pid); // lets `npm run stop` find this server even when started on its own
  console.log(`SecureBank frontend: http://localhost:${NETWORK.frontendPort}  (RPC proxied to port ${NETWORK.rpcPort})`);
});
process.on("exit", () => unregisterPid(process.pid));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));
