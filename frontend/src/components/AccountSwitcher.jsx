import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ShieldCheck, User, Wallet } from "lucide-react";
import { useBank } from "../context/BankContext";
import { useToast } from "../context/ToastContext";
import { shortAddress } from "../lib/format";
import { Badge } from "./ui";

export default function AccountSwitcher() {
  const bank = useBank();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const isMetaMask = bank.walletMode === "metamask";
  const RoleIcon = bank.isAdmin ? ShieldCheck : isMetaMask ? Wallet : User;

  const connect = async () => {
    try {
      await bank.connectMetaMask();
      setOpen(false);
      toast("info", "MetaMask connected", "Transactions will now be signed in MetaMask.");
    } catch (err) {
      toast("error", "MetaMask", err?.message ?? String(err));
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white py-1.5 pr-2.5 pl-2 text-left hover:border-slate-300"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`flex size-8 items-center justify-center rounded-md ${bank.isAdmin ? "bg-navy-800 text-white" : "bg-brand-50 text-brand-700"}`}>
          <RoleIcon className="size-4" />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium text-slate-900">{bank.activeLabel ?? "Select account"}</span>
          <span className="mono block text-xs text-slate-500">{shortAddress(bank.activeAddress)}</span>
        </span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>

      {open && (
        <div role="menu" className="card absolute right-0 z-40 mt-2 w-80 overflow-hidden shadow-xl">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5">
            <p className="text-[11px] font-bold tracking-wider text-amber-900">LOCAL DEMO ACCOUNTS — NOT REAL WALLETS</p>
            <p className="mt-0.5 text-xs text-amber-800">Unlocked Hardhat development accounts on the Assignment 3 chain only.</p>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {bank.demoAccounts.map((acct) => {
              const active = !isMetaMask && acct.address === bank.activeAddress;
              return (
                <li key={acct.address}>
                  <button
                    role="menuitem"
                    onClick={() => {
                      bank.selectDemoAccount(acct.address);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 ${active ? "bg-brand-50/60" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{acct.name}</span>
                        {acct.role === "admin" ? <Badge tone="blue">Admin</Badge> : !acct.seeded && <Badge>New</Badge>}
                      </div>
                      <span className="mono text-xs text-slate-500">{shortAddress(acct.address, 6)}</span>
                    </div>
                    {active && <Check className="size-4 text-brand-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
            {isMetaMask ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600">
                  MetaMask: <span className="mono">{shortAddress(bank.metaMask.address)}</span>
                </span>
                <button onClick={bank.disconnectMetaMask} className="text-xs font-medium text-brand-700 hover:underline">
                  Use demo accounts
                </button>
              </div>
            ) : (
              <button onClick={connect} className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900">
                <Wallet className="size-3.5" /> Optional: connect MetaMask instead
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
