import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useBank } from "../context/BankContext";
import { fetchTxHashes, toTxRecord } from "../lib/chain";
import { TX_TYPES, formatSBC } from "../lib/format";
import { RequireChain, RequireCustomer } from "../components/StatusGuards";
import TransactionTable from "../components/TransactionTable";
import { Button, PageHeader, SectionCard, Spinner, StatCard } from "../components/ui";

const PAGE_SIZE = 15;
const FILTERS = ["All", ...TX_TYPES];

/** Loads the caller's complete history from getMyTransactions() in pages of 100. */
async function loadAll(viewContract) {
  const total = Number(await viewContract.getMyTransactionCount());
  const rows = [];
  for (let offset = 0; offset < total; offset += 100) {
    rows.push(...(await viewContract.getMyTransactions(offset, 100)).map(toTxRecord));
  }
  return rows;
}

function toCsv(rows, hashes) {
  const header = "tx_id,type,from,to,amount_sbc,block,timestamp_iso,tx_hash";
  const lines = rows.map((t) =>
    [
      t.id,
      TX_TYPES[t.txType],
      t.from ?? "CASH",
      t.to ?? "CASH",
      formatSBC(t.amount, { symbol: false }).replace(/,/g, ""),
      t.blockNumber,
      new Date(t.timestamp * 1000).toISOString(),
      hashes.get(t.id) ?? "",
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

function HistoryContent() {
  const { viewContract, readContract, deployment, activeAddress, blockNumber, profile } = useBank();
  const [rows, setRows] = useState(null);
  const [hashes, setHashes] = useState(new Map());
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadAll(viewContract), fetchTxHashes(readContract, deployment.blockNumber, activeAddress)])
      .then(([r, h]) => {
        if (!cancelled) {
          setRows(r);
          setHashes(h);
        }
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [viewContract, readContract, deployment, activeAddress, blockNumber]);

  useEffect(() => setPage(0), [filter, activeAddress]);

  const summary = useMemo(() => {
    if (!rows) return null;
    let incoming = 0n;
    let outgoing = 0n;
    for (const t of rows) {
      if (t.to === activeAddress) incoming += t.amount;
      if (t.from === activeAddress) outgoing += t.amount;
    }
    return { incoming, outgoing };
  }, [rows, activeAddress]);

  if (!rows) return <Spinner label="Reading transaction history from the contract…" />;

  const filtered = filter === "All" ? rows : rows.filter((t) => TX_TYPES[t.txType] === filter);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const download = () => {
    const blob = new Blob([toCsv(rows, hashes)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `securebank-${profile.accountNumber}-history.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Transactions" value={rows.length} hint="Stored on-chain for this account" />
        <StatCard label="Total money in" value={formatSBC(summary.incoming)} hint="Deposits + transfers received" />
        <StatCard label="Total money out" value={formatSBC(summary.outgoing)} hint="Withdrawals + transfers sent" />
      </div>

      <SectionCard
        title="Transaction history"
        description="Immutable records from getMyTransactions(); hashes resolved from contract events. Click a row for its receipt."
        bodyClass=""
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${filter === f ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={download} disabled={!rows.length}>
              <Download className="size-3.5" /> CSV
            </Button>
          </div>
        }
      >
        <TransactionTable rows={visible} hashes={hashes} perspective={activeAddress} emptyText={filter === "All" ? "No transactions yet." : `No ${filter.toLowerCase()} transactions.`} />
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
            <span>
              Page {page + 1} of {pages} · {filtered.length} records
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}

export default function History() {
  return (
    <>
      <PageHeader title="Transaction history" description="Every deposit, withdrawal and transfer involving your account." />
      <RequireChain>
        <RequireCustomer allowSuspended>
          <HistoryContent />
        </RequireCustomer>
      </RequireChain>
    </>
  );
}
