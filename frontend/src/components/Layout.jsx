import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Gauge,
  History,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import { useBank } from "../context/BankContext";
import { useToast } from "../context/ToastContext";
import AccountSwitcher from "./AccountSwitcher";
import Logo from "./Logo";

const NAV = [
  { section: "Banking" },
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/deposit", label: "Deposit", icon: ArrowDownToLine },
  { to: "/withdraw", label: "Withdraw", icon: ArrowUpFromLine },
  { to: "/transfer", label: "Transfer", icon: ArrowLeftRight },
  { to: "/history", label: "Transactions", icon: History },
  { section: "Operations" },
  { to: "/admin", label: "Admin dashboard", icon: ShieldCheck },
  { to: "/performance", label: "Performance", icon: Gauge },
];

function NetworkPill() {
  const { status, blockNumber, network } = useBank();
  const ok = status === "ready";
  const label = {
    loading: "Connecting…",
    ready: `Block #${blockNumber ?? "…"}`,
    "not-deployed": "Contract missing",
    "wrong-network": "Wrong network",
  }[status] ?? "Node offline";
  return (
    <div className="flex items-center gap-2 rounded-lg bg-navy-800/70 px-3 py-2 text-xs text-slate-300">
      <span className={`size-2 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
      <div className="min-w-0">
        <p className="font-medium text-white">{label}</p>
        <p className="truncate">{network ? `chainId ${network.chainId} · port ${network.rpcPort}` : "Assignment 3 local chain"}</p>
      </div>
    </div>
  );
}

/** Optional MetaMask mode only: the wallet is on another chain. Switching happens only on click. */
function WalletBanner() {
  const { walletIssue, metaMask, network, switchMetaMaskNetwork } = useBank();
  const toast = useToast();
  if (walletIssue !== "metamask-wrong-network") return null;
  const onSwitch = () => switchMetaMaskNetwork().catch((err) => toast("error", "MetaMask", err?.message ?? String(err)));
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
      <span>
        MetaMask is connected to chainId <strong>{metaMask.chainId}</strong>. SecureBank runs on the Assignment 3 chain (chainId{" "}
        <strong>{network.chainId}</strong>). Transactions are blocked until you switch.
      </span>
      <button onClick={onSwitch} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
        Switch MetaMask network
      </button>
    </div>
  );
}

function Sidebar({ onNavigate }) {
  return (
    <div className="flex h-full flex-col bg-navy-900 px-3 py-4">
      <Link to="/" className="mb-6 px-2" onClick={onNavigate}>
        <Logo dark />
      </Link>
      <nav className="flex-1 space-y-0.5">
        {NAV.map((item) =>
          item.section ? (
            <p key={item.section} className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              {item.section}
            </p>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-navy-700 text-white" : "text-slate-300 hover:bg-navy-800 hover:text-white"
                }`
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          )
        )}
      </nav>
      <NetworkPill />
      <p className="mt-3 px-2 text-[11px] leading-snug text-slate-500">
        Educational prototype · simulated SBC credits · not a real bank
      </p>
    </div>
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block print:hidden">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 print:hidden">
        <div className="flex items-center gap-3">
          <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <span className="lg:hidden">
            <Logo />
          </span>
        </div>
        <AccountSwitcher />
      </header>

      <main key={pathname} className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">
        <WalletBanner />
        <Outlet />
      </main>
    </div>
  );
}
