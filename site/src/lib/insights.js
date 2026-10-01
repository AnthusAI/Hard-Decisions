// Sentences the guide pages (evaluating, fine-tuning, aligning) build from the results: each one a
// measured fact about a fully scored model, never a typed-in number.
import { models, OWA, CWA, taskBySlug, overall, axisRow, isComplete, pair, pct, pts, L } from "./site.js";

export const fullModels = () => models.filter((m) => isComplete(m.id, OWA) && isComplete(m.id, CWA));

// How a model's answers lean: its most common answer, and how often it gives it, against the share
// of items where that answer is correct.
export function lean(id, slug) {
  const o = overall(id, slug);
  const said = {};
  for (const row of Object.values(o.confusion)) for (const [k, v] of Object.entries(row)) said[k] = (said[k] || 0) + v;
  const [top, n] = Object.entries(said).sort((a, b) => b[1] - a[1])[0];
  const gold = taskBySlug[slug].selected.reference_label[top] || 0;
  return { answer: top, share: n / o.n, gold: gold / o.n };
}

export function deepEnd(id, slug) {
  const d0 = axisRow(id, slug, "depth", "0"), d5 = axisRow(id, slug, "depth", "5"), d3 = axisRow(id, slug, "depth", "3");
  const chance = 1 / taskBySlug[slug].options.length;
  // The first depth whose interval reaches down to chance, if any.
  const rows = (models.find((m) => m.id === id) && overall(id, slug)) ? [0, 1, 2, 3, 4, 5].map((d) => axisRow(id, slug, "depth", String(d))).filter(Boolean) : [];
  const atChance = rows.find((r) => r.lo <= chance);
  return { d0, d3, d5, chance, atChance };
}

export function paraphraseGap(id, slug) {
  const a = axisRow(id, slug, "paraphrased", "False"), b = axisRow(id, slug, "paraphrased", "True");
  return a && b ? { templated: a, paraphrased: b, drop: a.accuracy - b.accuracy } : null;
}

export function negationGap(id, slug) {
  const a = axisRow(id, slug, "theory_negation", "negation"), b = axisRow(id, slug, "theory_negation", "no-negation");
  return a && b ? { with: a, without: b, diff: a.accuracy - b.accuracy } : null;
}
export { pct, pts, L, pair };

// The depth-5 claim: by five chained inferences, every fully scored model except the leader is no
// better than a coin flip (its 95% interval reaches 50%) on both tasks, while the leader's interval is
// clearly above 50% on both. Returned only while the data supports it; otherwise null, and no page
// or card states it.
export function coinFlipClaim() {
  const full = fullModels();
  if (full.length < 2) return null;
  const d5 = (id, slug) => axisRow(id, slug, "depth", "5");
  const accuracy = (id) => (overall(id, OWA).accuracy + overall(id, CWA).accuracy) / 2;
  const lead = [...full].sort((a, b) => accuracy(b.id) - accuracy(a.id))[0];
  const others = full.filter((m) => m.id !== lead.id);
  const rows = (id) => [OWA, CWA].map((s) => d5(id, s));
  if (rows(lead.id).some((r) => !r || r.lo <= 0.5)) return null;
  if (others.some((m) => rows(m.id).some((r) => !r || r.lo > 0.5))) return null;
  const leadRows = rows(lead.id);
  const families = [...new Set(others.filter((m) => /open decision model/.test(String((m.facts && m.facts.kind) || ""))).map((m) => m.label.split("-")[0]))];
  const llms = others.filter((m) => /LLM/.test(String((m.facts && m.facts.kind) || ""))).map((m) => `${m.label} used as a one-shot classifier`);
  const rest = others.filter((m) => !/open decision model|LLM/.test(String((m.facts && m.facts.kind) || ""))).map((m) => m.label);
  const groups = [families.length ? `the open decision models ${listOf(families)}` : null, ...llms, ...rest].filter(Boolean);
  const lo = Math.min(...leadRows.map((r) => r.accuracy)), hi = Math.max(...leadRows.map((r) => r.accuracy));
  const range = pct(lo) === pct(hi) ? `${pct(lo)}%` : `${pct(lo)}–${pct(hi)}%`;
  const worst = Math.max(...others.flatMap((m) => rows(m.id).map((r) => r.accuracy)));
  return {
    lead: lead.id, others: others.map((m) => m.id), range, worst,
    sentence: `As proofs get deeper, every model we tested except ${L(lead.id)} falls to coin-flip accuracy by five chained inferences: ${groupList(groups)}. ${L(lead.id)} still answers ${range} correctly at that depth.`,
    short: `By five chained inferences, only ${L(lead.id)} beats a coin flip`,
    detail: `At proof depth 5 no other model scores above ${pct(worst)}% on either task, and none is clearly above 50%; ${L(lead.id)} scores ${range}.`,
  };
}

// Groups that contain "and" themselves get a serial comma, so "Kev and Laya, and GPT-6 Luna" stays readable.
function groupList(items) {
  if (items.length <= 1) return items.join("");
  const sep = items.some((g) => / and /.test(g)) ? ", and " : " and ";
  return `${items.slice(0, -1).join(", ")}${sep}${items[items.length - 1]}`;
}

function listOf(items) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
