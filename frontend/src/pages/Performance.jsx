import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Clock, Coins, Cpu, FileDown, Flame, Gauge, MemoryStick, Timer } from "lucide-react";
import { formatNumber } from "../lib/format";
import { EmptyState, PageHeader, SectionCard, Spinner, StatCard } from "../components/ui";

const COLORS = { blue: "#2463eb", navy: "#12264a", green: "#059669", amber: "#d97706", slate: "#94a3b8" };
const OPS = [
  ["deposit", "Deposit"],
  ["withdrawal", "Withdrawal"],
  ["transfer", "Transfer"],
];

const n = (v, d = 1) => (v == null ? "—" : formatNumber(v, d));
const eth = (v) => (v == null ? "—" : `${Number(v).toFixed(9)} ETH`);

function ChartCard({ title, description, children }) {
  return (
    <SectionCard title={title} description={description}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

const axis = { fontSize: 12, fill: "#64748b" };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />;

function OperationCharts({ s }) {
  const data = OPS.map(([key, label]) => ({
    name: label,
    gas: s.operations[key].gasUsed.avg,
    latency: s.operations[key].latencyMs.avg,
    p95: s.operations[key].latencyMs.p95,
  }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ChartCard title="Average gas by operation" description={`${s.config.opRuns} runs each · gas units`}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          {grid}
          <XAxis dataKey="name" tick={axis} />
          <YAxis tick={axis} tickFormatter={(v) => `${v / 1000}k`} />
          <Tooltip formatter={(v) => [`${formatNumber(v)} gas`, "Average gas"]} />
          <Bar dataKey="gas" fill={COLORS.blue} radius={[4, 4, 0, 0]} maxBarSize={70} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Latency by operation" description="submission → receipt · milliseconds">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="name" tick={axis} />
          <YAxis tick={axis} />
          <Tooltip formatter={(v, k) => [`${n(v, 2)} ms`, k === "p95" ? "p95" : "Average"]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="latency" name="Average" fill={COLORS.blue} radius={[4, 4, 0, 0]} maxBarSize={50} />
          <Bar dataKey="p95" name="p95" fill={COLORS.slate} radius={[4, 4, 0, 0]} maxBarSize={50} />
        </BarChart>
      </ChartCard>
    </div>
  );
}

function ScalabilityCharts({ s }) {
  const data = s.scalability.map((r) => ({
    load: String(r.load),
    tps: r.tps.avg,
    tpsMedian: r.tps.p50,
    latency: r.latencyMsAvg.avg,
    p95: r.latencyMsP95.avg,
    cpu: r.cpuCorePctAvg.avg,
    cpuPeak: r.cpuCorePctPeak.max,
    mem: r.memoryMBAvg.avg,
    memPeak: r.memoryMBPeak.max,
    memBase: r.memoryMBBaseline,
  }));
  const line = (key, name, color, dashed) => (
    <Line type="monotone" dataKey={key} name={name} stroke={color} strokeWidth={2.2} strokeDasharray={dashed ? "5 4" : undefined} dot={{ r: 3 }} />
  );
  const common = { data, margin: { top: 10, right: 16, left: 0, bottom: 0 } };
  const xAxis = <XAxis dataKey="load" tick={axis} label={{ value: "transactions in load", position: "insideBottom", offset: -2, fontSize: 11, fill: "#94a3b8" }} height={36} />;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ChartCard title="Load vs throughput" description="transactions per second (mean and median of repetitions)">
        <LineChart {...common}>
          {grid}
          {xAxis}
          <YAxis tick={axis} />
          <Tooltip formatter={(v, k) => [`${n(v)} TPS`, k]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {line("tps", "Mean", COLORS.green)}
          {line("tpsMedian", "Median", COLORS.slate, true)}
        </LineChart>
      </ChartCard>
      <ChartCard title="Load vs latency" description="milliseconds, submission → receipt">
        <LineChart {...common}>
          {grid}
          {xAxis}
          <YAxis tick={axis} />
          <Tooltip formatter={(v, k) => [`${n(v, 2)} ms`, k]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {line("latency", "Average", COLORS.blue)}
          {line("p95", "p95", COLORS.slate, true)}
        </LineChart>
      </ChartCard>
      <ChartCard title="Load vs CPU (Hardhat node)" description="% of one logical core, per-process">
        <LineChart {...common}>
          {grid}
          {xAxis}
          <YAxis tick={axis} />
          <Tooltip formatter={(v, k) => [`${n(v)} %`, k]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {line("cpu", "Average", COLORS.amber)}
          {line("cpuPeak", "Peak", COLORS.slate, true)}
        </LineChart>
      </ChartCard>
      <ChartCard title="Load vs memory (Hardhat node)" description="working set, MB">
        <LineChart {...common}>
          {grid}
          {xAxis}
          <YAxis tick={axis} domain={["auto", "auto"]} />
          <Tooltip formatter={(v, k) => [`${n(v)} MB`, k]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {line("mem", "Average", COLORS.navy)}
          {line("memPeak", "Peak", COLORS.slate, true)}
          {line("memBase", "Fresh-node baseline", COLORS.amber, true)}
        </LineChart>
      </ChartCard>
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/70">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`th ${i ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i} className={`td tabular-nums ${i ? "text-right" : "font-medium text-slate-900"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Results({ s }) {
  const c = s.confirmation;
  const peakMem = Math.max(...s.scalability.map((r) => r.memoryMBPeak.max));
  const env = s.environment;
  const files = s.files ?? {};

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2 text-xs text-slate-600">
        {[
          `Generated ${new Date(s.generatedAt).toLocaleString("en-GB")}`,
          `${s.mode} run · ${n(s.durationSeconds, 0)} s`,
          `${env.cpu} · ${env.logicalCpus} logical CPUs · ${n(env.totalMemoryGB)} GB RAM`,
          `Node ${env.node} · Hardhat ${env.hardhat} · solc ${env.solc}`,
          `chainId ${env.chainId} · gas price ${s.deployment.gasPriceGwei} gwei`,
        ].map((t) => (
          <span key={t} className="rounded-md border border-slate-200 bg-white px-2 py-1">
            {t}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Deployment gas" value={`${formatNumber(s.deployment.gasUsed.avg)}`} hint={eth(s.deployment.costEth.avg)} icon={Flame} />
        <StatCard label="Avg transaction gas" value={formatNumber(s.overall.gasUsed.avg)} hint={`${s.overall.transactions} measured transactions`} icon={Activity} />
        <StatCard label="Avg transaction cost" value={eth(s.overall.costEth.avg)} hint="simulated local test ETH" icon={Coins} />
        <StatCard label="Avg latency" value={`${n(s.overall.latencyMs.avg, 2)} ms`} hint={`p95 ${n(s.overall.latencyMs.p95, 2)} ms`} icon={Timer} />
        <StatCard label="Peak throughput" value={`${n(s.throughput.peakTps)} TPS`} hint={`mean ${n(s.throughput.meanTps)} TPS across loads`} icon={Gauge} />
        <StatCard label="Confirmation (automine)" value={`${n(c.automine.firstConfirmationMs.avg, 2)} ms`} hint="1 tx per block, mined on demand" icon={Clock} />
        <StatCard
          label={`Confirmation (${c.interval.blockIntervalTargetMs / 1000}s blocks)`}
          value={`${n(c.interval.firstConfirmationMs.avg, 0)} ms`}
          hint={`3 confirmations: ${n(c.interval.threeConfirmationsMs.avg, 0)} ms`}
          icon={Clock}
        />
        <StatCard label="Node memory peak" value={`${n(peakMem)} MB`} hint={`CPU peak ${n(Math.max(...s.scalability.map((r) => r.cpuCorePctPeak.max)), 0)} % of a core`} icon={MemoryStick} />
      </div>

      <SectionCard className="mt-5" title="Banking operations" description={`${s.config.opRuns} sequential runs per operation · latency = submission → receipt`} bodyClass="">
        <Table
          head={["Operation", "Success", "Avg gas", "Min–max gas", "Avg cost (ETH)", "Avg latency", "p95 latency", "Std dev", "Client prep"]}
          rows={OPS.map(([key, label]) => {
            const o = s.operations[key];
            return [
              label,
              `${o.successes}/${o.runs}`,
              formatNumber(o.gasUsed.avg),
              `${formatNumber(o.gasUsed.min)}–${formatNumber(o.gasUsed.max)}`,
              Number(o.costEth.avg).toFixed(9),
              `${n(o.latencyMs.avg, 2)} ms`,
              `${n(o.latencyMs.p95, 2)} ms`,
              `${n(o.latencyMs.std, 2)} ms`,
              `${n(o.prepMs.avg, 2)} ms`,
            ];
          })}
        />
      </SectionCard>

      <div className="mt-5">
        <OperationCharts s={s} />
      </div>

      <SectionCard className="mt-5" title="Block confirmation time" description="Local Hardhat behaviour — not representative of Ethereum mainnet (~12 s slots)." bodyClass="">
        <Table
          head={["Mining mode", "Samples", "1 confirmation (avg)", "3 confirmations (avg)", "Observed block interval"]}
          rows={[
            ["Automine (1 tx per block)", c.automine.samples, `${n(c.automine.firstConfirmationMs.avg, 2)} ms`, "—", "on demand"],
            [
              `Interval mining (${c.interval.blockIntervalTargetMs} ms)`,
              c.interval.samples,
              `${n(c.interval.firstConfirmationMs.avg, 0)} ms`,
              `${n(c.interval.threeConfirmationsMs.avg, 0)} ms`,
              `${n(c.interval.observedBlockIntervalMs.avg, 0)} ms`,
            ],
          ]}
        />
      </SectionCard>

      <SectionCard className="mt-5" title="Scalability under different loads" description={`fresh node per load level · ${s.config.repetitions} repetitions each · ${s.scalability.at(-1).senders} parallel senders · mixed 40 % deposit / 40 % transfer / 20 % withdrawal`} bodyClass="">
        <Table
          head={["Load", "Completed", "Failed", "TPS (mean ± sd)", "TPS median", "Avg latency", "p95 latency", "CPU avg (% core)", "CPU peak", "Memory peak", "Memory growth"]}
          rows={s.scalability.map((r) => [
            `${r.load} tx`,
            r.completed,
            r.failed,
            `${n(r.tps.avg)} ± ${n(r.tps.std)}`,
            n(r.tps.p50),
            `${n(r.latencyMsAvg.avg, 2)} ms`,
            `${n(r.latencyMsP95.avg, 2)} ms`,
            `${n(r.cpuCorePctAvg.avg)} %`,
            `${n(r.cpuCorePctPeak.max)} %`,
            `${n(r.memoryMBPeak.max)} MB`,
            `+${n(r.memoryMBGrowth)} MB`,
          ])}
        />
      </SectionCard>

      <div className="mt-5">
        <ScalabilityCharts s={s} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <SectionCard title="Resource usage by phase" description={s.resources.target} bodyClass="">
          <Table
            head={["Phase", "Samples", "CPU avg", "CPU peak", "Mem avg", "Mem peak"]}
            rows={[
              ["Idle", s.resources.idle],
              ["Operation benchmark", s.resources.operations],
              ["Load tests", s.resources.load],
              ["Whole run", s.resources.wholeRun],
            ].map(([name, r]) => [name, r.samples, `${n(r.cpuCorePctAvg)} %`, `${n(r.cpuCorePctPeak)} %`, `${n(r.memoryMBAvg)} MB`, `${n(r.memoryMBPeak)} MB`])}
          />
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <Cpu className="mr-1 inline size-3.5" />
            {s.resources.method}. CPU is expressed as % of one logical core; divide by {s.resources.logicalCpus} for % of the whole machine.
          </p>
        </SectionCard>
        <SectionCard title="Evidence files" description="Served live from performance-results/">
          <ul className="space-y-1.5 text-sm">
            {(files.csv ?? []).map((f) => (
              <li key={f}>
                <a className="inline-flex items-center gap-1.5 text-brand-700 hover:underline" href={`/runtime/perf/csv/${f}`} download>
                  <FileDown className="size-3.5" /> csv/{f}
                </a>
              </li>
            ))}
            {(files.charts ?? [])
              .filter((f) => f.endsWith(".png"))
              .map((f) => (
                <li key={f}>
                  <a className="inline-flex items-center gap-1.5 text-brand-700 hover:underline" href={`/runtime/perf/charts/${f}`} target="_blank" rel="noreferrer">
                    <FileDown className="size-3.5" /> charts/{f}
                  </a>
                </li>
              ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}

export default function Performance() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    fetch("/runtime/perf/json/summary.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((summary) => setState({ summary }))
      .catch(() => setState({ summary: null }));
  }, []);

  return (
    <>
      <PageHeader
        title="Performance evaluation"
        description="Measured results from the automated benchmark (npm run benchmark) on a dedicated local Hardhat chain. Nothing on this page is estimated or hard-coded."
      />
      {state.loading ? (
        <Spinner label="Loading benchmark results…" />
      ) : state.summary ? (
        <Results s={state.summary} />
      ) : (
        <div className="card">
          <EmptyState icon={Gauge} title="Benchmark not run yet">
            <p>No results were found in performance-results/. Run the benchmark from the project folder:</p>
            <code className="mono mt-3 inline-block rounded bg-slate-100 px-2 py-1 text-slate-800">a3 benchmark</code>
            <p className="mt-2 text-xs">It takes a few minutes and uses its own temporary chain on port 8613.</p>
          </EmptyState>
        </div>
      )}
    </>
  );
}
