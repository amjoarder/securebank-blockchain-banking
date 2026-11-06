import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, UserX } from "lucide-react";
import { useBank } from "../context/BankContext";
import { useTxRunner } from "../hooks/useTxRunner";
import { describeError } from "../lib/errors";
import { ACCOUNT_STATUS, formatSBC, parseSBC, shortAddress } from "../lib/format";
import { AmountField, BalanceAside } from "../components/OperationForm";
import { RequireChain, RequireCustomer } from "../components/StatusGuards";
import TxStatusPanel from "../components/TxStatusPanel";
import { Button, PageHeader, SectionCard } from "../components/ui";

/** Other demo customers that currently hold an account (read from the contract). */
function useKnownRecipients() {
  const { readContract, demoAccounts, activeAddress, blockNumber } = useBank();
  const [list, setList] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const others = demoAccounts.filter((a) => a.role === "customer" && a.address !== activeAddress);
    Promise.all(others.map(async (a) => ({ ...a, account: await readContract.getAccount(a.address) })))
      .then((rows) => !cancelled && setList(rows.filter((r) => Number(r.account.status) !== 0)))
      .catch(() => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, [readContract, demoAccounts, activeAddress, blockNumber]);
  return list;
}

/** Resolves an account number via SecureBank.lookupAccount so the user can confirm the recipient. */
function useRecipientLookup(accountNumber) {
  const { readContract } = useBank();
  const [state, setState] = useState({ status: "idle" });
  useEffect(() => {
    if (!/^\d{10}$/.test(accountNumber)) return setState({ status: accountNumber ? "invalid-format" : "idle" });
    let cancelled = false;
    setState({ status: "loading" });
    readContract
      .lookupAccount(BigInt(accountNumber))
      .then(([owner, name, status]) => !cancelled && setState({ status: "found", owner, name, accountStatus: Number(status) }))
      .catch((err) => !cancelled && setState({ status: "not-found", message: describeError(err).message }));
    return () => {
      cancelled = true;
    };
  }, [accountNumber, readContract]);
  return state;
}

function RecipientPreview({ lookup, selfAddress }) {
  if (lookup.status === "idle" || lookup.status === "loading") return null;
  if (lookup.status === "invalid-format") return <p className="mt-1.5 text-xs text-slate-500">Account numbers have 10 digits, e.g. 1000000002.</p>;
  if (lookup.status === "not-found") {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
        <UserX className="size-3.5" /> {lookup.message} Submitting anyway will be rejected by the contract.
      </p>
    );
  }
  const self = lookup.owner === selfAddress;
  const suspended = ACCOUNT_STATUS[lookup.accountStatus] !== "Active";
  return (
    <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${self || suspended ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
      <CheckCircle2 className="size-4 shrink-0" />
      <span>
        <strong>{lookup.name}</strong> · <span className="mono">{shortAddress(lookup.owner)}</span>
        {self && " — this is your own account (self-transfers are rejected)"}
        {suspended && !self && " — account is suspended (transfer will be rejected)"}
      </span>
    </div>
  );
}

function TransferForm() {
  const { profile, activeAddress } = useBank();
  const { tx, run, reset, busy } = useTxRunner();
  const recipients = useKnownRecipients();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const lookup = useRecipientLookup(to.trim());

  useEffect(() => {
    reset();
    setTo("");
    setAmount("");
  }, [activeAddress, reset]);

  const parsed = amount ? parseSBC(amount) : null;
  const exceeds = parsed?.ok && parsed.cents > profile.balance;
  const canSubmit = parsed?.ok && /^\d{1,19}$/.test(to.trim());

  const onSubmit = async (e) => {
    e.preventDefault();
    const result = await run("Transfer", (c) => c.transfer(BigInt(to.trim()), parsed.cents));
    if (result) setAmount("");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div>
        <SectionCard title="Transfer between accounts" description="Calls SecureBank.transfer(toAccountNumber, amount)">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="to">
                Recipient account number
              </label>
              <input
                id="to"
                inputMode="numeric"
                autoComplete="off"
                className="input tabular-nums"
                placeholder="e.g. 1000000002"
                value={to}
                onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))}
              />
              <RecipientPreview lookup={lookup} selfAddress={activeAddress} />
              {recipients.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Known customers:</span>
                  {recipients.map((r) => (
                    <button
                      type="button"
                      key={r.address}
                      onClick={() => setTo(r.account.accountNumber.toString())}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    >
                      {r.name.split(" ")[0]} · {r.account.accountNumber.toString()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <AmountField
              value={amount}
              onChange={setAmount}
              error={parsed && !parsed.ok ? parsed.error : null}
              warning={exceeds ? "This exceeds your balance. You may still submit it to see the smart contract reject it." : null}
            />

            {canSubmit && lookup.status === "found" && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                <span className="font-medium">{profile.name}</span>
                <ArrowRight className="size-4 text-slate-400" />
                <span className="font-medium">{lookup.name}</span>
                <span className="ml-auto font-semibold tabular-nums">{formatSBC(parsed.cents)}</span>
              </div>
            )}

            <Button type="submit" loading={busy} disabled={!canSubmit} className="w-full sm:w-auto">
              Send transfer
            </Button>
          </form>
        </SectionCard>
        <TxStatusPanel tx={tx} onReset={reset} />
      </div>
      <BalanceAside>
        <li>Sender and recipient must both have active accounts</li>
        <li>Recipient must exist; self-transfers are rejected</li>
        <li>Balance must cover the amount</li>
        <li>Both balances change atomically in one transaction</li>
        <li>Recorded with an ID and emits Transferred</li>
      </BalanceAside>
    </div>
  );
}

export default function Transfer() {
  return (
    <>
      <PageHeader title="Transfer" description="Send SBC credits to another SecureBank customer's account." />
      <RequireChain>
        <RequireCustomer>
          <TransferForm />
        </RequireCustomer>
      </RequireChain>
    </>
  );
}
