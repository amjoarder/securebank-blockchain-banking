import { useCallback, useState } from "react";
import { useBank } from "../context/BankContext";
import { useToast } from "../context/ToastContext";
import { describeError } from "../lib/errors";

/**
 * Runs one state-changing contract call and tracks its lifecycle:
 *   ready → submitting (or signing in MetaMask) → pending → confirmed | failed
 *
 * Latency shown in the UI = click → receipt available in the browser (includes gas estimation,
 * JSON-RPC round-trips and ethers polling). The benchmark measures latency more precisely.
 */
export function useTxRunner() {
  const { getWriteContract, walletMode, walletIssue, refreshProfile } = useBank();
  const toast = useToast();
  const [tx, setTx] = useState({ phase: "ready" });

  const reset = useCallback(() => setTx({ phase: "ready" }), []);

  const run = useCallback(
    async (label, send) => {
      if (walletIssue) {
        setTx({
          phase: "failed",
          label,
          error: { kind: "network", title: "Wrong network", message: "Switch MetaMask to the Assignment 3 network first." },
        });
        return null;
      }
      setTx({ phase: walletMode === "metamask" ? "signing" : "submitting", label });
      const started = performance.now();
      let submittedHash = null; // set once the node accepted the transaction (i.e. it became pending)
      try {
        const contract = await getWriteContract();
        const response = await send(contract);
        submittedHash = response.hash;
        setTx({ phase: "pending", label, hash: response.hash });

        const receipt = await response.wait();
        const latencyMs = performance.now() - started;
        const events = receipt.logs
          .map((log) => {
            try {
              return contract.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        const bankingEvent = events.find((e) => e.fragment.inputs.some((i) => i.name === "txId"));

        const result = {
          label,
          hash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          gasPrice: receipt.gasPrice,
          latencyMs,
          txId: bankingEvent ? bankingEvent.args.txId.toString() : null,
          eventName: events[0]?.name ?? null,
        };
        setTx({ phase: "confirmed", ...result });
        toast("success", `${label} confirmed`, `Block #${receipt.blockNumber} · ${receipt.gasUsed.toLocaleString()} gas`);
        refreshProfile();
        return result;
      } catch (err) {
        const error = describeError(err);
        // Rejected during simulation/submission → never pending; reverted after submission → failed while pending.
        setTx({ phase: "failed", label, error, failedAt: submittedHash ? "pending" : "submitting", hash: submittedHash });
        toast("error", error.title, error.message);
        return null;
      }
    },
    [getWriteContract, walletMode, walletIssue, refreshProfile, toast]
  );

  const busy = ["submitting", "signing", "pending"].includes(tx.phase);
  return { tx, run, reset, busy };
}
