/**
 * Prints the state of the Assignment 3 environment (ports, chain, deployment).
 * Usage: npm run status
 */
const fs = require("fs");
const path = require("path");
const { ROOT, NETWORK, isPortFree, probeChainId, rpcCall, readPids, isOwnProcess } = require("./lib/runtime");

async function main() {
  const chainId = await probeChainId(NETWORK.rpcPort);
  console.log(`Blockchain  port ${NETWORK.rpcPort}: ${
    chainId === NETWORK.chainId ? "running (Assignment 3)" : chainId ? `OTHER chain ${chainId}` : "not running"
  }`);
  if (chainId === NETWORK.chainId) {
    console.log(`            latest block ${Number(await rpcCall("eth_blockNumber"))}`);
    const depFile = path.join(ROOT, "deployments", "a3local.json");
    if (fs.existsSync(depFile)) {
      const { address } = JSON.parse(fs.readFileSync(depFile, "utf8"));
      const code = await rpcCall("eth_getCode", [address, "latest"]);
      console.log(`            SecureBank ${address}: ${code === "0x" ? "NOT deployed on this chain" : "deployed"}`);
    }
  }
  const feFree = await isPortFree(NETWORK.frontendPort, "127.0.0.1");
  console.log(`Frontend    port ${NETWORK.frontendPort}: ${feFree ? "free" : "in use"}`);
  for (const { name, pid } of readPids()) {
    console.log(`Recorded    ${name} PID ${pid}: ${isOwnProcess(pid) ? "alive" : "gone"}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
