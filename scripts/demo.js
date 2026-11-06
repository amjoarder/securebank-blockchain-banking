/**
 * One-command demonstration: blockchain → deploy → seed → frontend.
 * Usage: npm run demo        — press Ctrl+C to stop everything this command started.
 *
 * Only processes started here are stopped on exit; nothing else on the machine is touched.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  ROOT,
  NETWORK,
  HARDHAT_CLI,
  VITE_CLI,
  checkDemoPort,
  isPortFree,
  rpcCall,
  waitForRpc,
  spawnNodeCli,
  runHardhat,
  stopOwnProcess,
} = require("./lib/runtime");

const children = [];

function buildFrontend() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [VITE_CLI, "build", "--logLevel", "warn"], { cwd: path.join(ROOT, "frontend"), stdio: "ignore", windowsHide: true });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("Frontend build failed. Run `a3 build` to see the error."))));
  });
}

async function isDeployed() {
  const file = path.join(ROOT, "deployments", "a3local.json");
  if (!fs.existsSync(file)) return false;
  const { address } = JSON.parse(fs.readFileSync(file, "utf8"));
  return (await rpcCall("eth_getCode", [address, "latest"])) !== "0x";
}

function shutdown(code = 0) {
  for (const child of children) stopOwnProcess(child.pid);
  process.exit(code);
}

async function main() {
  const chainState = await checkDemoPort(NETWORK.rpcPort, "Blockchain");
  if (!(await isPortFree(NETWORK.frontendPort, "127.0.0.1"))) {
    throw new Error(
      `Frontend port ${NETWORK.frontendPort} is busy (is \`npm run demo\` already running?). Nothing was stopped.`
    );
  }

  if (chainState === "ours") {
    console.log(`[demo] Reusing the Assignment 3 blockchain already running on port ${NETWORK.rpcPort}.`);
  } else {
    console.log(`[demo] Starting blockchain (chainId ${NETWORK.chainId}, port ${NETWORK.rpcPort})…`);
    const node = spawnNodeCli("blockchain", HARDHAT_CLI, ["node", "--hostname", NETWORK.rpcHost, "--port", String(NETWORK.rpcPort)], {
      stdio: "ignore",
    });
    children.push(node);
    await waitForRpc(NETWORK.rpcPort);
  }

  if (await isDeployed()) {
    console.log("[demo] SecureBank is already deployed on this chain.");
  } else {
    console.log("[demo] Deploying SecureBank…");
    await runHardhat(["run", "scripts/deploy.js", "--network", "a3local"]);
    console.log("[demo] Seeding demo customers…");
    await runHardhat(["run", "scripts/seed.js", "--network", "a3local"]);
  }

  console.log("[demo] Building frontend (production build)…");
  await buildFrontend();
  const web = spawnNodeCli("frontend", path.join(ROOT, "scripts", "serve.js"), []);
  children.push(web);
  web.on("exit", (code) => shutdown(code ?? 0));

  console.log("\n  SecureBank demo is running.");
  console.log(`  Open  http://localhost:${NETWORK.frontendPort}`);
  console.log("  Press Ctrl+C here to stop the blockchain and frontend started by this command.\n");
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((err) => {
  console.error(`[demo] ${err.message}`);
  shutdown(1);
});
