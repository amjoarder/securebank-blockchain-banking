/**
 * SecureBank performance benchmark.  Usage: npm run benchmark   (add -- --quick for a short smoke run)
 *
 * Runs on dedicated, throw-away Hardhat nodes (port 8613) started and stopped by this script, so the
 * demo chain is never touched and each node's PID can be sampled for CPU and memory.
 *
 * Phases
 *   A  Deployment cost          5 deployments of SecureBank (gas, price, cost, latency)
 *   B  Operation benchmark      30 × deposit / withdrawal / transfer, sequential, interleaved
 *   C  Confirmation time        automine (from B) and 2-second interval mining (1 and 3 confirmations)
 *   D  Throughput/scalability   loads 10…1000 tx; EACH load level runs on a fresh node
 *                               (deploy + onboard + warm-up), then 5 repetitions with 20 parallel
 *                               senders and explicit nonces
 *
 * Every number written to performance-results/ comes from these executions.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Interface, formatEther, formatUnits } = require("ethers");
const runtime = require("../lib/runtime");
const { ResourceSampler } = require("./sampler");
const { summarize, roundDeep } = require("./stats");
const kit = require("./txkit");
const { writeOutputs } = require("./outputs");

const QUICK = process.argv.includes("--quick");
const CONFIG = QUICK
  ? { deployRuns: 2, opRuns: 5, loads: [10, 50], repetitions: 2, senders: 10, intervalSamples: 5, intervalMiningMs: 2000 }
  : { deployRuns: 5, opRuns: 30, loads: [10, 50, 100, 250, 500, 1000], repetitions: 5, senders: 20, intervalSamples: 20, intervalMiningMs: 2000 };
Object.assign(CONFIG, {
  warmupOps: 15, // discarded before phase B
  warmupLoad: 50, // discarded before each load level in phase D
  pauseBetweenRepsMs: 1000,
  sampleIntervalMs: 250,
  // 40 % deposits, 40 % transfers, 20 % withdrawals
  mix: ["deposit", "transfer", "withdrawal", "transfer", "deposit"],
  fixedGasLimit: 400000n, // pre-signed load-test transactions (max observed ≈ 260k)
});
const OUT_DIR = QUICK ? path.join(runtime.ROOT, ".run", "benchmark-quick") : path.join(runtime.ROOT, "performance-results");

// Wallet roles (Hardhat dev accounts on the benchmark chains)
const ADMIN = 0;
const OP_USERS = range(1, 10); // phase B
const LOAD_SENDERS = range(11, 10 + CONFIG.senders); // phase D
const INTERVAL_USERS = range(31, 35); // phase C2
const WALLETS = kit.deriveWallets(runtime.NETWORK.accountCount);
const CHAIN_ID = runtime.NETWORK.chainId;

function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[bench ${new Date().toISOString().slice(11, 19)}]`, ...a);

function resourceStats(samples) {
  const cpu = summarize(samples.map((s) => s.cpuCorePct));
  const cpuMachine = summarize(samples.map((s) => s.cpuMachinePct));
  const mem = summarize(samples.map((s) => s.memoryMB));
  return {
    samples: samples.length,
    cpuCorePctAvg: cpu.avg,
    cpuCorePctPeak: cpu.max,
    cpuMachinePctAvg: cpuMachine.avg,
    cpuMachinePctPeak: cpuMachine.max,
    memoryMBAvg: mem.avg,
    memoryMBPeak: mem.max,
  };
}

// ───────────────────────────── Benchmark chain lifecycle ─────────────────────────────

/** Starts a fresh Hardhat node with its own sampler, RPC client and nonce book. */
async function startChain(label, artifact) {
  const port = runtime.NETWORK.benchmarkRpcPort;
  if (!(await runtime.isPortFree(port))) {
    throw new Error(`Benchmark port ${port} is busy. If a previous benchmark crashed run \`a3 stop\`; nothing was stopped.`);
  }
  const node = runtime.spawnNodeCli("benchmark-chain", runtime.HARDHAT_CLI, ["node", "--hostname", runtime.NETWORK.rpcHost, "--port", String(port)], {
    stdio: "ignore",
  });
  const chain = { label, node, sampler: new ResourceSampler(node.pid, CONFIG.sampleIntervalMs) };
  try {
    await runtime.waitForRpc(port);
    await chain.sampler.start();
    chain.rpc = new kit.RpcClient(runtime.rpcUrl(port));
    const accounts = await chain.rpc.call("eth_accounts", []);
    if (accounts[0].toLowerCase() !== WALLETS[0].address.toLowerCase()) throw new Error("Derived wallets do not match node accounts");
    chain.nonces = new kit.NonceBook(chain.rpc);
    // EIP-1559 fees exactly as ethers computes them (maxFee = 2 × baseFee + priority). ethers' getFeeData()
    // treats a base fee of 0 as "no EIP-1559" and returns nulls, so the values are derived explicitly here.
    const priority = BigInt(await chain.rpc.call("eth_maxPriorityFeePerGas", []));
    const baseFee = BigInt((await chain.rpc.call("eth_getBlockByNumber", ["latest", false])).baseFeePerGas ?? 0);
    chain.fees = { maxFeePerGas: baseFee * 2n + priority, maxPriorityFeePerGas: priority };
    chain.iface = new Interface(artifact.abi);
    return chain;
  } catch (err) {
    await stopChain(chain);
    throw err;
  }
}

