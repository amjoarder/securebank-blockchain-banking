import { Link } from "react-router-dom";
import { formatUnits } from "ethers";
import { CheckCircle2, FileText, Loader2, XCircle } from "lucide-react";
import { formatMs } from "../lib/format";
import { Button, CopyButton, DetailRow } from "./ui";

const STEPS = ["ready", "submitting", "pending", "done"];

function stepIndex(phase) {
  if (phase === "signing") return 1;
  if (phase === "confirmed" || phase === "failed") return 3;
  return STEPS.indexOf(phase);
}

function Stepper({ phase, failedAt }) {
  const current = stepIndex(phase);
  const labels = ["Ready", phase === "signing" ? "Awaiting signature" : "Submitting", "Pending", phase === "failed" ? "Failed" : "Confirmed"];
  // On failure, only the steps actually reached before the error are shown as completed.
  const reached = phase === "failed" ? STEPS.indexOf(failedAt) : current;
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-medium">
      {labels.map((label, i) => {
        const done = phase === "failed" ? i < reached : i < current || (i === 3 && phase === "confirmed");
        const failed = i === 3 && phase === "failed";
        const active = i === current && !done && !failed;
        const tone = failed
          ? "bg-red-50 text-red-700 ring-red-200"
          : done
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : active
              ? "bg-brand-50 text-brand-700 ring-brand-200"
              : "bg-white text-slate-400 ring-slate-200";
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-inset ${tone}`}>
              {active && i > 0 && <Loader2 className="size-3 animate-spin" />}
              {label}
            </span>
            {i < labels.length - 1 && <span className="hidden h-px w-4 bg-slate-200 sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

/** Shows the READY → SUBMITTING → PENDING → CONFIRMED / FAILED lifecycle of a write transaction. */
export default function TxStatusPanel({ tx, onReset }) {
  if (tx.phase === "ready") return null;

  return (
    <div className="card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <p className="text-sm font-semibold text-slate-900">{tx.label}</p>
        <Stepper phase={tx.phase} failedAt={tx.failedAt} />
      </div>

      <div className="px-5 py-4">
        {(tx.phase === "submitting" || tx.phase === "signing") && (
          <p className="text-sm text-slate-600">
            {tx.phase === "signing" ? "Confirm the transaction in MetaMask…" : "Simulating and submitting the transaction to the blockchain…"}
          </p>
        )}

        {tx.phase === "pending" && (
          <div className="text-sm text-slate-600">
            Waiting for the transaction to be mined.
            <p className="mono mt-1 text-slate-500">{tx.hash}</p>
          </div>
        )}

        {tx.phase === "confirmed" && (
          <>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="size-4" /> Confirmed on the blockchain
            </div>
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Transaction hash" mono>
                <span className="inline-flex items-center gap-2">
                  {tx.hash} <CopyButton value={tx.hash} />
                </span>
              </DetailRow>
              {tx.txId && <DetailRow label="Bank transaction ID">#{tx.txId}</DetailRow>}
              <DetailRow label="Block number">#{tx.blockNumber}</DetailRow>
              <DetailRow label="Gas used">
                {tx.gasUsed.toLocaleString()} gas @ {formatUnits(tx.gasPrice, "gwei")} gwei
              </DetailRow>
              <DetailRow label="Measured latency">{formatMs(tx.latencyMs)} (click → receipt)</DetailRow>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {tx.txId && (
                <Link to={`/receipt/${tx.txId}`}>
                  <Button>
                    <FileText className="size-4" /> View receipt
                  </Button>
                </Link>
              )}
              <Button variant="secondary" onClick={onReset}>
                New transaction
              </Button>
            </div>
          </>
        )}

        {tx.phase === "failed" && (
          <>
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-700">{tx.error.title}</p>
                <p className="mt-0.5 text-sm text-slate-700">{tx.error.message}</p>
                {tx.error.code && (
                  <p className="mt-1 text-xs text-slate-500">
                    Solidity custom error: <code className="mono">{tx.error.code}()</code>. No state was changed.
                  </p>
                )}
              </div>
            </div>
            <Button variant="secondary" className="mt-4" onClick={onReset}>
              Try again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
