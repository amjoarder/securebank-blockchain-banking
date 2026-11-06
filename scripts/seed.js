/**
 * Seeds legitimate demo records through the real SecureBank functions.
 * Usage: npx hardhat run scripts/seed.js --network a3local   (or: npm run seed)
 *
 * Alice, Bob and Charlie get registered accounts and a short transaction history.
 * Diana and Ethan are intentionally left unregistered so registration can be demonstrated live.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const demo = require("../config/demo-accounts.json");

const SBC = (n) => BigInt(Math.round(n * 100));

async function main() {
  const { ethers } = hre;
  const deploymentPath = path.resolve(__dirname, "..", "deployments", "a3local.json");
  if (!fs.existsSync(deploymentPath)) throw new Error("No deployment found. Run `npm run deploy` first.");
  const { address } = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if ((await ethers.provider.getCode(address)) === "0x") {
    throw new Error(`No contract at ${address} on this chain. Run \`npm run deploy\` (or \`npm run reset\`) first.`);
  }

  const signers = await ethers.getSigners();
  const bank = await ethers.getContractAt("SecureBank", address);
  const byName = Object.fromEntries(
    demo.accounts.filter((a) => a.seeded).map((a) => [a.name.split(" ")[0].toLowerCase(), signers[a.index]])
  );
  const { alice, bob, charlie } = byName;

  if ((await bank.getCustomer(alice.address)).registered) {
    console.log("Demo data already present — skipping. Use `npm run reset` for a clean chain.");
    return;
  }

  const run = async (label, txPromise) => {
    const receipt = await (await txPromise).wait();
    console.log(`  ✓ ${label.padEnd(40)} block ${receipt.blockNumber}  gas ${receipt.gasUsed}`);
    return receipt;
  };

  console.log(`Seeding SecureBank at ${address}`);
  for (const acct of demo.accounts.filter((a) => a.seeded)) {
    const signer = signers[acct.index];
    await run(`register ${acct.name}`, bank.connect(signer).registerCustomer(acct.name));
    await run(`open account for ${acct.name}`, bank.connect(signer).createAccount());
  }

  const acctNo = async (signer) => (await bank.getAccount(signer.address)).accountNumber;

  await run("Alice deposits 5,000.00 SBC", bank.connect(alice).deposit(SBC(5000)));
  await run("Bob deposits 2,500.00 SBC", bank.connect(bob).deposit(SBC(2500)));
  await run("Charlie deposits 1,200.00 SBC", bank.connect(charlie).deposit(SBC(1200)));
  await run("Alice → Bob 750.00 SBC", bank.connect(alice).transfer(await acctNo(bob), SBC(750)));
  await run("Bob → Charlie 300.00 SBC", bank.connect(bob).transfer(await acctNo(charlie), SBC(300)));
  await run("Charlie withdraws 150.00 SBC", bank.connect(charlie).withdraw(SBC(150)));
  await run("Alice withdraws 250.00 SBC", bank.connect(alice).withdraw(SBC(250)));

  const stats = await bank.getStats();
  console.log(`Seed complete: ${stats[0]} customers, ${stats[1]} accounts, ${stats[2]} transactions.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