async function stopChain(chain) {
  chain.sampler.stop();
  runtime.stopOwnProcess(chain.node.pid);
  runtime.unregisterPid(chain.node.pid);
  for (let i = 0; i < 50 && !(await runtime.isPortFree(runtime.NETWORK.benchmarkRpcPort)); i++) await sleep(200);
}

/** Sends a measured transaction from wallet index `idx` using the chain's nonce book. */
async function send(chain, idx, tx) {
  const w = WALLETS[idx];
  return kit.measuredSend(chain.rpc, w, { ...tx, nonce: await chain.nonces.take(w.address), fees: chain.fees, chainId: CHAIN_ID });
}

async function deployBank(chain, artifact) {
  const r = await send(chain, ADMIN, { data: artifact.bytecode });
  chain.bank = r.contractAddress;
  chain.txTo = (fn, args) => ({ to: chain.bank, data: chain.iface.encodeFunctionData(fn, args) });
  return r;
}

/** Registers, opens and funds (500,000 SBC) each customer; returns wallet index → account number. */
async function onboard(chain, indices) {
  await Promise.all(
    indices.map(async (idx) => {
      for (const [fn, args] of [["registerCustomer", [`Bench Customer ${idx}`]], ["createAccount", []], ["deposit", [50_000_000n]]]) {
        const r = await send(chain, idx, chain.txTo(fn, args));
        if (r.status !== 1) throw new Error(`Setup ${fn} failed for account ${idx}`);
      }
    })
  );
  const accountNo = {};
  for (const idx of indices) {
    const data = chain.iface.encodeFunctionData("getAccount", [WALLETS[idx].address]);
    const raw = await chain.rpc.call("eth_call", [{ to: chain.bank, data }, "latest"]);
    accountNo[idx] = chain.iface.decodeFunctionResult("getAccount", raw)[0].accountNumber;
  }
  return accountNo;
}

// ────────────────────────────────────── Main ──────────────────────────────────────

