/**
 * Minimal, dependency-free SVG chart primitives (bar and line charts with a categorical x-axis).
 * Output is static SVG suitable for reports; charts.js converts it to PNG as well.
 */
const W = 860;
const H = 500;
const M = { top: 100, right: 36, bottom: 78, left: 92 };
const FONT = "Segoe UI, Arial, Helvetica, sans-serif";
const INK = "#0f172a";
const MUTED = "#64748b";
const GRID = "#e2e8f0";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "Nice" axis maximum and tick step for a value range starting at 0. */
function niceScale(maxValue, ticks = 5) {
  const max = maxValue > 0 ? maxValue : 1;
  const rough = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough);
  return { max: Math.ceil(max / step) * step, step };
}

const defaultFormat = (v) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 10) return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 3 });
};

function frame({ title, subtitle, xLabel, yLabel, yMax, step, format, categories, xPos, legend }) {
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const y = (v) => M.top + ph - (v / yMax) * ph;
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  parts.push(`<text x="${M.left}" y="34" font-size="19" font-weight="600" fill="${INK}">${esc(title)}</text>`);
  if (subtitle) parts.push(`<text x="${M.left}" y="56" font-size="12.5" fill="${MUTED}">${esc(subtitle)}</text>`);
  for (let v = 0; v <= yMax + step / 2; v += step) {
    parts.push(`<line x1="${M.left}" x2="${W - M.right}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(`<text x="${M.left - 10}" y="${y(v) + 4}" font-size="12" fill="${MUTED}" text-anchor="end">${esc(format(v))}</text>`);
  }
  parts.push(`<line x1="${M.left}" x2="${W - M.right}" y1="${y(0)}" y2="${y(0)}" stroke="#94a3b8" stroke-width="1.2"/>`);
  categories.forEach((c, i) => {
    parts.push(`<text x="${xPos(i)}" y="${M.top + ph + 22}" font-size="13" fill="${INK}" text-anchor="middle">${esc(c)}</text>`);
  });
  parts.push(`<text x="${M.left + pw / 2}" y="${H - 22}" font-size="13" fill="${MUTED}" text-anchor="middle">${esc(xLabel)}</text>`);
  parts.push(`<text transform="translate(24 ${M.top + ph / 2}) rotate(-90)" font-size="13" fill="${MUTED}" text-anchor="middle">${esc(yLabel)}</text>`);
  if (legend?.length > 1) {
    let lx = W - M.right;
    [...legend].reverse().forEach(({ name, color, dashed }) => {
      const w = name.length * 7 + 34;
      lx -= w;
      parts.push(`<line x1="${lx}" x2="${lx + 18}" y1="${M.top - 24}" y2="${M.top - 24}" stroke="${color}" stroke-width="3" ${dashed ? 'stroke-dasharray="5 4"' : ""}/>`);
      parts.push(`<text x="${lx + 24}" y="${M.top - 20}" font-size="12" fill="${INK}">${esc(name)}</text>`);
    });
  }
  return { parts, y, pw, ph };
}

const wrap = (parts) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">\n${parts.join("\n")}\n</svg>\n`;

/**
 * series: [{ name, color, values: number[], errors?: [{low, high}] }]
 */
function barChart({ title, subtitle, xLabel, yLabel, categories, series, format = defaultFormat }) {
  const top = Math.max(...series.flatMap((s) => s.values.map((v, i) => Math.max(v, s.errors?.[i]?.high ?? 0))));
  const { max: yMax, step } = niceScale(top * 1.08);
  const pw = W - M.left - M.right;
  const band = pw / categories.length;
  const xPos = (i) => M.left + band * (i + 0.5);
  const { parts, y } = frame({ title, subtitle, xLabel, yLabel, yMax, step, format, categories, xPos, legend: series });
  const groupW = Math.min(band * 0.62, 90 * series.length);
  const barW = groupW / series.length;
  series.forEach((s, si) => {
    s.values.forEach((v, i) => {
      const x = xPos(i) - groupW / 2 + si * barW + 3;
      const w = barW - 6;
      parts.push(`<rect x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="3" fill="${s.color}"/>`);
      const e = s.errors?.[i];
      if (e) {
        const cx = x + w / 2;
        parts.push(`<line x1="${cx}" x2="${cx}" y1="${y(e.high)}" y2="${y(e.low)}" stroke="${INK}" stroke-width="1.3"/>`);
        parts.push(`<line x1="${cx - 6}" x2="${cx + 6}" y1="${y(e.high)}" y2="${y(e.high)}" stroke="${INK}" stroke-width="1.3"/>`);
        parts.push(`<line x1="${cx - 6}" x2="${cx + 6}" y1="${y(e.low)}" y2="${y(e.low)}" stroke="${INK}" stroke-width="1.3"/>`);
      }
      const labelY = Math.min(y(v), e ? y(e.high) : y(v)) - 8;
      parts.push(`<text x="${x + w / 2}" y="${labelY}" font-size="12.5" font-weight="600" fill="${INK}" text-anchor="middle">${esc(format(v))}</text>`);
    });
  });
  return wrap(parts);
}

/** series: [{ name, color, values: number[], dashed? }] — x is categorical (evenly spaced). */
function lineChart({ title, subtitle, xLabel, yLabel, categories, series, format = defaultFormat }) {
  const top = Math.max(...series.flatMap((s) => s.values));
  const { max: yMax, step } = niceScale(top * 1.1);
  const pw = W - M.left - M.right;
  const xPos = (i) => M.left + 30 + ((pw - 60) * i) / Math.max(1, categories.length - 1);
  const { parts, y } = frame({ title, subtitle, xLabel, yLabel, yMax, step, format, categories, xPos, legend: series });
  series.forEach((s) => {
    const pts = s.values.map((v, i) => `${xPos(i)},${y(v)}`).join(" ");
    parts.push(`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.6" ${s.dashed ? 'stroke-dasharray="6 5"' : ""} stroke-linejoin="round"/>`);
    s.values.forEach((v, i) => {
      parts.push(`<circle cx="${xPos(i)}" cy="${y(v)}" r="4.2" fill="#fff" stroke="${s.color}" stroke-width="2.2"/>`);
      if (!s.dashed) {
        parts.push(`<text x="${xPos(i)}" y="${y(v) - 11}" font-size="12" font-weight="600" fill="${INK}" text-anchor="middle">${esc(format(v))}</text>`);
      }
    });
  });
  return wrap(parts);
}

module.exports = { barChart, lineChart };
