import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Blocks,
  Code2,
  FileCheck2,
  Gauge,
  History,
  Landmark,
  Lock,
  MonitorSmartphone,
  ShieldCheck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useBank } from "../context/BankContext";
import { formatNumber, formatSBC, shortAddress } from "../lib/format";
import Logo from "../components/Logo";
import { Button } from "../components/ui";

const FEATURES = [
  { icon: UserPlus, title: "Customer registration & accounts", text: "Wallet-based customer identities and one banking account per customer, with duplicate protection." },
  { icon: Wallet, title: "Deposits, withdrawals, transfers", text: "Every balance change is executed by the SecureBank smart contract — the frontend cannot bypass its rules." },
  { icon: History, title: "Immutable transaction history", text: "Each operation is stored on-chain with a sequential ID, block number and timestamp, and emitted as an event." },
  { icon: FileCheck2, title: "Verifiable receipts", text: "Receipts combine the on-chain record with the blockchain transaction hash, block and gas used." },
  { icon: ShieldCheck, title: "Administrator controls", text: "onlyAdmin-protected dashboard to monitor customers and transactions and to suspend or reactivate accounts." },
  { icon: Gauge, title: "Measured performance", text: "Deployment cost, gas, latency, confirmation time, throughput, CPU and memory from real benchmark runs." },
];

const FLOW = [
  { icon: MonitorSmartphone, title: "React UI", text: "Forms, dashboards, receipts" },
  { icon: Code2, title: "ethers.js", text: "Encodes calls, signs & sends" },
  { icon: Lock, title: "SecureBank.sol", text: "Validates rules, updates state" },
  { icon: Blocks, title: "Hardhat chain", text: "Mines blocks, stores history" },
];

function LiveStatus() {
  const { status, network, deployment, blockNumber, readContract } = useBank();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!readContract) return;
    readContract.getStats().then(setStats, () => setStats(null));
  }, [readContract, blockNumber]);

  const ready = status === "ready";
  const rows = [
    ["Network", network ? `${network.networkName}` : "—"],
    ["Chain ID / RPC port", network ? `${network.chainId} / ${network.rpcPort}` : "—"],
    ["SecureBank contract", ready ? shortAddress(deployment.address, 6) : "—"],
    ["Latest block", ready ? `#${blockNumber}` : "—"],
    ["Customers · accounts", stats ? `${stats[0]} · ${stats[1]}` : "—"],
    ["Transactions recorded", stats ? formatNumber(stats[2]) : "—"],
    ["Total SBC held", stats ? formatSBC(stats[7]) : "—"],
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <p className="text-sm font-semibold text-slate-900">Live system status</p>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ready ? "text-emerald-700" : "text-amber-700"}`}>
          <span className={`size-2 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} />
          {ready ? "Connected" : status === "loading" ? "Connecting…" : "Not ready"}
        </span>
      </div>
      <dl className="divide-y divide-slate-100 px-5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
            <dt className="text-slate-500">{k}</dt>
            <dd className="truncate text-right font-medium text-slate-900 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-xs text-slate-500">
        Values are read directly from the SecureBank contract on the local chain.
      </p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link to="/performance" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:block">
              Performance
            </Link>
            <Link to="/admin" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:block">
              Admin
            </Link>
            <Link to="/app">
              <Button size="sm">Open banking app</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              <Landmark className="size-3.5 text-brand-600" /> MSc Blockchain Technology & Application · Assignment 3
            </p>
            <h1 className="mt-5 text-3xl leading-tight font-semibold tracking-tight text-slate-900 sm:text-[2.6rem]">
              Blockchain-based secure banking with transparent, tamper-evident records
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
              SecureBank replaces a centralised transaction database with a Solidity smart contract. Customer accounts, balances
              and every deposit, withdrawal and transfer are enforced and recorded on-chain, so the history can be verified and
              cannot be silently edited.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/app">
                <Button>
                  Open banking app <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link to="/performance">
                <Button variant="secondary">View performance results</Button>
              </Link>
            </div>
            <p className="mt-6 text-xs text-slate-500">
              Educational prototype. Balances are in <strong className="font-semibold text-slate-700">SBC — SecureBank Credits</strong>,
              a simulated unit on a local development blockchain. No real money or real wallets are involved.
            </p>
          </div>
          <LiveStatus />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">What the system provides</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-brand-50">
                <Icon className="size-4.5 text-brand-700" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-lg font-semibold text-slate-900">How a transaction flows</h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="card flex items-center gap-3 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white">
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {i + 1}. {title}
                  </p>
                  <p className="text-xs text-slate-500">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6">
          SecureBank · Assignment 3 · Local chainId 31303 · Not a real banking service.
        </p>
      </footer>
    </div>
  );
}
