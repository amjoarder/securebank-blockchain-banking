import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatEther, formatUnits } from "ethers";
import { ArrowLeft, BadgeCheck, Lock, Printer } from "lucide-react";
import { useBank } from "../context/BankContext";
import { toTxRecord } from "../lib/chain";
import { describeError } from "../lib/errors";
import { TX_TYPES, formatDateTime, formatSBC } from "../lib/format";
import { RequireChain } from "../components/StatusGuards";
import Logo from "../components/Logo";
import { TxTypeBadge } from "../components/TransactionTable";
import { Button, CopyButton, DetailRow, Spinner } from "../components/ui";

const EVENT_FOR_TYPE = ["Deposited", "Withdrawn", "Transferred"];

/**
 * Builds a receipt from three sources:
 *  1. the immutable on-chain record   → SecureBank.getTransaction(txId)
 *  2. the emitted event               → blockchain transaction hash
 *  3. the JSON-RPC transaction receipt → gas used, effective gas price, status
 */
function useReceipt(txId) {
  const { viewContract, readContract, provider, deployment } = useBank();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!viewContract) return; // active account not resolved yet
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      const record = toTxRecord(await viewContract.getTransaction(BigInt(txId)));
      const eventName = EVENT_FOR_TYPE[record.txType];
      const [log] = await readContract.queryFilter(readContract.filters[eventName](BigInt(txId)), deployment.blockNumber);
      const receipt = log ? await provider.getTransactionReceipt(log.transactionHash) : null;
      const accountOf = async (addr) => (addr ? (await readContract.getAccount(addr)).accountNumber.toString() : null);
      const [fromAccount, toAccount] = await Promise.all([accountOf(record.from), accountOf(record.to)]);
      if (!cancelled) setState({ record, receipt, fromAccount, toAccount });
    })().catch((err) => !cancelled && setState({ error: describeError(err) }));
    return () => {
      cancelled = true;
    };
  }, [txId, viewContract, readContract, provider, deployment]);

  return state;
}

function PartyValue({ address, account, fallback }) {
  const { labelFor } = useBank();
  if (!address) return <span className="text-slate-500">{fallback}</span>;
  return (
    <span>
      <span className="font-medium">{labelFor(address) ?? "Customer"}</span>
      {account && <span className="text-slate-500"> · Account {account}</span>}
      <span className="mono block text-slate-600">{address}</span>
    </span>
  );
}

function ReceiptContent() {
  const { txId } = useParams();
  const { network, contractAddress } = useBank();
  const { loading, error, record, receipt, fromAccount, toAccount } = useReceipt(txId);

  if (loading) return <Spinner label="Building receipt from on-chain data…" />;
  if (error) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <Lock className="mx-auto size-8 text-slate-400" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Receipt unavailable</h2>
        <p className="mt-2 text-sm text-slate-600">{error.message}</p>
        {error.code && <p className="mt-1 text-xs text-slate-500">Contract error: {error.code}()</p>}
      </div>
    );
  }

  const success = receipt?.status === 1;
  const feeWei = receipt ? receipt.gasUsed * receipt.gasPrice : null;

  return (
    <article className="card mx-auto max-w-3xl overflow-hidden print:border-0 print:shadow-none">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 sm:px-8">
        <Logo />
        <div className="text-right">
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Transaction receipt</p>
          <p className="mt-0.5 text-sm font-medium text-slate-900">Bank transaction #{record.id}</p>
        </div>
      </header>

      <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-6 text-center sm:px-8">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${success ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
          <BadgeCheck className="size-3.5" /> {success ? "SUCCESS · Confirmed on-chain" : "Status unavailable"}
        </span>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{formatSBC(record.amount)}</p>
        <div className="mt-2 flex justify-center">
          <TxTypeBadge type={record.txType} />
        </div>
      </div>

      <dl className="divide-y divide-slate-100 px-6 sm:px-8">
        <DetailRow label="Bank transaction ID">#{record.id}</DetailRow>
        <DetailRow label="Transaction type">{TX_TYPES[record.txType]}</DetailRow>
        <DetailRow label="From">
          <PartyValue address={record.from} account={fromAccount} fallback="Cash deposit (external)" />
        </DetailRow>
        <DetailRow label="To">
          <PartyValue address={record.to} account={toAccount} fallback="Cash withdrawal (external)" />
        </DetailRow>
        <DetailRow label="Amount">{formatSBC(record.amount)}</DetailRow>
        <DetailRow label="Timestamp">{formatDateTime(record.timestamp)} (block time)</DetailRow>
        <DetailRow label="Block number">#{record.blockNumber}</DetailRow>
        <DetailRow label="Blockchain tx hash" mono>
          {receipt ? (
            <span className="inline-flex items-center gap-2">
              {receipt.hash} <CopyButton value={receipt.hash} />
            </span>
          ) : (
            "—"
          )}
        </DetailRow>
        <DetailRow label="Gas used">{receipt ? `${receipt.gasUsed.toLocaleString()} gas` : "—"}</DetailRow>
        <DetailRow label="Effective gas price">{receipt ? `${formatUnits(receipt.gasPrice, "gwei")} gwei` : "—"}</DetailRow>
        <DetailRow label="Network fee">{feeWei != null ? `${formatEther(feeWei)} ETH (simulated local test ETH)` : "—"}</DetailRow>
        <DetailRow label="Network">
          {network.networkName} · chainId {network.chainId}
        </DetailRow>
        <DetailRow label="Contract address" mono>
          {contractAddress}
        </DetailRow>
      </dl>

      <footer className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-xs leading-relaxed text-slate-500 sm:px-8">
        Generated {new Date().toLocaleString("en-GB")} from immutable blockchain data. Verify by looking up the transaction hash on
        chainId {network.chainId}. SecureBank is an educational prototype; SBC credits have no monetary value.
      </footer>
    </article>
  );
}

export default function Receipt() {
  return (
    <>
      <div className="mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/history" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" /> Back to history
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save as PDF
        </Button>
      </div>
      <RequireChain>
        <ReceiptContent />
      </RequireChain>
    </>
  );
}
