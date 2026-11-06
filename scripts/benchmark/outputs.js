/**
 * Writes benchmark evidence to performance-results/:
 *   raw/      every measured transaction and resource sample (JSON)
 *   csv/      the same data in spreadsheet-friendly form
 *   json/     aggregated metrics (summary.json is what the DApp's Performance page reads)
 *   summary/  SUMMARY.md, a human-readable report of the key numbers
 *   charts/   SVG + PNG charts generated from summary.json (see charts.js)
 */
const fs = require("fs");
const path = require("path");
const { formatEther, formatUnits } = require("ethers");
const { generateCharts } = require("./charts");

const jsonReplacer = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, jsonReplacer, 2));

function writeCsv(file, columns, rows) {
  const esc = (v) => {
    const s = v == null ? "" : typeof v === "number" ? String(Number(v.toFixed(4))) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(([h]) => h).join(","), ...rows.map((r) => columns.map(([, get]) => esc(get(r))).join(","))];
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

const gwei = (wei) => (wei == null ? null : Number(formatUnits(wei, "gwei")));
const eth = (wei) => (wei == null ? null : formatEther(wei));

function phaseOf(sample, phases) {
  return phases.find((p) => sample.t >= p.from && sample.t <= p.to)?.name ?? "between-phases";
}

function writeOutputs(dir, { raw, summary }) {
  for (const sub of ["raw", "csv", "json", "charts", "summary"]) {
    fs.rmSync(path.join(dir, sub), { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  const p = (...parts) => path.join(dir, ...parts);

  // raw evidence
  writeJson(p("raw", "deployment-runs.json"), raw.deployRuns);
  writeJson(p("raw", "operation-runs.json"), raw.opRuns);
  writeJson(p("raw", "interval-mining.json"), raw.interval);
  writeJson(p("raw", "scalability-runs.json"), raw.loadRuns);
  writeJson(p("raw", "scalability-transactions.json"), raw.loadTxs);
  writeJson(p("raw", "resource-samples.json"), { phases: raw.phases, samples: raw.samples });

  // csv
  writeCsv(p("csv", "deployment.csv"), [
    ["run", (r) => r.run],
    ["tx_hash", (r) => r.hash],
    ["contract_address", (r) => r.contractAddress],
    ["block_number", (r) => r.blockNumber],
    ["block_timestamp", (r) => r.blockTimestamp],
    ["gas_used", (r) => r.gasUsed],
    ["gas_price_gwei", (r) => gwei(r.gasPrice)],
    ["cost_eth", (r) => eth(r.costWei)],
    ["latency_ms", (r) => r.latencyMs],
  ], raw.deployRuns);

  writeCsv(p("csv", "transaction-benchmark.csv"), [
    ["operation", (r) => r.operation],
    ["run", (r) => r.run],
    ["success", (r) => r.success],
    ["tx_hash", (r) => r.hash],
    ["block_number", (r) => r.blockNumber],
    ["gas_used", (r) => r.gasUsed],
    ["effective_gas_price_gwei", (r) => gwei(r.gasPrice)],
    ["cost_eth", (r) => eth(r.costWei)],
    ["prep_ms", (r) => r.prepMs],
    ["latency_ms", (r) => r.latencyMs],
    ["end_to_end_ms", (r) => r.endToEndMs],
    ["started_at", (r) => (r.startedAt ? new Date(r.startedAt).toISOString() : "")],
    ["error", (r) => r.error ?? ""],
  ], raw.opRuns);

  writeCsv(p("csv", "confirmation-interval-mining.csv"), [
    ["sample", (r) => r.sample],
    ["submitted_at_ms", (r) => r.submittedAtMs],
    ["tx_hash", (r) => r.hash],
    ["block_number", (r) => r.blockNumber],
    ["status", (r) => r.status],
    ["first_confirmation_ms", (r) => r.firstConfirmationMs],
    ["three_confirmations_ms", (r) => r.threeConfirmationsMs],
  ], raw.interval.samples);

  writeCsv(p("csv", "scalability-runs.csv"), [
    ["load", (r) => r.load],
    ["repetition", (r) => r.rep],
    ["senders", (r) => r.senders],
    ["completed", (r) => r.completed],
    ["failed", (r) => r.failed],
    ["elapsed_ms", (r) => r.elapsedMs],
    ["tps", (r) => r.tps],
    ["latency_avg_ms", (r) => r.latencyMsAvg],
    ["latency_p50_ms", (r) => r.latencyMsP50],
    ["latency_p95_ms", (r) => r.latencyMsP95],
    ["latency_max_ms", (r) => r.latencyMsMax],
    ["blocks_mined", (r) => r.blocks],
    ["node_cpu_core_avg_pct", (r) => r.cpuCorePctAvg],
    ["node_cpu_core_peak_pct", (r) => r.cpuCorePctPeak],
    ["node_cpu_machine_avg_pct", (r) => r.cpuMachinePctAvg],
    ["node_cpu_machine_peak_pct", (r) => r.cpuMachinePctPeak],
    ["node_memory_avg_mb", (r) => r.memoryMBAvg],
    ["node_memory_peak_mb", (r) => r.memoryMBPeak],
    ["resource_samples", (r) => r.samples],
    ["client_cpu_core_pct", (r) => r.clientCpuCorePct],
  ], raw.loadRuns);

  writeCsv(p("csv", "scalability-summary.csv"), [
    ["load", (r) => r.load],
    ["repetitions", (r) => r.repetitions],
    ["senders", (r) => r.senders],
    ["completed", (r) => r.completed],
    ["failed", (r) => r.failed],
    ["tps_mean", (r) => r.tps.avg],
    ["tps_std", (r) => r.tps.std],
    ["tps_median", (r) => r.tps.p50],
    ["latency_avg_ms_mean", (r) => r.latencyMsAvg.avg],
    ["latency_p95_ms_mean", (r) => r.latencyMsP95.avg],
    ["node_cpu_core_avg_pct_mean", (r) => r.cpuCorePctAvg.avg],
    ["node_cpu_core_peak_pct_max", (r) => r.cpuCorePctPeak.max],
    ["node_memory_avg_mb_mean", (r) => r.memoryMBAvg.avg],
    ["node_memory_peak_mb_max", (r) => r.memoryMBPeak.max],
    ["node_memory_baseline_mb", (r) => r.memoryMBBaseline],
    ["node_memory_growth_mb", (r) => r.memoryMBGrowth],
  ], summary.scalability);

  writeCsv(p("csv", "scalability-transactions.csv"), [
    ["load", (r) => r.load],
    ["repetition", (r) => r.rep],
    ["sender_account_index", (r) => r.sender],
    ["operation", (r) => r.operation],
    ["success", (r) => r.success],
    ["latency_ms", (r) => r.latencyMs],
    ["gas_used", (r) => r.gasUsed],
    ["block_number", (r) => r.blockNumber],
    ["tx_hash", (r) => r.hash],
    ["error", (r) => r.error ?? ""],
  ], raw.loadTxs);

  writeCsv(p("csv", "resource-usage.csv"), [
    ["epoch_ms", (s) => s.t],
    ["time_iso", (s) => new Date(s.t).toISOString()],
    ["chain", (s) => s.chain],
    ["phase", (s) => phaseOf(s, raw.phases)],
    ["node_cpu_core_pct", (s) => s.cpuCorePct],
    ["node_cpu_machine_pct", (s) => s.cpuMachinePct],
    ["node_memory_working_set_mb", (s) => s.memoryMB],
    ["node_memory_private_mb", (s) => s.privateMB],
  ], raw.samples);

  // aggregated json
  writeJson(p("json", "deployment-metrics.json"), summary.deployment);
  writeJson(p("json", "transaction-benchmark.json"), { operations: summary.operations, overall: summary.overall });
  writeJson(p("json", "confirmation.json"), summary.confirmation);
  writeJson(p("json", "scalability.json"), { throughput: summary.throughput, scalability: summary.scalability });
  writeJson(p("json", "resource-usage.json"), summary.resources);

  const charts = generateCharts(p("charts"), summary);
  summary.files = {
    csv: fs.readdirSync(p("csv")),
    raw: fs.readdirSync(p("raw")),
    charts,
  };
  writeJson(p("json", "summary.json"), summary);
  fs.writeFileSync(p("summary", "SUMMARY.md"), renderMarkdown(summary));
}

function renderMarkdown(s) {
  const f = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const i = (v) => f(v, 0);
  const ops = ["deposit", "withdrawal", "transfer"];
  const lines = [];
  lines.push(`# SecureBank — Benchmark Summary`, "");
  lines.push(`Generated ${s.generatedAt} (${s.mode} run, ${f(s.durationSeconds, 0)} s). All values measured on the local Hardhat chain (chainId ${s.environment.chainId}); costs are simulated test ETH.`, "");
  lines.push(`**Environment:** ${s.environment.os}; ${s.environment.cpu} (${s.environment.logicalCpus} logical CPUs); ${f(s.environment.totalMemoryGB, 1)} GB RAM; Node ${s.environment.node}; Hardhat ${s.environment.hardhat}; solc ${s.environment.solc} (optimizer ${s.environment.optimizer}); effective gas price ${s.deployment.gasPriceGwei} gwei (base fee 0 + priority fee).`, "");

  lines.push(`## Deployment (${s.deployment.runs} runs)`, "");
  lines.push(`| Metric | Value |`, `|---|---|`);
  lines.push(`| Gas used | ${i(s.deployment.gasUsed.avg)} gas (min ${i(s.deployment.gasUsed.min)}, max ${i(s.deployment.gasUsed.max)}) |`);
  lines.push(`| Cost | ${f(s.deployment.costEth.avg, 9)} ETH at ${s.deployment.gasPriceGwei} gwei |`);
  lines.push(`| Latency (submit → receipt) | ${f(s.deployment.latencyMs.avg)} ms avg |`);
  lines.push(`| First deployment tx | \`${s.deployment.first.txHash}\` (block ${s.deployment.first.blockNumber}) |`, "");

  lines.push(`## Banking operations (${s.config.opRuns} runs each)`, "");
  lines.push(`| Operation | Success | Avg gas | Min–max gas | Avg cost (ETH) | Avg latency (ms) | p95 latency (ms) | Std latency (ms) |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const op of ops) {
    const o = s.operations[op];
    lines.push(`| ${op} | ${o.successes}/${o.runs} | ${i(o.gasUsed.avg)} | ${i(o.gasUsed.min)}–${i(o.gasUsed.max)} | ${f(o.costEth.avg, 9)} | ${f(o.latencyMs.avg)} | ${f(o.latencyMs.p95)} | ${f(o.latencyMs.std)} |`);
  }
  lines.push(`| **all** | ${s.overall.transactions} | ${i(s.overall.gasUsed.avg)} | ${i(s.overall.gasUsed.min)}–${i(s.overall.gasUsed.max)} | ${f(s.overall.costEth.avg, 9)} | ${f(s.overall.latencyMs.avg)} | ${f(s.overall.latencyMs.p95)} | ${f(s.overall.latencyMs.std)} |`, "");

  const c = s.confirmation;
  lines.push(`## Block confirmation time`, "");
  lines.push(`| Mode | Samples | 1 confirmation avg (ms) | 3 confirmations avg (ms) | Observed block interval (ms) |`, `|---|---|---|---|---|`);
  lines.push(`| Automine (1 tx/block) | ${c.automine.samples} | ${f(c.automine.firstConfirmationMs.avg)} | — | on demand |`);
  lines.push(`| Interval mining (${c.interval.blockIntervalTargetMs} ms) | ${c.interval.samples} | ${f(c.interval.firstConfirmationMs.avg)} | ${f(c.interval.threeConfirmationsMs.avg)} | ${f(c.interval.observedBlockIntervalMs.avg)} |`, "");

  lines.push(`## Throughput & scalability (fresh node per load level, ${s.config.repetitions} repetitions each)`, "");
  lines.push(`Peak TPS: **${f(s.throughput.peakTps)}**; median over all runs ${f(s.throughput.medianTps)}. ${s.throughput.formula}.`, "");
  lines.push(`| Load (tx) | Senders | Completed | Failed | TPS mean ± std | TPS median | Avg latency (ms) | p95 latency (ms) | Node CPU avg (% of 1 core) | Node CPU peak | Node memory avg (MB) | Node memory peak (MB) | Memory growth vs fresh-node baseline (MB) |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of s.scalability) {
    lines.push(`| ${r.load} | ${r.senders} | ${r.completed} | ${r.failed} | ${f(r.tps.avg)} ± ${f(r.tps.std)} | ${f(r.tps.p50)} | ${f(r.latencyMsAvg.avg)} | ${f(r.latencyMsP95.avg)} | ${f(r.cpuCorePctAvg.avg, 1)} | ${f(r.cpuCorePctPeak.max, 1)} | ${f(r.memoryMBAvg.avg, 1)} | ${f(r.memoryMBPeak.max, 1)} | ${f(r.memoryMBGrowth, 1)} (baseline ${f(r.memoryMBBaseline, 1)}) |`);
  }
  lines.push("", `## Resource usage by phase (${s.resources.target})`, "");
  lines.push(`| Phase | Samples | CPU avg (% of 1 core) | CPU peak | Memory avg (MB) | Memory peak (MB) |`, `|---|---|---|---|---|---|`);
  for (const [name, r] of Object.entries({ Idle: s.resources.idle, "Operation benchmark": s.resources.operations, "Load tests": s.resources.load, "Whole run": s.resources.wholeRun })) {
    lines.push(`| ${name} | ${r.samples} | ${f(r.cpuCorePctAvg, 1)} | ${f(r.cpuCorePctPeak, 1)} | ${f(r.memoryMBAvg, 1)} | ${f(r.memoryMBPeak, 1)} |`);
  }
  lines.push("", `Method: ${s.resources.method}. CPU "% of 1 core" can exceed 100 % when the node uses several threads; divide by ${s.resources.logicalCpus} for % of the whole machine.`, "");
  return lines.join("\n");
}

module.exports = { writeOutputs };
