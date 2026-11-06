import { useNavigate } from "react-router-dom";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Receipt } from "lucide-react";
import { useBank } from "../context/BankContext";
import { TX_TYPES, formatDateTime, formatSBC, shortAddress, shortHash } from "../lib/format";
import { EmptyState } from "./ui";

const TYPE_STYLE = [
  { icon: ArrowDownToLine, cls: "bg-emerald-50 text-emerald-700" },
  { icon: ArrowUpFromLine, cls: "bg-amber-50 text-amber-700" },
  { icon: ArrowLeftRight, cls: "bg-brand-50 text-brand-700" },
];

export function TxTypeBadge({ type }) {
  const { icon: Icon, cls } = TYPE_STYLE[type];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="size-3.5" /> {TX_TYPES[type]}
    </span>
  );
}

function Party({ address, fallback }) {
  const { labelFor } = useBank();
  if (!address) return <span className="text-slate-400">{fallback}</span>;
  const name = labelFor(address);
  return (
    <span title={address} className="whitespace-nowrap">
      {name && <span className="block text-slate-900">{name}</span>}
      <span className="mono text-xs text-slate-500">{shortAddress(address)}</span>
    </span>
  );
}

/**
 * rows: normalised records from toTxRecord(); hashes: Map(txId → tx hash).
 * perspective: when set, amounts are signed (+ incoming / − outgoing) for that address.
 */
export default function TransactionTable({ rows, hashes, perspective, emptyText = "No transactions yet." }) {
  const navigate = useNavigate();
  if (!rows.length) return <EmptyState icon={Receipt} title={emptyText} />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/70">
          <tr>
            <th className="th">ID</th>
            <th className="th">Type</th>
            <th className="th">From</th>
            <th className="th">To</th>
            <th className="th text-right">Amount</th>
            <th className="th">Block</th>
            <th className="th">Time</th>
            <th className="th">Tx hash</th>
            <th className="th">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((t) => {
            const incoming = perspective && t.to === perspective;
            const signed = perspective ? (incoming ? "+" : "−") : "";
            return (
              <tr key={t.id} onClick={() => navigate(`/receipt/${t.id}`)} className="cursor-pointer hover:bg-slate-50" title="Open receipt">
                <td className="td font-medium text-slate-900">#{t.id}</td>
                <td className="td">
                  <TxTypeBadge type={t.txType} />
                </td>
                <td className="td">
                  <Party address={t.from} fallback="Cash deposit" />
                </td>
                <td className="td">
                  <Party address={t.to} fallback="Cash withdrawal" />
                </td>
                <td className={`td text-right font-medium whitespace-nowrap tabular-nums ${perspective ? (incoming ? "text-emerald-700" : "text-slate-900") : "text-slate-900"}`}>
                  {signed}
                  {formatSBC(t.amount)}
                </td>
                <td className="td tabular-nums">#{t.blockNumber}</td>
                <td className="td whitespace-nowrap text-slate-500">{formatDateTime(t.timestamp)}</td>
                <td className="td mono text-brand-700">{shortHash(hashes?.get(t.id))}</td>
                <td className="td">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <span className="size-1.5 rounded-full bg-emerald-500" /> Confirmed
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
