/**
 * Shared helpers for Assignment 3 process/port management.
 *
 * Safety rules implemented here:
 *  - ports are checked before a server is started; an occupied port is never "freed" by killing its owner
 *  - every process this project starts is recorded in .run/processes.json
 *  - a recorded process is only stopped after confirming its command line points inside this project folder
 */
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const NETWORK = require(path.join(ROOT, "config", "network.json"));
const RUN_DIR = path.join(ROOT, ".run");
const PID_FILE = path.join(RUN_DIR, "processes.json");
const HARDHAT_CLI = path.join(ROOT, "node_modules", "hardhat", "internal", "cli", "bootstrap.js");
const VITE_CLI = path.join(ROOT, "frontend", "node_modules", "vite", "bin", "vite.js");

const rpcUrl = (port = NETWORK.rpcPort) => `http://${NETWORK.rpcHost}:${port}`;

/** Resolves true when nothing is listening on host:port. */
function isPortFree(port, host = NETWORK.rpcHost) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

async function rpcCall(method, params = [], port = NETWORK.rpcPort) {
  const res = await fetch(rpcUrl(port), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** Returns the chainId served on the port, or null when no JSON-RPC node answers. */
async function probeChainId(port = NETWORK.rpcPort) {
  try {
    return Number(await rpcCall("eth_chainId", [], port));
  } catch {
    return null;
  }
}

async function waitForRpc(port, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await probeChainId(port)) === NETWORK.chainId) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Assignment 3 blockchain did not become ready on port ${port} within ${timeoutMs} ms`);
}

// ───────────────────────────── PID registry ─────────────────────────────

function readPids() {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writePids(list) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, JSON.stringify(list, null, 2));
}

function registerPid(name, pid) {
  writePids([...readPids().filter((p) => p.name !== name), { name, pid, startedAt: new Date().toISOString() }]);
}

function unregisterPid(pid) {
  writePids(readPids().filter((p) => p.pid !== pid));
}

/** Command line of a running process, or null if it no longer exists (Windows and POSIX). */
function commandLineOf(pid) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`],
        { encoding: "utf8" }
      );
      return out.trim() || null;
    }
    return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim() || null;
  } catch {
    return null;
  }
}

/** True only when the PID is alive AND its command line references this project's folder. */
function isOwnProcess(pid) {
  const cmd = commandLineOf(pid);
  return Boolean(cmd && cmd.toLowerCase().includes(ROOT.toLowerCase()));
}

/** Stops a process tree that this project started. Refuses to touch anything else. */
function stopOwnProcess(pid) {
  if (!isOwnProcess(pid)) return false;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* already exited */
    }
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already exited */
    }
  }
  return true;
}

// ─────────────────────────── Child processes ────────────────────────────

/** Spawn a Node CLI (Hardhat/Vite) with this project's Node binary; records its PID. */
function spawnNodeCli(name, cliPath, args, { cwd = ROOT, stdio = "inherit", env = {} } = {}) {
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd,
    stdio,
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  registerPid(name, child.pid);
  child.on("exit", () => unregisterPid(child.pid));
  return child;
}

/** Run a Hardhat task to completion (e.g. `run scripts/deploy.js --network a3local`). */
function runHardhat(args, { stdio = "inherit" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HARDHAT_CLI, ...args], { cwd: ROOT, stdio, windowsHide: true });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`hardhat ${args.join(" ")} exited with ${code}`))));
  });
}

/**
 * Ensures the demo port is usable. Returns "free", or "ours" when an Assignment 3 chain already runs there.
 * Throws (without killing anything) when another program owns the port.
 */
async function checkDemoPort(port, label) {
  if (await isPortFree(port)) return "free";
  const chainId = await probeChainId(port);
  if (chainId === NETWORK.chainId) return "ours";
  throw new Error(
    `${label} port ${port} is already used by another program (chainId: ${chainId ?? "not a JSON-RPC node"}).\n` +
      `Nothing was stopped. Change the port in config/network.json, or close that program yourself.`
  );
}

module.exports = {
  ROOT,
  NETWORK,
  HARDHAT_CLI,
  VITE_CLI,
  rpcUrl,
  isPortFree,
  rpcCall,
  probeChainId,
  waitForRpc,
  readPids,
  registerPid,
  unregisterPid,
  isOwnProcess,
  stopOwnProcess,
  spawnNodeCli,
  runHardhat,
  checkDemoPort,
};
