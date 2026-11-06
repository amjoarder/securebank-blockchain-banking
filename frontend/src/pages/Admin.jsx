import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Blocks,
  Coins,
  FileCode2,
  Landmark,
  Lock,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useBank } from "../context/BankContext";
import { useTxRunner } from "../hooks/useTxRunner";
import { fetchTxHashes, toTxRecord } from "../lib/chain";
import { describeError } from "../lib/errors";
import { ACCOUNT_STATUS, formatDateTime, formatNumber, formatSBC, shortAddress } from "../lib/format";
import { RequireChain } from "../components/StatusGuards";
import TransactionTable from "../components/TransactionTable";
import TxStatusPanel from "../components/TxStatusPanel";
import { Badge, Button, CopyButton, PageHeader, SectionCard, Spinner, StatCard } from "../components/ui";

const TX_PAGE = 50;

/** Everything on this page is read from the contract — nothing is hard-coded. */
function useAdminData() {
  const { readContract, viewContract, deployment, blockNumber } = useBank();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const stats = await readContract.getStats();
    const addresses = await viewContract.getCustomerAddresses(0, 1000);
    const customers = await Promise.all(
      addresses.map(async (address) => {
        const [c, a] = await Promise.all([readContract.getCustomer(address), readContract.getAccount(address)]);
        return {
          address,
          customerId: c.customerId.toString(),
          name: c.name,
          registeredAt: Number(c.registeredAt),
          accountNumber: Number(a.status) ? a.accountNumber.toString() : null,
          status: Number(a.status),
          balance: a.balance,
        };
      })
    );
    const [txs, hashes] = await Promise.all([
      viewContract.getAllTransactions(0, TX_PAGE),
      fetchTxHashes(readContract, deployment.blockNumber),
    ]);
    setData({ stats, customers, txs: txs.map(toTxRecord), hashes });
  }, [readContract, viewContract, deployment]);

  useEffect(() => {
    load().catch(() => setData((d) => d ?? { error: true }));
  }, [load, blockNumber]);

  return data;
}

