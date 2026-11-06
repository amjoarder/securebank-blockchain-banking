import { Link } from "react-router-dom";
import { AlertTriangle, Ban, PlugZap, ServerOff, ShieldAlert, UserPlus } from "lucide-react";
import { useBank } from "../context/BankContext";
import { ACCOUNT_STATUS } from "../lib/format";
import { Button, Spinner } from "./ui";

const CHAIN_STATES = {
  "config-error": {
    icon: ServerOff,
    title: "SecureBank server not reachable",
    body: "The web server could not provide the network configuration. Start the project with",
    command: "a3 demo",
  },
  "node-offline": {
    icon: PlugZap,
    title: "Blockchain node unavailable",
    body: "The Assignment 3 Hardhat node (port 8603) is not running. Start everything with",
    command: "a3 demo",
  },
  "wrong-network": {
    icon: AlertTriangle,
    title: "Unsupported network",
    body: "The node on port 8603 is not the Assignment 3 chain (chainId 31303). Check config/network.json, then run",
    command: "a3 demo",
  },
  "not-deployed": {
    icon: Ban,
    title: "SecureBank contract not deployed",
    body: "The blockchain is running but no SecureBank contract exists on it. Deploy and seed with",
    command: "a3 reset",
  },
};

function Blocker({ icon: Icon, tone = "amber", title, children }) {
  const tones = { amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", blue: "bg-brand-50 text-brand-700" };
  return (
    <div className="card mx-auto mt-6 max-w-xl p-8 text-center">
      <div className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${tones[tone]}`}>
        <Icon className="size-6" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 text-sm text-slate-600">{children}</div>
    </div>
  );
}

/** Renders children only when the chain is reachable, correct and has the contract deployed. */
export function RequireChain({ children }) {
  const { status } = useBank();
  if (status === "loading") return <Spinner label="Connecting to the Assignment 3 blockchain…" />;
  const state = CHAIN_STATES[status];
  if (state) {
    return (
      <Blocker icon={state.icon} title={state.title}>
        <p>
          {state.body} <code className="mono rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">{state.command}</code>
        </p>
        <p className="mt-2 text-xs text-slate-400">This page reconnects automatically every 2 seconds.</p>
      </Blocker>
    );
  }
  return children;
}

/** Customer-only pages: handles admin, unregistered, no-account and suspended states. */
export function RequireCustomer({ children, allowSuspended = false }) {
  const { profile, isAdmin, activeAddress } = useBank();
  if (!activeAddress) return <Blocker icon={UserPlus} tone="blue" title="Select an account">Choose a local demo account from the account menu in the top-right corner.</Blocker>;
  if (isAdmin) {
    return (
      <Blocker icon={ShieldAlert} tone="blue" title="Administrator account selected">
        <p>The administrator cannot hold a customer account (enforced by the contract).</p>
        <p className="mt-1">Switch to a customer such as Alice, or open the admin dashboard.</p>
        <Link to="/admin" className="mt-4 inline-block">
          <Button variant="secondary">Open admin dashboard</Button>
        </Link>
      </Blocker>
    );
  }
  if (!profile.loaded) return <Spinner label="Reading customer record from the contract…" />;
  if (!profile.registered || !profile.hasAccount) {
    return (
      <Blocker icon={UserPlus} tone="blue" title={profile.registered ? "Open your banking account" : "Customer not registered"}>
        <p>
          {profile.registered
            ? "You are a registered customer but have not opened an account yet."
            : "This wallet address is not registered with SecureBank yet."}
        </p>
        <Link to="/onboarding" className="mt-4 inline-block">
          <Button>{profile.registered ? "Open account" : "Register now"}</Button>
        </Link>
      </Blocker>
    );
  }
  if (!allowSuspended && ACCOUNT_STATUS[profile.accountStatus] === "Suspended") {
    return (
      <Blocker icon={Ban} tone="red" title="Account suspended">
        This account has been suspended by the administrator. Deposits, withdrawals and transfers are blocked by the smart
        contract until it is reactivated.
      </Blocker>
    );
  }
  return children;
}
