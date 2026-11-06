/**
 * Deploys SecureBank to the Assignment 3 local chain and records deployment metrics.
 * Usage: npx hardhat run scripts/deploy.js --network a3local   (or: npm run deploy)
 *
 * Outputs:
 *  - deployments/a3local.json                   full deployment record (address, tx hash, gas, cost, block)
 *  - frontend/src/generated/SecureBank.abi.json contract ABI bundled into the frontend
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const NETWORK = require("../config/network.json");

async function main() {
  const { ethers } = hre;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== NETWORK.chainId) {
    throw new Error(`Refusing to deploy: connected to chainId ${chainId}, expected Assignment 3 chain ${NETWORK.chainId}`);
  }

  const [admin] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("SecureBank");

  const t0 = performance.now();
  const bank = await factory.deploy();
  const deployTx = bank.deploymentTransaction();
  const receipt = await deployTx.wait();
  const latencyMs = performance.now() - t0;

  const block = await ethers.provider.getBlock(receipt.blockNumber);
  const address = await bank.getAddress();
  const costWei = receipt.gasUsed * receipt.gasPrice;

  const record = {
    contract: "SecureBank",
    network: NETWORK.networkName,
    chainId,
    rpcUrl: `http://${NETWORK.rpcHost}:${NETWORK.rpcPort}`,
    address,
    admin: admin.address,
    deploymentTxHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockTimestamp: block.timestamp,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPriceWei: receipt.gasPrice.toString(),
    deploymentCostWei: costWei.toString(),
    deploymentCostEth: ethers.formatEther(costWei),
    confirmationLatencyMs: Number(latencyMs.toFixed(2)),
    deployedAt: new Date().toISOString(),
    note: "Local Hardhat chain: gas cost is simulated test ETH, not real money.",
  };

  const root = path.resolve(__dirname, "..");
  fs.mkdirSync(path.join(root, "deployments"), { recursive: true });
  fs.writeFileSync(path.join(root, "deployments", "a3local.json"), JSON.stringify(record, null, 2));

  // The frontend bundles the ABI (changes only when the contract changes) and fetches
  // the address at runtime from /runtime/deployment.json, so redeploying needs no rebuild.
  const artifact = await hre.artifacts.readArtifact("SecureBank");
  const generatedDir = path.join(root, "frontend", "src", "generated");
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, "SecureBank.abi.json"), JSON.stringify(artifact.abi, null, 2));

  console.log("SecureBank deployed");
  console.log(`  address      ${address}`);
  console.log(`  tx hash      ${record.deploymentTxHash}`);
  console.log(`  block        ${record.blockNumber}`);
  console.log(`  gas used     ${record.gasUsed}`);
  console.log(`  gas price    ${ethers.formatUnits(receipt.gasPrice, "gwei")} gwei`);
  console.log(`  cost         ${record.deploymentCostEth} ETH (simulated, local chain)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
