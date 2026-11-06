/** Descriptive statistics over an array of numbers (population standard deviation). */
function summarize(values) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return { count: 0, avg: null, min: null, max: null, std: null, p50: null, p95: null };
  const avg = xs.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(xs.reduce((s, v) => s + (v - avg) ** 2, 0) / n);
  const pct = (p) => xs[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))];
  return { count: n, avg, min: xs[0], max: xs[n - 1], std, p50: pct(50), p95: pct(95) };
}

/**
 * Round numbers in a (nested) object for readable JSON: values ≥ 1 to `digits` decimals,
 * values < 1 (e.g. ETH costs such as 0.002024175) to 9 significant digits so they stay exact.
 */
function roundDeep(obj, digits = 3) {
  if (typeof obj === "number") {
    if (Number.isInteger(obj) || !Number.isFinite(obj)) return obj;
    return Math.abs(obj) >= 1 ? Number(obj.toFixed(digits)) : Number(obj.toPrecision(9));
  }
  if (Array.isArray(obj)) return obj.map((v) => roundDeep(v, digits));
  if (obj && typeof obj === "object") return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, roundDeep(v, digits)]));
  return obj;
}

module.exports = { summarize, roundDeep };
