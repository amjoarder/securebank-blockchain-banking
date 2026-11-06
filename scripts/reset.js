/**
 * Resets the running Assignment 3 chain to an empty state, then redeploys and reseeds.
 * Usage: npm run reset
 * Uses the Hardhat `hardhat_reset` RPC method, so no process has to be restarted.
 */
const { NETWORK, probeChainId, rpcCall, runHardhat } = require("./lib/runtime");

async function main() {
  const chainId = await probeChainId(NETWORK.rpcPort);
  if (chainId !== NETWORK.chainId) {
    throw new Error(
      `The Assignment 3 blockchain is not running on port ${NETWORK.rpcPort}. Start it with \`npm run blockchain\` or \`npm run demo\`.`
    );
  }
  console.log("Resetting Assignment 3 chain to genesis…");
  await rpcCall("hardhat_reset", []);
  await runHardhat(["run", "scripts/deploy.js", "--network", "a3local"]);
  await runHardhat(["run", "scripts/seed.js", "--network", "a3local"]);
  console.log("Reset complete. Reload the browser tab to pick up the new contract.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
