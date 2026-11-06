/** SBC amounts are stored on-chain as integer cents (2 decimals). */
export const MAX_AMOUNT_CENTS = 100_000_000n; // mirrors SecureBank.MAX_AMOUNT (1,000,000.00 SBC)

export function formatSBC(cents, { symbol = true } = {}) {
  const value = BigInt(cents ?? 0);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = (abs / 100n).toLocaleString("en-US");
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "−" : ""}${whole}.${frac}${symbol ? " SBC" : ""}`;
}

/**
 * Parses user input like "1,250.5" into cents. This is user-experience validation only —
 * the smart contract re-checks every rule and is the real enforcement layer.
 */
export function parseSBC(input) {
  const text = String(input ?? "").replace(/,/g, "").trim();
  if (!text) return { ok: false, error: "Enter an amount." };
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return { ok: false, error: "Use a positive number with at most 2 decimal places." };
  const [whole, frac = ""] = text.split(".");
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0") || "0");
  if (cents === 0n) return { ok: false, error: "Amount must be greater than zero." };
  if (cents > MAX_AMOUNT_CENTS) return { ok: false, error: "Maximum per transaction is 1,000,000.00 SBC." };
  return { ok: true, cents };
}

export const shortAddress = (addr, size = 4) =>
  addr ? `${addr.slice(0, 2 + size)}…${addr.slice(-size)}` : "—";

export const shortHash = (hash) => (hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : "—");

export function formatDateTime(unixSeconds) {
  if (!unixSeconds) return "—";
  return new Date(Number(unixSeconds) * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const formatNumber = (n, digits = 0) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatMs = (ms) => (ms == null ? "—" : `${formatNumber(ms, ms < 100 ? 1 : 0)} ms`);

export const TX_TYPES = ["Deposit", "Withdrawal", "Transfer"];
export const ACCOUNT_STATUS = ["None", "Active", "Suspended"];