async function main() {
  const t0 = Date.now();
  log(`SecureBank benchmark (${QUICK ? "QUICK smoke run" : "full run"}) → ${path.relative(runtime.ROOT, OUT_DIR)}`);

  await runtime.runHardhat(["compile", "--quiet"], { stdio: "ignore" });
  const artifact = JSON.parse(fs.readFileSync(path.join(runtime.ROOT, "artifacts", "contracts", "SecureBank.sol", "SecureBank.json"), "utf8"));

  const phases = [];
  const allSamples = [];
  const phase = async (name, fn) => {
    const from = Date.now();
    const result = await fn();
    phases.push({ name, from, to: Date.now() });
    return result;
  };

  // ── Chain 1: phases A, B, C ──
  log(`Starting benchmark chain for deployment, operation and confirmation phases (port ${runtime.NETWORK.benchmarkRpcPort})…`);
  const main = await startChain("main", artifact);
  let deployRuns, opRuns, interval, fees;
  try {
    fees = main.fees;
    await phase("idle-baseline", () => sleep(3000));

    log(`Phase A: ${CONFIG.deployRuns} deployments`);
    deployRuns = await phase("deployment", async () => {
      const runs = [];
      for (let i = 1; i <= CONFIG.deployRuns; i++) {
        const r = await deployBank(main, artifact);
        const block = await main.rpc.call("eth_getBlockByNumber", [`0x${r.blockNumber.toString(16)}`, false]);
        runs.push({ run: i, ...r, blockTimestamp: Number(block.timestamp) });
      }
      return runs;
    });

    log(`Setup: onboarding ${OP_USERS.length + INTERVAL_USERS.length} benchmark customers`);
    const accountNo = await phase("setup", () => onboard(main, [...OP_USERS, ...INTERVAL_USERS]));

    // Warm-up (discarded): lets the node's JIT and caches settle so run 1 is not an outlier.
    await phase("warmup", async () => {
      for (let i = 0; i < CONFIG.warmupOps; i++) {
        const fn = ["deposit", "withdraw", "transfer"][i % 3];
        const args = fn === "transfer" ? [accountNo[OP_USERS[(i + 1) % OP_USERS.length]], 100n] : [100n];
        await send(main, OP_USERS[i % OP_USERS.length], main.txTo(fn, args));
      }
    });

    log(`Phase B: ${CONFIG.opRuns} × deposit, withdrawal, transfer`);
    opRuns = await phase("operations", async () => {
      const rows = [];
      for (let run = 1; run <= CONFIG.opRuns; run++) {
        const u = OP_USERS[(run - 1) % OP_USERS.length];
        const next = OP_USERS[run % OP_USERS.length];
        const plan = [
          ["deposit", "deposit", [BigInt(10_000 + run)]],
          ["withdrawal", "withdraw", [BigInt(5_000 + run)]],
          ["transfer", "transfer", [accountNo[next], BigInt(7_000 + run)]],
        ];
        for (const [op, fn, args] of plan) {
          try {
            const r = await send(main, u, main.txTo(fn, args));
            rows.push({ operation: op, run, success: r.status === 1, ...r });
          } catch (err) {
            rows.push({ operation: op, run, success: false, error: err.shortMessage ?? err.message });
          }
        }
      }
      return rows;
    });

    log(`Phase C: ${CONFIG.intervalSamples} transactions under ${CONFIG.intervalMiningMs} ms interval mining`);
    interval = await phase("interval-mining", () => intervalMiningExperiment(main));
  } finally {
    await stopChain(main);
    allSamples.push(...main.sampler.samples.map((s) => ({ ...s, chain: main.label })));
  }

  // ── Phase D: one fresh chain per load level ──
  const loadRuns = [];
  const loadTxs = [];
  const baselines = {};
  for (const load of CONFIG.loads) {
    const chain = await startChain(`load-${load}`, artifact);
    try {
      await deployBank(chain, artifact);
      const accountNo = await onboard(chain, LOAD_SENDERS);
      await runLoad(chain, { load: CONFIG.warmupLoad, rep: 0, accountNo }); // warm-up, discarded
      await sleep(1000);
      const w = chain.sampler.samples.slice(-4); // ~1 s of samples after warm-up
      baselines[load] = summarize(w.map((s) => s.memoryMB)).avg;

      for (let rep = 1; rep <= CONFIG.repetitions; rep++) {
        await sleep(CONFIG.pauseBetweenRepsMs);
        const r = await phase(`load-${load}-rep-${rep}`, () => runLoad(chain, { load, rep, accountNo }));
        loadRuns.push(r.summary);
        loadTxs.push(...r.transactions);
        log(
          `Phase D: load ${String(load).padStart(4)} rep ${rep}: ${r.summary.completed} ok, ${r.summary.failed} failed, ` +
            `${r.summary.tps.toFixed(1)} TPS, avg latency ${r.summary.latencyMsAvg.toFixed(1)} ms, CPU ${r.summary.cpuCorePctAvg?.toFixed(0)} % core, ` +
            `mem ${r.summary.memoryMBPeak?.toFixed(0)} MB`
        );
      }
    } finally {
      await stopChain(chain);
      allSamples.push(...chain.sampler.samples.map((s) => ({ ...s, chain: chain.label })));
    }
  }

  const results = aggregate({ deployRuns, opRuns, interval, loadRuns, loadTxs, samples: allSamples, phases, fees, baselines, startedAt: t0 });
  writeOutputs(OUT_DIR, results);
  log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)} s. Results written to ${path.relative(runtime.ROOT, OUT_DIR)}`);
}

// ───────────────────────────── Phase C: interval mining ─────────────────────────────

/** Switches the node to fixed-interval block production and times 1- and 3-block confirmations. */
async function intervalMiningExperiment(chain) {
  const { rpc } = chain;
  const blockSeen = new Map(); // block number → performance.now() when first observed
  let watching = true;
  const watcher = (async () => {
    while (watching) {
      const n = Number(await rpc.call("eth_blockNumber", []));
      if (!blockSeen.has(n)) blockSeen.set(n, performance.now());
      await sleep(5);
    }
  })();
  const waitForBlock = async (n) => {
    while (!blockSeen.has(n)) await sleep(5);
    return blockSeen.get(n);
  };

  await rpc.call("evm_setAutomine", [false]);
  await rpc.call("evm_setIntervalMining", [CONFIG.intervalMiningMs]);
  const startBlock = Number(await rpc.call("eth_blockNumber", []));

  const samples = [];
  try {
    // Deterministic, staggered submission times so transactions land at different points of the block interval.
    const offsets = Array.from({ length: CONFIG.intervalSamples }, (_, i) => i * 1300 + ((i * 7919) % 1000));
    const begin = performance.now();
    await Promise.all(
      offsets.map(async (offset, i) => {
        await sleep(offset);
        const w = WALLETS[INTERVAL_USERS[i % INTERVAL_USERS.length]];
        const signed = await kit.signTx(rpc, w, {
          ...chain.txTo("deposit", [BigInt(2_000 + i)]),
          nonce: await chain.nonces.take(w.address),
          fees: chain.fees,
          chainId: CHAIN_ID,
          gasLimit: CONFIG.fixedGasLimit,
        });
        const tSubmit = performance.now();
        const hash = await rpc.call("eth_sendRawTransaction", [signed]);
        const receipt = kit.parseReceipt(await kit.waitReceipt(rpc, hash, 5));
        const tFirst = performance.now();
        const tThird = await waitForBlock(receipt.blockNumber + 2);
        samples.push({
          sample: i + 1,
          submittedAtMs: tSubmit - begin,
          hash: receipt.hash,
          blockNumber: receipt.blockNumber,
          status: receipt.status,
          firstConfirmationMs: tFirst - tSubmit,
          threeConfirmationsMs: tThird - tSubmit,
        });
      })
    );
  } finally {
    await rpc.call("evm_setIntervalMining", [0]);
    await rpc.call("evm_setAutomine", [true]);
    watching = false;
    await watcher;
  }

  const seen = [...blockSeen.entries()].filter(([n]) => n > startBlock).sort((a, b) => a[0] - b[0]);
  const blockIntervals = seen.slice(1).map(([, t], i) => t - seen[i][1]);
  return { samples: samples.sort((a, b) => a.sample - b.sample), blockIntervals };
}

// ───────────────────────────── Phase D: one controlled load ─────────────────────────────

/** Pre-signed mixed workload; one sequential queue per sender (correct nonce order), senders in parallel. */
async function runLoad(chain, { load, rep, accountNo }) {
  const { rpc } = chain;
  const senders = LOAD_SENDERS.slice(0, Math.min(LOAD_SENDERS.length, load));
  const queues = new Map(senders.map((s) => [s, []]));
  for (let i = 0; i < load; i++) {
    const s = senders[i % senders.length];
    const op = CONFIG.mix[i % CONFIG.mix.length];
    const recipient = senders[(senders.indexOf(s) + 1) % senders.length]; // loads ≥ 10 always have ≥ 2 senders
    const call =
      op === "deposit"
        ? chain.txTo("deposit", [100n])
        : op === "withdrawal"
          ? chain.txTo("withdraw", [50n])
          : chain.txTo("transfer", [accountNo[recipient], 75n]);
    const w = WALLETS[s];
    const signed = await kit.signTx(rpc, w, { ...call, nonce: await chain.nonces.take(w.address), fees: chain.fees, chainId: CHAIN_ID, gasLimit: CONFIG.fixedGasLimit });
    queues.get(s).push({ op, signed });
  }

  const startBlock = Number(await rpc.call("eth_blockNumber", []));
  const clientCpu0 = process.cpuUsage();
  const wallStart = Date.now();
  const perfStart = performance.now();
  const transactions = [];

  await Promise.all(
    [...queues.entries()].map(async ([sender, queue]) => {
      for (const { op, signed } of queue) {
        try {
          const r = await kit.submitSigned(rpc, signed);
          transactions.push({ load, rep, sender, operation: op, success: r.status === 1, latencyMs: r.latencyMs, gasUsed: r.gasUsed, blockNumber: r.blockNumber, hash: r.hash });
        } catch (err) {
          transactions.push({ load, rep, sender, operation: op, success: false, error: err.shortMessage ?? err.message });
        }
      }
    })
  );

  const elapsedMs = performance.now() - perfStart;
  const wallEnd = Date.now();
  const clientCpu = process.cpuUsage(clientCpu0);
  const endBlock = Number(await rpc.call("eth_blockNumber", []));
  const ok = transactions.filter((t) => t.success);
  const lat = summarize(ok.map((t) => t.latencyMs));
  await sleep(CONFIG.sampleIntervalMs + 100); // make sure the sample covering the end of the window has arrived

  return {
    transactions,
    summary: {
      load,
      rep,
      senders: senders.length,
      completed: ok.length,
      failed: transactions.length - ok.length,
      elapsedMs,
      tps: ok.length / (elapsedMs / 1000),
      latencyMsAvg: lat.avg,
      latencyMsP50: lat.p50,
      latencyMsP95: lat.p95,
      latencyMsMax: lat.max,
      blocks: endBlock - startBlock,
      clientCpuCorePct: ((clientCpu.user + clientCpu.system) / 1000 / elapsedMs) * 100,
      ...resourceStats(chain.sampler.window(wallStart, wallEnd)),
      windowStart: wallStart,
      windowEnd: wallEnd,
    },
  };
}

// ───────────────────────────────────── Aggregation ─────────────────────────────────────

function aggregate({ deployRuns, opRuns, interval, loadRuns, loadTxs, samples, phases, fees, baselines, startedAt }) {
  const eth = (wei) => Number(formatEther(wei));
  const hh = require(path.join(runtime.ROOT, "node_modules", "hardhat", "package.json")).version;
  const ethersVersion = require(path.join(runtime.ROOT, "node_modules", "ethers", "package.json")).version;
  const solc = fs.readFileSync(path.join(runtime.ROOT, "hardhat.config.js"), "utf8").match(/version:\s*"([\d.]+)"/)[1];

  const deployment = {
    runs: deployRuns.length,
    gasUsed: summarize(deployRuns.map((r) => Number(r.gasUsed))),
    gasPriceGwei: Number(formatUnits(deployRuns[0].gasPrice, "gwei")),
    costEth: summarize(deployRuns.map((r) => eth(r.costWei))),
    latencyMs: summarize(deployRuns.map((r) => r.latencyMs)),
    first: {
      txHash: deployRuns[0].hash,
      contractAddress: deployRuns[0].contractAddress,
      blockNumber: deployRuns[0].blockNumber,
      blockTimestamp: deployRuns[0].blockTimestamp,
      gasUsed: Number(deployRuns[0].gasUsed),
      costWei: deployRuns[0].costWei.toString(),
    },
  };

  const operations = {};
  for (const op of ["deposit", "withdrawal", "transfer"]) {
    const rows = opRuns.filter((r) => r.operation === op);
    const ok = rows.filter((r) => r.success);
    operations[op] = {
      runs: rows.length,
      successes: ok.length,
      failures: rows.length - ok.length,
      gasUsed: summarize(ok.map((r) => Number(r.gasUsed))),
      costEth: summarize(ok.map((r) => eth(r.costWei))),
      latencyMs: summarize(ok.map((r) => r.latencyMs)),
      prepMs: summarize(ok.map((r) => r.prepMs)),
      endToEndMs: summarize(ok.map((r) => r.endToEndMs)),
    };
  }
  const okOps = opRuns.filter((r) => r.success);
  const overall = {
    transactions: okOps.length,
    gasUsed: summarize(okOps.map((r) => Number(r.gasUsed))),
    costEth: summarize(okOps.map((r) => eth(r.costWei))),
    latencyMs: summarize(okOps.map((r) => r.latencyMs)),
  };

  const opBlocks = new Set(okOps.map((r) => r.blockNumber));
  const confirmation = {
    automine: {
      description: "Hardhat automine: every transaction is mined into its own block immediately on submission, so confirmation time equals submission→receipt latency.",
      samples: okOps.length,
      transactionsPerBlock: okOps.length / opBlocks.size,
      firstConfirmationMs: summarize(okOps.map((r) => r.latencyMs)),
    },
    interval: {
      description: `Node switched to interval mining (one block every ${CONFIG.intervalMiningMs} ms) to emulate a fixed block time.`,
      blockIntervalTargetMs: CONFIG.intervalMiningMs,
      samples: interval.samples.length,
      failures: interval.samples.filter((s) => s.status !== 1).length,
      observedBlockIntervalMs: summarize(interval.blockIntervals),
      firstConfirmationMs: summarize(interval.samples.map((s) => s.firstConfirmationMs)),
      threeConfirmationsMs: summarize(interval.samples.map((s) => s.threeConfirmationsMs)),
    },
  };

  const scalability = CONFIG.loads.map((load) => {
    const runs = loadRuns.filter((r) => r.load === load);
    const m = (key) => summarize(runs.map((r) => r[key]));
    const memoryPeak = m("memoryMBPeak");
    return {
      load,
      repetitions: runs.length,
      senders: runs[0].senders,
      completed: runs.reduce((s, r) => s + r.completed, 0),
      failed: runs.reduce((s, r) => s + r.failed, 0),
      elapsedMs: m("elapsedMs"),
      tps: m("tps"),
      latencyMsAvg: m("latencyMsAvg"),
      latencyMsP95: m("latencyMsP95"),
      cpuCorePctAvg: m("cpuCorePctAvg"),
      cpuCorePctPeak: m("cpuCorePctPeak"),
      cpuMachinePctAvg: m("cpuMachinePctAvg"),
      memoryMBAvg: m("memoryMBAvg"),
      memoryMBPeak: memoryPeak,
      memoryMBBaseline: baselines[load],
      memoryMBGrowth: memoryPeak.max - baselines[load],
      clientCpuCorePct: m("clientCpuCorePct"),
    };
  });

  const byPhase = (prefix) => {
    const ranges = phases.filter((p) => p.name.startsWith(prefix));
    return resourceStats(samples.filter((s) => ranges.some((p) => s.t >= p.from && s.tStart <= p.to)));
  };
  const resources = {
    target: "Hardhat node process (benchmark chains) — per-process, not system-wide",
    method: `PowerShell Get-Process sampling every ${CONFIG.sampleIntervalMs} ms: CPU from TotalProcessorTime deltas, memory = working set`,
    logicalCpus: os.cpus().length,
    idle: byPhase("idle-baseline"),
    operations: byPhase("operations"),
    load: byPhase("load-"),
    wholeRun: resourceStats(samples),
  };

  const tpsValues = loadRuns.map((r) => r.tps);
  return {
    raw: { deployRuns, opRuns, interval, loadRuns, loadTxs, samples, phases },
    summary: roundDeep({
      generatedAt: new Date().toISOString(),
      mode: QUICK ? "quick" : "full",
      durationSeconds: (Date.now() - startedAt) / 1000,
      config: { ...CONFIG, fixedGasLimit: Number(CONFIG.fixedGasLimit) },
      environment: {
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        cpu: os.cpus()[0].model.trim(),
        logicalCpus: os.cpus().length,
        totalMemoryGB: os.totalmem() / 1024 ** 3,
        node: process.version,
        hardhat: hh,
        ethers: ethersVersion,
        solc,
        optimizer: "enabled, 200 runs",
        chainId: CHAIN_ID,
        miningMode: "automine (1 tx per block) unless stated otherwise",
        baseFeePerGasWei: 0,
        maxPriorityFeePerGasGwei: Number(formatUnits(fees.maxPriorityFeePerGas, "gwei")),
        maxFeePerGasGwei: Number(formatUnits(fees.maxFeePerGas, "gwei")),
      },
      deployment,
      operations,
      overall,
      confirmation,
      throughput: {
        formula: "TPS = successfully completed transactions / elapsed seconds (first submission → last receipt)",
        peakTps: Math.max(...tpsValues),
        meanTps: summarize(tpsValues).avg,
        medianTps: summarize(tpsValues).p50,
      },
      scalability,
      resources,
    }),
  };
}

main().catch((err) => {
  console.error(`[bench] FAILED: ${err.stack ?? err.message}`);
  process.exit(1);
});
