import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useBank } from "../context/BankContext";
import { useTxRunner } from "../hooks/useTxRunner";
import { formatSBC, parseSBC } from "../lib/format";
import TxStatusPanel from "./TxStatusPanel";
import { Button, SectionCard } from "./ui";

export function AmountField({ value, onChange, error, warning }) {
  return (
    <div>
      <label className="label" htmlFor="amount">
        Amount (SBC)
      </label>
      <div className="relative">
        <input
          id="amount"
          inputMode="decimal"
          autoComplete="off"
          className="input pr-14 text-base tabular-nums"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">SBC</span>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {!error && warning && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> {warning}
        </p>
      )}
    </div>
  );
}

export function BalanceAside({ children }) {
  const { profile } = useBank();
  return (
    <aside className="space-y-4">
      <div className="card p-5">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Current balance</p>
        <p className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums">{formatSBC(profile.balance)}</p>
        <p className="mt-1 text-xs text-slate-500">Account {profile.accountNumber.toString()}</p>
      </div>
      <div className="card p-5 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-900">Enforced by the smart contract</p>
        <ul className="list-disc space-y-1 pl-4">{children}</ul>
      </div>
    </aside>
  );
}

const PRESETS = ["100", "500", "1000"];

/**
 * Shared form for single-amount operations (deposit / withdrawal).
 * Client-side checks only improve UX; the contract re-validates everything.
 */
export default function OperationForm({ title, description, actionLabel, submit, balanceWarning = false, rules }) {
  const { profile, activeAddress } = useBank();
  const { tx, run, reset, busy } = useTxRunner();
  const [amount, setAmount] = useState("");

  useEffect(() => {
    reset();
    setAmount("");
  }, [activeAddress, reset]);

  const parsed = amount ? parseSBC(amount) : null;
  const exceeds = balanceWarning && parsed?.ok && parsed.cents > profile.balance;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!parsed?.ok) return;
    const result = await run(title, (c) => submit(c, parsed.cents));
    if (result) setAmount("");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div>
        <SectionCard title={title} description={description}>
          <form onSubmit={onSubmit} className="space-y-4">
            <AmountField
              value={amount}
              onChange={setAmount}
              error={parsed && !parsed.ok ? parsed.error : null}
              warning={exceeds ? "This exceeds your balance. You may still submit it to see the smart contract reject it." : null}
            />
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setAmount(p)}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                >
                  {Number(p).toLocaleString()} SBC
                </button>
              ))}
            </div>
            <Button type="submit" loading={busy} disabled={!parsed?.ok} className="w-full sm:w-auto">
              {actionLabel}
            </Button>
          </form>
        </SectionCard>
        <TxStatusPanel tx={tx} onReset={reset} />
      </div>
      <BalanceAside>{rules}</BalanceAside>
    </div>
  );
}
