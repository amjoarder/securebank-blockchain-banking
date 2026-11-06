import { Interface } from "ethers";
import { ABI } from "./chain";
import { formatSBC } from "./format";

const iface = new Interface(ABI);

/** Human explanations for every SecureBank custom error. */
const CONTRACT_ERRORS = {
  NotAdmin: () => "Only the SecureBank administrator can perform this action.",
  AdminCannotBeCustomer: () => "The administrator account cannot register as a customer.",
  AlreadyRegistered: () => "This wallet address is already registered as a customer.",
  NotRegistered: () => "This wallet address is not registered as a customer.",
  InvalidName: () => "The name must be between 1 and 64 characters.",
  AccountAlreadyExists: () => "This customer already has a banking account.",
  NoAccount: () => "This customer has not opened a banking account yet.",
  AccountNotActive: () => "This account is suspended. Contact the administrator.",
  InvalidAmount: () => "The amount must be greater than zero and at most 1,000,000.00 SBC.",
  InsufficientBalance: (args) =>
    `Insufficient balance: available ${formatSBC(args[0])}, requested ${formatSBC(args[1])}.`,
  InvalidRecipient: () => "No SecureBank account exists with that account number.",
  RecipientAccountNotActive: () => "The recipient's account is suspended and cannot receive transfers.",
  SelfTransfer: () => "You cannot transfer money to your own account.",
  AccountNotFound: () => "No SecureBank account exists with that account number.",
  StatusUnchanged: () => "The account already has that status.",
  TransactionNotFound: () => "No transaction exists with that ID.",
  NotAuthorizedForTransaction: () => "Only the sender, the recipient or the administrator can view this transaction.",
};

function findRevertData(err) {
  for (let e = err, depth = 0; e && depth < 6; e = e.error ?? e.info?.error ?? e.cause, depth++) {
    if (typeof e.data === "string" && e.data.startsWith("0x")) return e.data;
    if (typeof e.data?.data === "string") return e.data.data;
  }
  return null;
}

/**
 * Converts any ethers/JSON-RPC error into { kind, title, message, code }.
 * kind: "contract" (rule enforced by SecureBank), "rejected" (user declined in wallet), "network", "other".
 */
export function describeError(err) {
  if (err?.code === "ACTION_REJECTED" || err?.info?.error?.code === 4001) {
    return { kind: "rejected", title: "Request rejected", message: "The transaction was rejected in the wallet." };
  }

  let revert = err?.revert;
  if (!revert?.name) {
    const data = findRevertData(err);
    if (data) {
      try {
        revert = iface.parseError(data);
      } catch {
        /* not a SecureBank error */
      }
    }
  }
  if (revert?.name && CONTRACT_ERRORS[revert.name]) {
    return {
      kind: "contract",
      title: "Rejected by the SecureBank smart contract",
      message: CONTRACT_ERRORS[revert.name](revert.args ?? []),
      code: revert.name,
    };
  }

  const text = `${err?.shortMessage ?? ""} ${err?.message ?? ""}`;
  if (/A3_NODE_UNAVAILABLE|failed to fetch|ECONNREFUSED|network/i.test(text)) {
    return { kind: "network", title: "Blockchain unavailable", message: "The Assignment 3 blockchain node is not reachable." };
  }
  return { kind: "other", title: "Transaction failed", message: err?.shortMessage ?? err?.message ?? String(err) };
}