function MixBar({ stats }) {
  const total = Number(stats[2]) || 1;
  const parts = [
    { label: "Deposits", value: Number(stats[3]), cls: "bg-emerald-500" },
    { label: "Withdrawals", value: Number(stats[4]), cls: "bg-amber-500" },
    { label: "Transfers", value: Number(stats[5]), cls: "bg-brand-600" },
  ];
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {parts.map((p) => (
          <div key={p.label} className={p.cls} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${p.cls}`} /> {p.label}: <strong className="text-slate-900">{p.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { network, contractAddress, blockNumber, adminAddress } = useBank();
  const data = useAdminData();
  const { tx, run, reset, busy } = useTxRunner();

  if (!data) return <Spinner label="Loading administration data from the contract…" />;
  if (data.error) return <p className="text-sm text-red-600">Could not load admin data from the contract.</p>;

  const [customers, accounts, txCount, deposits, withdrawals, transfers, volume, holdings] = data.stats;

  const setStatus = (row, suspend) =>
    run(
      `${suspend ? "Suspend" : "Reactivate"} account ${row.accountNumber}`,
      (c) => (suspend ? c.suspendAccount(BigInt(row.accountNumber)) : c.reactivateAccount(BigInt(row.accountNumber)))
    );

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Customers" value={formatNumber(customers)} icon={Users} />
        <StatCard label="Accounts" value={formatNumber(accounts)} icon={Wallet} />
        <StatCard label="Transactions" value={formatNumber(txCount)} icon={Receipt} />
        <StatCard label="SBC held by bank" value={formatSBC(holdings)} icon={Landmark} />
        <StatCard label="Deposits" value={formatNumber(deposits)} icon={ArrowDownToLine} />
        <StatCard label="Withdrawals" value={formatNumber(withdrawals)} icon={ArrowUpFromLine} />
        <StatCard label="Transfers" value={formatNumber(transfers)} icon={ArrowLeftRight} />
        <StatCard label="Total volume" value={formatSBC(volume)} icon={Coins} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Transaction mix" description="Share of recorded operations by type">
          <MixBar stats={data.stats} />
        </SectionCard>
        <SectionCard title="Network & contract">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-slate-500">
                <Blocks className="size-3.5" /> Latest block
              </dt>
              <dd className="font-medium tabular-nums">#{blockNumber}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Network</dt>
              <dd className="truncate font-medium">chainId {network.chainId} · port {network.rpcPort}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-slate-500">
                <FileCode2 className="size-3.5" /> Contract
              </dt>
              <dd className="mono flex items-center gap-1.5">
                {shortAddress(contractAddress, 6)} <CopyButton value={contractAddress} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Administrator</dt>
              <dd className="mono">{shortAddress(adminAddress, 6)}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <TxStatusPanel tx={tx} onReset={reset} />

      <SectionCard className="mt-5" title="Customers & accounts" description="getCustomerAddresses() + getCustomer() + getAccount()" bodyClass="">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="th">ID</th>
                <th className="th">Customer</th>
                <th className="th">Account no.</th>
                <th className="th text-right">Balance</th>
                <th className="th">Status</th>
                <th className="th">Registered</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.customers.map((c) => {
                const status = ACCOUNT_STATUS[c.status];
                return (
                  <tr key={c.address}>
                    <td className="td">#{c.customerId}</td>
                    <td className="td">
                      <span className="block font-medium text-slate-900">{c.name}</span>
                      <span className="mono text-xs text-slate-500">{shortAddress(c.address, 6)}</span>
                    </td>
                    <td className="td tabular-nums">{c.accountNumber ?? <span className="text-slate-400">No account</span>}</td>
                    <td className="td text-right font-medium tabular-nums">{c.accountNumber ? formatSBC(c.balance) : "—"}</td>
                    <td className="td">
                      {c.accountNumber ? <Badge tone={status === "Active" ? "green" : "red"}>{status}</Badge> : <Badge>Registered</Badge>}
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDateTime(c.registeredAt)}</td>
                    <td className="td text-right">
                      {c.accountNumber &&
                        (status === "Active" ? (
                          <Button variant="danger" size="sm" disabled={busy} onClick={() => setStatus(c, true)}>
                            Suspend
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setStatus(c, false)}>
                            Reactivate
                          </Button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!data.customers.length && <p className="px-5 py-8 text-center text-sm text-slate-500">No customers registered yet.</p>}
        </div>
      </SectionCard>

      <SectionCard
        className="mt-5"
        title="All transactions"
        description={`Latest ${Math.min(TX_PAGE, Number(txCount))} of ${txCount} · getAllTransactions() — click a row for its receipt`}
        bodyClass=""
      >
        <TransactionTable rows={data.txs} hashes={data.hashes} />
      </SectionCard>
    </>
  );
}

/** Shown to customers: explains the restriction and proves the contract enforces it. */
function AccessRestricted() {
  const { viewContract, demoAccounts, selectDemoAccount, activeLabel } = useBank();
  const [probe, setProbe] = useState(null);
  const admin = demoAccounts.find((a) => a.role === "admin");

  const testContract = async () => {
    try {
      await viewContract.getAllTransactions(0, 1);
      setProbe({ ok: true });
    } catch (err) {
      setProbe(describeError(err));
    }
  };

  return (
    <div className="card mx-auto max-w-2xl p-8">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-red-50">
          <Lock className="size-5 text-red-600" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Administrator access required</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            <strong>{activeLabel ?? "This account"}</strong> is not the SecureBank administrator. Admin functions are protected
            by the <code className="mono">onlyAdmin</code> modifier inside the smart contract, so hiding this page is not the
            real protection — the contract itself refuses the call.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={testContract}>
              Call getAllTransactions() as {activeLabel?.split(" ")[0] ?? "this user"}
            </Button>
            {admin && (
              <Button onClick={() => selectDemoAccount(admin.address)}>
                <ShieldCheck className="size-4" /> Switch to Administrator
              </Button>
            )}
          </div>
          {probe && (
            <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${probe.ok ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}>
              {probe.ok ? (
                "Unexpected: the call succeeded."
              ) : (
                <>
                  <strong>{probe.title}.</strong> {probe.message}
                  {probe.code && <span className="mt-1 block text-xs text-red-700">Custom error: {probe.code}()</span>}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { isAdmin, adminAddress } = useBank();
  return (
    <>
      <PageHeader title="Administrator dashboard" description="System-wide statistics, customers, accounts and transactions from the SecureBank contract." />
      <RequireChain>{!adminAddress ? <Spinner /> : isAdmin ? <AdminDashboard /> : <AccessRestricted />}</RequireChain>
    </>
  );
}
