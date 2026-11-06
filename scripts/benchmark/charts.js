/**
 * Generates report charts from performance-results/json/summary.json (real measured data only).
 * Called automatically at the end of `npm run benchmark`; can be re-run with `npm run charts`.
 */
const fs = require("fs");
const path = require("path");
const { barChart, lineChart } = require("./svg");

const OPS = ["deposit", "withdrawal", "transfer"];
const OP_LABELS = ["Deposit", "Withdrawal", "Transfer"];
const BLUE = "#2463eb";
const NAVY = "#12264a";
const GREEN = "#059669";
const AMBER = "#d97706";
const SLATE = "#94a3b8";

function chartSpecs(s) {
  const op = (key, stat = "avg") => OPS.map((o) => s.operations[o][key][stat]);
  const loads = s.scalability.map((r) => String(r.load));
  const sc = (key, stat = "avg") => s.scalability.map((r) => r[key][stat]);
  const runs = `${s.config.opRuns} runs per operation`;
  const reps = `fresh node per load level · ${s.config.repetitions} repetitions · ${s.scalability.at(-1).senders} parallel senders`;

  return [
    {
      file: "01-average-gas-by-operation",
      svg: barChart({
        title: "Average Gas Used by Operation",
        subtitle: `SecureBank on local Hardhat chain · ${runs} · whiskers = min/max`,
        xLabel: "Banking operation",
        yLabel: "Gas used (gas units)",
        categories: OP_LABELS,
        series: [{ name: "Average gas", color: BLUE, values: op("gasUsed"), errors: OPS.map((o) => ({ low: s.operations[o].gasUsed.min, high: s.operations[o].gasUsed.max })) }],
      }),
    },
    {
      file: "02-average-cost-by-operation",
      svg: barChart({
        title: "Average Transaction Cost by Operation",
        subtitle: `cost = gasUsed × effective gas price (${s.deployment.gasPriceGwei} gwei) · simulated local test ETH · ${runs}`,
        xLabel: "Banking operation",
        yLabel: "Transaction cost (µETH = 10⁻⁶ ETH)",
        categories: OP_LABELS,
        series: [{ name: "Average cost", color: NAVY, values: op("costEth").map((v) => v * 1e6) }],
        format: (v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }),
      }),
    },
    {
      file: "03-average-latency-by-operation",
      svg: barChart({
        title: "Average Transaction Latency by Operation",
        subtitle: `latency = eth_sendRawTransaction submission → receipt available · automine · ${runs}`,
        xLabel: "Banking operation",
        yLabel: "Latency (ms)",
        categories: OP_LABELS,
        series: [
          { name: "Average", color: BLUE, values: op("latencyMs") },
          { name: "p95", color: SLATE, values: op("latencyMs", "p95") },
        ],
        format: (v) => v.toFixed(1),
      }),
    },
    {
      file: "04-load-vs-throughput",
      svg: lineChart({
        title: "Transaction Load vs Throughput",
        subtitle: `TPS = completed transactions / elapsed seconds · mixed workload · ${reps}`,
        xLabel: "Transaction load (number of transactions)",
        yLabel: "Throughput (transactions per second)",
        categories: loads,
        series: [
          { name: "Mean TPS", color: GREEN, values: sc("tps") },
          { name: "Median TPS", color: SLATE, values: sc("tps", "p50"), dashed: true },
        ],
        format: (v) => v.toFixed(1),
      }),
    },
    {
      file: "05-load-vs-latency",
      svg: lineChart({
        title: "Transaction Load vs Average Latency",
        subtitle: `submission → receipt under concurrent load · ${reps}`,
        xLabel: "Transaction load (number of transactions)",
        yLabel: "Latency (ms)",
        categories: loads,
        series: [
          { name: "Average latency", color: BLUE, values: sc("latencyMsAvg") },
          { name: "p95 latency", color: SLATE, values: sc("latencyMsP95"), dashed: true },
        ],
        format: (v) => v.toFixed(1),
      }),
    },
    {
      file: "06-load-vs-cpu",
      svg: lineChart({
        title: "Transaction Load vs CPU Usage (Hardhat node process)",
        subtitle: `per-process CPU, % of one logical core (÷ ${s.resources.logicalCpus} for whole machine) · ${reps}`,
        xLabel: "Transaction load (number of transactions)",
        yLabel: "CPU usage (% of one core)",
        categories: loads,
        series: [
          { name: "Average CPU", color: AMBER, values: sc("cpuCorePctAvg") },
          { name: "Peak CPU", color: SLATE, values: sc("cpuCorePctPeak", "max"), dashed: true },
        ],
        format: (v) => v.toFixed(0),
      }),
    },
    {
      file: "07-load-vs-memory",
      svg: lineChart({
        title: "Transaction Load vs Memory Usage (Hardhat node process)",
        subtitle: `node working set · baseline = fresh node after setup and warm-up · ${s.config.repetitions} repetitions per load`,
        xLabel: "Transaction load (number of transactions)",
        yLabel: "Memory (MB)",
        categories: loads,
        series: [
          { name: "Average memory", color: NAVY, values: sc("memoryMBAvg") },
          { name: "Peak memory", color: SLATE, values: sc("memoryMBPeak", "max"), dashed: true },
          { name: "Fresh-node baseline", color: AMBER, values: s.scalability.map((r) => r.memoryMBBaseline), dashed: true },
        ],
        format: (v) => v.toFixed(0),
      }),
    },
    {
      file: "08-confirmation-time",
      svg: barChart({
        title: "Block Confirmation Time",
        subtitle: `automine vs ${s.confirmation.interval.blockIntervalTargetMs} ms interval mining · local Hardhat chain (not Ethereum mainnet)`,
        xLabel: "Mining mode / confirmations",
        yLabel: "Time from submission (ms)",
        categories: ["Automine · 1 conf.", "Interval · 1 conf.", "Interval · 3 conf."],
        series: [
          {
            name: "Average",
            color: BLUE,
            values: [
              s.confirmation.automine.firstConfirmationMs.avg,
              s.confirmation.interval.firstConfirmationMs.avg,
              s.confirmation.interval.threeConfirmationsMs.avg,
            ],
          },
        ],
        format: (v) => v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 1 : 0 }),
      }),
    },
  ];
}

/** Writes SVG (and PNG when @resvg/resvg-js is available) charts; returns the list of files written. */
function generateCharts(dir, summary) {
  fs.mkdirSync(dir, { recursive: true });
  let Resvg = null;
  try {
    ({ Resvg } = require("@resvg/resvg-js"));
  } catch {
    /* PNG export optional */
  }
  const written = [];
  for (const { file, svg } of chartSpecs(summary)) {
    fs.writeFileSync(path.join(dir, `${file}.svg`), svg);
    written.push(`${file}.svg`);
    if (Resvg) {
      const png = new Resvg(svg, { fitTo: { mode: "zoom", value: 2 }, font: { loadSystemFonts: true, defaultFontFamily: "Segoe UI" } }).render().asPng();
      fs.writeFileSync(path.join(dir, `${file}.png`), png);
      written.push(`${file}.png`);
    }
  }
  return written;
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..", "..");
  const summaryFile = path.join(root, "performance-results", "json", "summary.json");
  if (!fs.existsSync(summaryFile)) {
    console.error("No benchmark results found. Run `a3 benchmark` first.");
    process.exit(1);
  }
  const files = generateCharts(path.join(root, "performance-results", "charts"), JSON.parse(fs.readFileSync(summaryFile, "utf8")));
  console.log(`Generated ${files.length} chart files in performance-results/charts`);
}

module.exports = { generateCharts };
