import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, RefreshCw, ShieldCheck } from "lucide-react";
import { useBank } from "../context/BankContext";
import { fetchTxHashes, toTxRecord } from "../lib/chain";
import { describeError } from "../lib/errors";
import { ACCOUNT_STATUS, formatDateTime, formatSBC } from "../lib/format";
import { RequireChain, RequireCustomer } from "../components/StatusGuards";
import TransactionTable from "../components/TransactionTable";
import { Badge, Button, CopyButton, DetailRow, PageHeader, SectionCard } from "../components/ui";

function BalanceCard() {
  const { profile, viewContract, blockNumber } = useBank();
  const [inquiry, setInquiry] = useState(null);
  const [checking, setChecking] = useState(false);

  /** Balance inquiry: calls getMyBalance() as the customer (msg.sender), not the cached profile. */
  const verify = async () => {
    setChecking(true);
    try {
      const balance = await viewContract.getMyBalance();
      setInquiry({ balance, block: blockNumber, at: new Date() });
    } catch (err) {
      setInquiry({ error: describeError(err).message });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="rounded-xl bg-navy-900 p-6 text-white shadow-sm">
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Available balance</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{formatSBC(profile.balance, { symbol: false })}</p>
      <p className="mt-1 text-sm text-slate-400">SBC · SecureBank Credits (simulated)</p>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
        <button
          onClick={verify}
          disabled={checking}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15 disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} /> Balance inquiry (on-chain)
        </button>
        {inquiry && !inquiry.error && (
          <span className="text-xs text-slate-300">
            getMyBalance() → {formatSBC(inquiry.balance)} at block #{inquiry.block}
          </span>
        )}
        {inquiry?.error && <span className="text-xs text-red-300">{inquiry.error}</span>}
      </div>
    </div>
  );
}

function RecentActivity() {
  const { viewContract, readContract, deployment, activeAddress, blockNumber } = useBank();
  const [rows, setRows] = useState(null);
  const [hashes, setHashes] = useState(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [txs, map] = await Promise.all([
        viewContract.getMyTransactions(0, 5),
        fetchTxHashes(readContract, deployment.blockNumber, activeAddress),
      ]);
      if (!cancelled) {
        setRows(txs.map(toTxRecord));
        setHashes(map);
      }
    })().catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [viewContract, readContract, deployment, activeAddress, blockNumber]);

  return (
    <SectionCard
      title="Recent transactions"
      description="Latest 5 records from the contract. Click a row for its receipt."
      actions={
        <Link to="/history" className="text-sm font-medium text-brand-700 hover:underline">
          View all
        </Link>
      }
      bodyClass=""
    >
      {rows === null ? (
        <p className="px-5 py-8 text-sm text-slate-500">Loading…</p>
      ) : (
        <TransactionTable rows={rows} hashes={hashes} perspective={activeAddress} emptyText="No transactions yet — make your first deposit." />
      )}
    </SectionCard>
  );
}

function DashboardContent() {
  const { profile, activeAddress } = useBank();
  const suspended = ACCOUNT_STATUS[profile.accountStatus] === "Suspended";

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile.name}`}
        description="Your SecureBank account. Balances and history are read live from the smart contract."
        actions={
          <>
            <Link to="/deposit">
              <Button variant="secondary" disabled={suspended}>
                <ArrowDownToLine className="size-4" /> Deposit
              </Button>
            </Link>
            <Link to="/withdraw">
              <Button variant="secondary" disabled={suspended}>
                <ArrowUpFromLine className="size-4" /> Withdraw
              </Button>
            </Link>
            <Link to="/transfer">
              <Button disabled={suspended}>
                <ArrowLeftRight className="size-4" /> Transfer
              </Button>
            </Link>
          </>
        }
      />

      {suspended && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          This account is <strong>suspended</strong> by the administrator. The smart contract rejects deposits, withdrawals and
          transfers until it is reactivated. Your balance is preserved.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <BalanceCard />
        <SectionCard title="Account details">
          <dl className="-my-2.5 divide-y divide-slate-100">
            <DetailRow label="Account number">
              <span className="inline-flex items-center gap-2 font-medium tabular-nums">
                {profile.accountNumber.toString()} <CopyButton value={profile.accountNumber.toString()} />
              </span>
            </DetailRow>
            <DetailRow label="Status">
              <Badge tone={suspended ? "red" : "green"}>
                <ShieldCheck className="size-3" /> {ACCOUNT_STATUS[profile.accountStatus]}
              </Badge>
            </DetailRow>
            <DetailRow label="Customer ID">#{profile.customerId.toString()}</DetailRow>
            <DetailRow label="Wallet address" mono>
              <span className="inline-flex items-center gap-2">
                {activeAddress} <CopyButton value={activeAddress} />
              </span>
            </DetailRow>
            <DetailRow label="Account opened">{formatDateTime(profile.createdAt)}</DetailRow>
          </dl>
        </SectionCard>
      </div>

      <div className="mt-5">
        <RecentActivity />
      </div>
    </>
  );
}

export default function Dashboard() {
  return (
    <RequireChain>
      <RequireCustomer allowSuspended>
        <DashboardContent />
      </RequireCustomer>
    </RequireChain>
  );
}
