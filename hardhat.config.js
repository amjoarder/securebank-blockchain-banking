require("@nomicfoundation/hardhat-toolbox");
const net = require("./config/network.json");

/**
 * Assignment 3 uses its own chainId (31303) and ports (8603 demo / 8613 benchmark)
 * so it cannot be confused with other Hardhat projects that use 31337 / 8545.
 */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: net.chainId,
      // Base fee pinned at 0 so the effective gas price is just the priority fee
      // and cost figures stay comparable between runs (documented in PERFORMANCE_METHODOLOGY.md).
      initialBaseFeePerGas: 0,
      accounts: { count: net.accountCount },
    },
    a3local: {
      url: `http://${net.rpcHost}:${net.rpcPort}`,
      chainId: net.chainId,
    },
    a3bench: {
      url: `http://${net.rpcHost}:${net.benchmarkRpcPort}`,
      chainId: net.chainId,
      timeout: 120000,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    offline: true,
  },
  mocha: { timeout: 60000 },
};
