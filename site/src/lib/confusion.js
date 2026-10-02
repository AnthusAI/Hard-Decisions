// Confusion matrices: rows are the correct answer, columns what the model said. Overall counts come
// from the scored rows (studies/); counts at one depth from the saved answers (the same per-item
// records the scored rows are built from), for fully scored models.
import { overall, derived, taskBySlug, modelById, pct, L } from "./site.js";

// The shading steps: a cell's share of its row picks one of these mix levels toward the surface.
// Text is the ordinary ink colour except at full strength, where it is the token's own "on" colour.
export const LEVELS = [0, 12, 25, 45, 100];
export const levelOf = (share) => (share <= 0 ? 0 : share < 0.1 ? 12 : share < 0.3 ? 25 : share < 0.6 ? 45 : 100);

export function matrixOf(id, slug, depth = null) {
  const opts = taskBySlug[slug].options;
  let table;
  if (depth === null) {
    const o = overall(id, slug);
    if (!o || !o.confusion) return null;
    table = o.confusion;
  } else {
    const d = derived(id, slug);
    if (!d) return null;
    table = {};
    for (const c of d.cross.filter((x) => x.depth === String(depth))) table[c.label] = { ...c.said };
    if (!Object.keys(table).length) return null;
  }
  const hasInvalid = opts.some((g) => (table[g] || {}).invalid);
  const cols = [...opts, ...(hasInvalid ? ["invalid"] : [])];
  const rows = opts.filter((g) => table[g]).map((g) => {
    const cells = Object.fromEntries(cols.map((c) => [c, (table[g] || {})[c] || 0]));
    const n = Object.values(table[g]).reduce((a, b) => a + b, 0);
    return { gold: g, cells, n, recall: n ? cells[g] / n : null };
  });
  const total = rows.reduce((a, r) => a + r.n, 0);
  const said = Object.fromEntries(cols.map((c) => [c, rows.reduce((a, r) => a + r.cells[c], 0)]));
  const right = rows.reduce((a, r) => a + r.cells[r.gold], 0);
  return { id, slug, depth, cols, rows, total, said, right, accuracy: total ? right / total : null };
}

// "Laya said false on 74% of problems; the correct answer is false on 34%."
export function leanSentence(mx) {
  const [top, n] = Object.entries(mx.said).filter(([k]) => k !== "invalid").sort((a, b) => b[1] - a[1])[0];
  const gold = (mx.rows.find((r) => r.gold === top) || { n: 0 }).n;
  const m = modelById[mx.id];
  return `${L(mx.id)}${m && m.setting ? ` (${m.setting})` : ""} said ${top} on ${pct(n / mx.total, 0)}% of problems; the correct answer is ${top} on ${pct(gold / mx.total, 0)}%`;
}

// What changes between two depths: the diagonal, and the answer whose share moves most.
export function depthChangeSentence(a, b) {
  const shares = (mx, k) => mx.said[k] / mx.total;
  const keys = a.cols.filter((k) => k !== "invalid");
  const mover = keys.reduce((best, k) => (Math.abs(shares(b, k) - shares(a, k)) > Math.abs(shares(b, best) - shares(a, best)) ? k : best), keys[0]);
  return `At depth ${a.depth}, ${L(a.id)} was right on ${pct(a.accuracy, 0)}% of problems (the green diagonal); at depth ${b.depth}, on ${pct(b.accuracy, 0)}%. The answer whose share moved most is ${mover}: ${pct(shares(a, mover), 0)}% of its answers at depth ${a.depth}, ${pct(shares(b, mover), 0)}% at depth ${b.depth}, against ${pct((a.rows.find((r) => r.gold === mover) || { n: 0 }).n / a.total, 0)}% and ${pct((b.rows.find((r) => r.gold === mover) || { n: 0 }).n / b.total, 0)}% of the correct answers.`;
}

// Where a model's weakest answer class went: "Laya got 1% of unknown items right; it said false on 86% of them."
export function weakestSentence(mx) {
  const r = mx.rows.reduce((w, x) => (x.recall < w.recall ? x : w));
  const [to, n] = Object.entries(r.cells).filter(([k]) => k !== r.gold).sort((p, q) => q[1] - p[1])[0];
  const m = modelById[mx.id];
  return `${L(mx.id)}${m && m.setting ? ` (${m.setting})` : ""} got ${pct(r.recall, 0)}% of ${r.gold} items right${n ? `; it said ${to} on ${pct(n / r.n, 0)}% of them` : ""}`;
}
