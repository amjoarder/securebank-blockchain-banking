/**
 * Starts the isolated Assignment 3 Hardhat node (chainId 31303, port 8603) in the foreground.
 * Usage: npm run blockchain      — stop with Ctrl+C (or `npm run stop` from another terminal)
 */
const { NETWORK, HARDHAT_CLI, checkDemoPort, spawnNodeCli } = require("./lib/runtime");

async function main() {
  const state = await checkDemoPort(NETWORK.rpcPort, "Blockchain");
  if (state === "ours") {
    console.log(`The Assignment 3 blockchain is already running on port ${NETWORK.rpcPort}.`);
    return;
  }
  console.log(`Starting Assignment 3 blockchain: chainId ${NETWORK.chainId}, http://${NETWORK.rpcHost}:${NETWORK.rpcPort}`);
  const node = spawnNodeCli("blockchain", HARDHAT_CLI, [
    "node",
    "--hostname",
    NETWORK.rpcHost,
    "--port",
    String(NETWORK.rpcPort),
  ]);
  node.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
