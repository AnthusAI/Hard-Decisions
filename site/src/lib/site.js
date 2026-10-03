// Everything the pages derive from the data file (data/results.json, written by scripts/collect.mjs
// from the harness's outputs): lookups, the URL scheme, formatting and the plain sentences. Pages
// hold markup; the rules live here once.
import data from "../../data/results.json";

export { data };
export const SITE_NAME = "Hard-Decisions";
export const SITE_LONG = "Hard-Decisions: a decision model benchmark on multi-hop reasoning";

// ---------------------------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------------------------
export const tasks = data.tasks;
export const taskBySlug = Object.fromEntries(tasks.map((t) => [t.slug, t]));
export const TASK_INFO = {
  "proofwriter-owa": { short: "Open world", abbr: "OWA", options: "true, false or unknown",
    long: "Open world: true, false or unknown",
    about: "A statement is true if it follows from the facts and rules, false if its negation follows, and unknown if neither does." },
  "proofwriter-cwa": { short: "Closed world", abbr: "CWA", options: "true or false",
    long: "Closed world: true or false",
    about: "Anything that cannot be derived is false, so there is no unknown answer." },
};
export const taskShort = (slug) => (TASK_INFO[slug] || { short: slug }).short;
export const taskAbbr = (slug) => (TASK_INFO[slug] || { abbr: slug }).abbr;
export const OWA = "proofwriter-owa";
export const CWA = "proofwriter-cwa";
// The open-world task first: it is the harder one and carries the unknown class.
export const taskOrder = [OWA, CWA].filter((s) => taskBySlug[s]).concat(tasks.map((t) => t.slug).filter((s) => s !== OWA && s !== CWA));

// ---------------------------------------------------------------------------------------------
// Models. Display facts only (label, colour, marker); everything else comes from engines.yaml and
// the results. A model the harness adds later shows up with neutral defaults.
// ---------------------------------------------------------------------------------------------
const META = {
  jev: { label: "Jev", slug: "jev", color: "#0377bd", color_dark: "#3aa7ec", marker: "circle", family: "jev" },
  glide: { label: "GLiDE", slug: "glide", color: "#6d28d9", color_dark: "#a78bfa", marker: "triangle-down", family: "glide" },
  "openai-gpt-6-luna-effort-none": { label: "GPT-6 Luna", slug: "gpt-6-luna", color: "#2b7a3b", color_dark: "#5cc36f", marker: "triangle", family: "llm",
    setting: "reasoning off" },
  "kev-9b": { label: "Kev-9B", slug: "kev-9b", color: "#7c2d12", color_dark: "#f0a070", marker: "diamond", family: "kev", size: 9 },
  "kev-4b": { label: "Kev-4B", slug: "kev-4b", color: "#c2410c", color_dark: "#ff8a4c", marker: "diamond", family: "kev", size: 4 },
  "kev-0.8b": { label: "Kev-0.8B", slug: "kev-0-8b", color: "#8a5a00", color_dark: "#e6b94d", marker: "diamond-open", family: "kev", size: 0.8 },
  "kev-27b": { label: "Kev-27B", slug: "kev-27b", color: "#6b7280", color_dark: "#9ca3af", marker: "diamond", family: "kev", size: 27 },
  "gliner-2.5-decide": { label: "GLiNER2.5-Decide", slug: "gliner-2-5-decide", color: "#0f766e", color_dark: "#2dd4bf", marker: "circle-open", family: "gliner" },
  "gliner-2.5-decide-labels-only": { label: "GLiNER2.5-Decide, without instructions", slug: "gliner-2-5-decide-labels-only", color: "#5f9e96", color_dark: "#8fd6cc", marker: "circle-open", family: "gliner" },
  laya: { label: "Laya", slug: "laya", color: "#b5177a", color_dark: "#e05ba6", marker: "square", family: "laya" },
};
const ORDER = ["jev", "glide", "openai-gpt-6-luna-effort-none", "kev-9b", "kev-4b", "kev-0.8b", "gliner-2.5-decide", "gliner-2.5-decide-labels-only", "laya", "kev-27b"];

const ids = [...new Set([...ORDER.filter((id) => data.facts[id] || Object.values(data.results).some((r) => r.status[id])),
  ...Object.keys(data.facts), ...Object.values(data.results).flatMap((r) => Object.keys(r.status))])];

function statusFor(id) {
  const per = {};
  for (const slug of taskOrder) per[slug] = (data.results[slug].status[id]) || { status: "pending", scored: 0, answered: 0, of: taskBySlug[slug].n };
  return per;
}

export const allModels = ids.map((id) => {
  const m = META[id] || { label: id, slug: id.replace(/[^a-z0-9]+/gi, "-").toLowerCase(), color: "#5b6f7d", color_dark: "#97a9b6", marker: "circle", family: "other" };
  const facts = data.facts[id] || null;
  const status = statusFor(id);
  const notRun = !!(facts && /not run/.test(String(facts.kind || "")));
  const scoredTasks = taskOrder.filter((s) => data.results[s].studies.engines[id]);
  const hosted = !!(facts && /hosted/.test(String(facts.kind || "")));
  return { id, ...m, facts, status, notRun, hosted, scoredTasks, measured: scoredTasks.length > 0,
    complete: taskOrder.every((s) => status[s].status === "complete") };
});
export const modelById = Object.fromEntries(allModels.map((m) => [m.id, m]));
export const modelBySlug = Object.fromEntries(allModels.map((m) => [m.slug, m]));
// Models with at least one scored task get pages, charts and colours.
export const models = allModels.filter((m) => m.measured);
// Answered or planned but not yet scored, and the one that will not run on this hardware.
export const pendingModels = allModels.filter((m) => !m.measured && !m.notRun);
export const notRunModels = allModels.filter((m) => m.notRun);
export const L = (id) => (modelById[id] ? modelById[id].label : id);

// ---------------------------------------------------------------------------------------------
// URLs. Every path is lowercase, hyphenated and ends in a slash.
//   /                          the overview
//   /models/                   every model, and every comparison with Jev
//   /models/jev/               Jev, the reference model
//   /compare/jev-vs-<rival>/   each rival model's page, written as its comparison with Jev
//   /breakdowns/ /breakdowns/<group>/   accuracy by the properties of the problems
//   /<topic>/                  how-we-measured, repeatability, speed-size-and-memory,
//                              evaluating / fine-tuning / aligning decision models, about
// ---------------------------------------------------------------------------------------------
const BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const join = (...segs) => BASE + segs.filter(Boolean).map((s) => `${s}/`).join("");
// Each non-Jev model's page is its comparison with Jev.
export const RIVAL_PAGE = { "gliner-2.5-decide": "jev-vs-gliner-2-5-decide", "gliner-2.5-decide-labels-only": "jev-vs-gliner-2-5-decide", glide: "jev-vs-glide", "openai-gpt-6-luna-effort-none": "jev-vs-gpt-6-luna", laya: "jev-vs-laya" };
export const rivalPageOf = (id) => RIVAL_PAGE[id] || (modelById[id] && modelById[id].family === "kev" ? "jev-vs-kev" : null);
export const urls = {
  home: () => BASE,
  models: () => join("models"),
  model: (id) => (id === "jev" ? join("models", "jev") : rivalPageOf(id) ? join("compare", rivalPageOf(id)) : `${join("models")}#${modelById[id] ? modelById[id].slug : id}`),
  comparison: (slug) => join("compare", slug),
  breakdowns: () => join("breakdowns"),
  group: (slug) => join("breakdowns", slug),
  // An axis lives on its group's page; on a page with several axes, at its own section.
  axis: (key) => { const g = groupOfAxis(key); return join("breakdowns", g.slug) + (g.axes.length > 1 ? `#${axisByKey[key].slug}` : ""); },
  measured: () => join("how-we-measured"),
  speed: () => join("speed-size-and-memory"),
  cost: () => join("cost-per-decision"),
  asked: () => join("how-each-model-was-asked"),
  preview: () => join("openai-decisions-api-preview"),
  depthMeans: () => join("what-proof-depth-means"),
  page: (slug) => join(slug),
  data: () => `${BASE}data/results.json`,
};
export const absolute = (path, site) => new URL(path, site).href;

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------
export const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "—" : (100 * x).toFixed(d));
export const pts = (x, d = 1) => {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const v = (100 * x).toFixed(d);
  return Number(v) > 0 ? `+${v}` : Number(v) < 0 ? `−${v.slice(1)}` : v.replace("-", "");
};
export const fmt = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? "—" : Number(x).toFixed(d));
export const int = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US"));
export const ci = (r) => `${pct(r.lo)} to ${pct(r.hi)}`;
export const gb = (mb) => (mb === null || mb === undefined ? null : `${(mb / 1024).toFixed(1)} GB`);
export const listOf = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---------------------------------------------------------------------------------------------
// Results lookups
// ---------------------------------------------------------------------------------------------
export const study = (id, slug) => (data.results[slug] && data.results[slug].studies.engines[id]) || null;
export const overall = (id, slug) => (study(id, slug) ? study(id, slug).overall : null);
export const statusOf = (id, slug) => modelById[id].status[slug];
export const isComplete = (id, slug) => statusOf(id, slug).status === "complete";
export const axisRow = (id, slug, axis, value) => {
  const s = study(id, slug);
  return s && s.axes[axis] ? s.axes[axis].find((r) => r.value === String(value)) || null : null;
};
export const depthRows = (id, slug) => (study(id, slug) && study(id, slug).axes.depth) || [];
export const pair = (slug, a, b) => {
  const p = data.results[slug] && data.results[slug].studies.pairs[`${a}|${b}`];
  return p ? p.rows : null;
};
export const pairRow = (slug, a, b, axis, value) => {
  const rows = pair(slug, a, b);
  return rows ? rows.find((r) => r.axis === axis && r.value === String(value)) || null : null;
};
export const retest = (id, slug) => (data.results[slug] && data.results[slug].studies.retest[id]) || null;
export const latency = (id, slug) => (data.results[slug] && data.results[slug].latency[id]) || null;
export const derived = (id, slug) => (data.results[slug] && data.results[slug].derived[id]) || null;
export const recallAt = (id, slug, depth, label) => {
  const d = derived(id, slug);
  const c = d && d.cross.find((x) => x.depth === String(depth) && x.label === label);
  return c ? { ...c, recall: c.correct / c.n } : null;
};
export const memoryOf = (id) => data.memory[id] || null;
export const costOf = (id) => (data.cost && data.cost[id]) || null;

// Models scored on a task, best first; complete ones before partial ones.
export function ranked(slug) {
  const rows = models.filter((m) => study(m.id, slug)).map((m) => ({ m, r: overall(m.id, slug), complete: isComplete(m.id, slug) }));
  return rows.sort((a, b) => (b.complete - a.complete) || (b.r.accuracy - a.r.accuracy));
}
export const leader = (slug) => ranked(slug).find((x) => x.complete) || null;

// How a partly scored model's numbers must be qualified, in words.
export function statusWords(id, slug) {
  const s = statusOf(id, slug);
  if (s.status === "complete") return null;
  if (s.status === "stale") return `scored on ${int(s.scored)} of ${int(s.of)} items so far; all ${int(s.answered)} are answered and await rescoring`;
  if (s.status === "partial") return `scored on ${int(s.scored)} of ${int(s.of)} items so far`;
  if (s.status === "unscored") return `all ${int(s.answered)} items answered; scoring pending`;
  return "no answers recorded yet";
}

// ---------------------------------------------------------------------------------------------
// Breakdown axes: page slug, title and the query each page answers. The order and keys come from
// the harness (hard_decisions/tasks.py), so a new axis gets a page with a plain title.
// ---------------------------------------------------------------------------------------------
const AXIS_META = {
  depth: { slug: "proof-depth", label: "Proof depth", h1: "Accuracy by proof depth: where multi-hop reasoning breaks",
    query: "multi-hop reasoning benchmark", unit: "depth",
    what: "How many rule applications the shortest proof of the answer needs. Depth 0 is a fact stated in the text; depth 5 needs five chained inferences. This is the benchmark's difficulty axis, and the sample was built to hold it fixed: about 300 items at each depth." },
  reference_label: { slug: "true-false-unknown", label: "Gold answer", h1: "Accuracy on true, false and unknown answers",
    query: "decision model accuracy by answer class", unit: "answer",
    what: "The correct answer. On the open-world task a third of the items are unknown: neither the statement nor its negation follows. That class is where several models fail." },
  theory_kind: { slug: "theory-kind", label: "Theory kind", h1: "Attribute theories vs relation theories",
    query: "ProofWriter attribute vs relation", unit: "kind",
    what: "Whether the theory states attributes of entities (\"Bob is kind\") or relations between them (\"The bear eats the squirrel\")." },
  theory_negation: { slug: "negation", label: "Negation in the theory", h1: "Does negation in the rules lower accuracy?",
    query: "negation reasoning decision models", unit: "theory",
    what: "Whether the theory's facts and rules contain \"not\"." },
  statement_negated: { slug: "negated-statements", label: "Negated statement", h1: "Accuracy on negated statements",
    query: "negated statements reasoning accuracy", unit: "statement",
    what: "Whether the statement to judge itself contains \"not\" (\"The lion is not blue\")." },
  strategy: { slug: "question-strategy", label: "Question strategy", h1: "Accuracy by how each question was generated",
    query: "ProofWriter question strategy", unit: "strategy",
    what: "ProofWriter records how each statement was generated (its strategy field): from a proof (proof), from a rule's conclusion (rconc) or at random (random), each also in an inverted form (inv-). In practice the strategy fixes the gold answer, so this page mostly repeats the true, false and unknown breakdown." },
  paraphrased: { slug: "paraphrased-rules", label: "Paraphrased rules", h1: "Paraphrased rules vs templated rules",
    query: "ProofWriter paraphrased NatLang", unit: "wording",
    what: "Whether the theory comes from ProofWriter's NatLang set, where people reworded the templated sentences, or from the templated sets." },
  theory_max_depth: { slug: "theory-depth", label: "Theory's deepest proof", h1: "Accuracy by the deepest proof in the theory",
    query: "ProofWriter theory depth", unit: "max depth",
    what: "The depth of the deepest conclusion anywhere in the theory, whatever the question asks. It tells you how much inference the theory supports, not how much this question needs." },
  words_bin: { slug: "theory-length", label: "Theory length", h1: "Accuracy by theory length",
    query: "reasoning accuracy context length", unit: "words",
    what: "The theory's length in words. Longer theories carry more distractors, and they also tend to support deeper proofs." },
  rules_bin: { slug: "rule-count", label: "Number of rules", h1: "Accuracy by the number of rules",
    query: "rule-based reasoning accuracy", unit: "rules",
    what: "How many rules the theory states." },
  facts_bin: { slug: "fact-count", label: "Number of facts", h1: "Accuracy by the number of facts",
    query: "fact count reasoning accuracy", unit: "facts",
    what: "How many facts the theory states." },
  proof_size_bin: { slug: "proof-size", label: "Proof size", h1: "Accuracy by proof size",
    query: "proof size reasoning accuracy", unit: "proof size",
    what: "The size of the answer's proof as ProofWriter records it (its QLen field). Unlike depth it also grows with branching: a proof can be shallow and wide." },
};
export const axes = data.axes.map((a) => ({ key: a.key, heading: a.heading, ...(AXIS_META[a.key] ||
  { slug: a.key.replace(/_/g, "-"), label: cap(a.heading), h1: `Accuracy by ${a.heading}`, query: a.heading, unit: a.key, what: `Accuracy broken down by ${a.heading}.` }) }));
export const axisByKey = Object.fromEntries(axes.map((a) => [a.key, a]));
export const axisBySlug = Object.fromEntries(axes.map((a) => [a.slug, a]));
// The breakdown pages: a few axes get a page each; negation's two axes share one; every other axis,
// including any the harness adds later, goes on the problem-size page as its own section.
const GROUP_DEFS = [
  { slug: "proof-depth", axes: ["depth"], label: "Proof depth" },
  { slug: "true-false-unknown", axes: ["reference_label"], label: "True, false, unknown" },
  { slug: "negation", axes: ["theory_negation", "statement_negated"], label: "Negation",
    h1: "Negation: in the rules and in the statement", query: "negation reasoning decision models",
    what: "Two kinds of \"not\": in the theory's facts and rules, and in the statement to judge." },
  { slug: "paraphrased-rules", axes: ["paraphrased"], label: "Paraphrased rules" },
  { slug: "problem-size", axes: null, label: "Problem size and more",
    h1: "Problem size and other parameters: length, rules, facts and proof size", query: "ProofWriter results by problem size",
    what: "Every other property ProofWriter records about a problem: how long the theory is, how many rules and facts it has, how big the proof is, how deep the theory goes, whether it states attributes or relations, and how the question was generated. None of them was controlled when the problems were sampled." },
];
const claimed = new Set(GROUP_DEFS.flatMap((g) => g.axes || []));
export const groups = GROUP_DEFS.map((g) => {
  const SIZE_ORDER = ["words_bin", "rules_bin", "facts_bin", "proof_size_bin", "theory_max_depth", "theory_kind", "strategy"];
  const rest = axes.map((a) => a.key).filter((k) => !claimed.has(k));
  const keys = g.axes || [...SIZE_ORDER.filter((k) => rest.includes(k)), ...rest.filter((k) => !SIZE_ORDER.includes(k))];
  const list = keys.filter((k) => axisByKey[k]).map((k) => axisByKey[k]);
  const one = list.length === 1 ? list[0] : null;
  return { ...g, axes: list, h1: g.h1 || one.h1, query: g.query || one.query, what: g.what || one.what, single: !!one };
}).filter((g) => g.axes.length);
export const groupBySlug = Object.fromEntries(groups.map((g) => [g.slug, g]));
export function groupOfAxis(key) { return groups.find((g) => g.axes.some((a) => a.key === key)); }


const VALUE_LABEL = {
  theory_negation: { negation: "with negation", "no-negation": "without negation" },
  statement_negated: { True: "negated statement", False: "plain statement" },
  paraphrased: { True: "paraphrased (NatLang)", False: "templated" },
  reference_label: { true: "true", false: "false", unknown: "unknown" },
  theory_kind: { attribute: "attribute", relation: "relation" },
};
export const valueLabel = (axis, v) => (VALUE_LABEL[axis] && VALUE_LABEL[axis][v]) || (axis === "depth" ? `depth ${v}` : v);

// Every value of an axis on a task, in the harness's order, with each model's row.
export function axisTable(slug, axisKey, ids = models.map((m) => m.id)) {
  const values = [];
  for (const id of ids) for (const r of (study(id, slug) && study(id, slug).axes[axisKey]) || []) if (!values.includes(r.value)) values.push(r.value);
  const ref = study("jev", slug) || study(ids[0], slug);
  const order = ref && ref.axes[axisKey] ? ref.axes[axisKey].map((r) => r.value) : values;
  const vals = [...order, ...values.filter((v) => !order.includes(v))];
  const profile = taskBySlug[slug].profile[axisKey] || {};
  return vals.map((v) => {
    const cells = Object.fromEntries(ids.map((id) => [id, axisRow(id, slug, axisKey, v)]));
    const any = Object.values(cells).find(Boolean);
    return { value: v, label: valueLabel(axisKey, v), n: (profile[v] || {}).n ?? (any ? any.n : null), cells,
      best_constant: any ? any.best_constant : null, profile: profile[v] || null };
  });
}

// Spread between the best and worst value of an axis for one model, ignoring slices under 50 items.
export function axisSpread(id, slug, axisKey, minN = 50) {
  const rows = ((study(id, slug) && study(id, slug).axes[axisKey]) || []).filter((r) => r.n >= minN);
  if (rows.length < 2) return null;
  const hi = rows.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
  const lo = rows.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
  return { hi, lo, spread: hi.accuracy - lo.accuracy };
}

// Two rows' 95% intervals do not overlap.
export const clearlyAbove = (a, b) => a && b && a.lo > b.hi;

// ---------------------------------------------------------------------------------------------
// Words about models
// ---------------------------------------------------------------------------------------------
const f = (id) => data.facts[id] || {};
export function aboutModel(id) {
  const x = f(id);
  if (id === "jev") return `Jev is a hosted decision model made by ${x.maker || "TypeSafe"}. We call it through its maker's software kit, typesafe-sdk, on paid API access; the version is recorded on every answer (${(study("jev", OWA) && study("jev", OWA).overall.model || []).join(", ") || "jev-1.13.0"}). Its size and architecture are not published.`;
  if (id === "glide") return `GLiDE is a hosted decision model made by Fastino Labs, which describes it as a "thinking" decision model: it forms a probability over the options and spends more computation when the leading option is uncertain. Fastino serves it on the same System One request format as Jev, so it got exactly Jev's request: the text, the question and the options, one request per item. Its size and architecture are not published.`;
  if (id === "openai-gpt-6-luna-effort-none") return `GPT-6 Luna is a hosted large language model made by OpenAI. We used it as a classifier: one request per item through the Chat Completions API, with reasoning effort set to none (its lowest setting) and a strict JSON schema that allows only the task's options. Its size and architecture are not published.`;
  if (id === "gliner-2.5-decide") return `GLiNER2.5-Decide is an open decision model made by Fastino Labs: a ${x.parameters || "340M"}-parameter schema classifier on a DeBERTa-v3-large encoder, released under Apache 2.0. It answers in one pass; its model card says it "does not reason." We ran it on our own laptop with Fastino's gliner2 package, PyTorch on Apple's GPU, with everything every other model gets: the problem, then the question's instructions and each option with its description, in the message, and the options as its answer labels. On the same inputs, our copy gave Fastino's hosted model's answers.`;
  if (id === "gliner-2.5-decide-labels-only") return `The same GLiNER2.5-Decide checkpoint asked in the bare form Fastino's hosted API documents: the problem text, which ends with the statement, and the answer options as labels, without the question's instructions or the option descriptions. It is shown beside the full form to show what those add.`;
  if (id === "laya") return `Laya is an open decision model made by ${x.maker || "Convai Innovations"}: a ${x.parameters || "421M"}-parameter ${String(x.architecture || "ModernBERT-large encoder with decision heads").replace(/, trained with RLCD$/, "")}. We ran it on our own laptop with the laya package, PyTorch on Apple's GPU.`;
  if (/^kev-/.test(id)) {
    const size = (META[id] || {}).size;
    if (modelById[id] && modelById[id].notRun) return `Kev-${size}B is the largest Kev: ${x.parameters || "27B parameters"}, with ${x.weights || "51 GB of weights"}. It was not run: ${x.not_run || "it does not fit the test machine"}.`;
    return `Kev-${size === 0.8 ? "0.8" : size}B is an open decision model made by ${String(x.maker || "Jared Palmer").replace(/ \(individual\)$/, "")}: a pointer head and a rank-16 LoRA adapter on a frozen ${size === 0.8 ? "0.8" : size}-billion-parameter Qwen3.5 base model. We ran it on our own laptop through the Kev server on MLX, in bfloat16.`;
  }
  return x.kind ? `${L(id)} is a ${x.kind}.` : `${L(id)}.`;
}
export const kindOf = (id) => {
  const k = String(f(id).kind || "");
  if (/LLM/.test(k)) return "LLM classifier";
  if (/hosted/.test(k)) return "hosted decision model";
  if (/open/.test(k)) return "open decision model";
  return k || "model";
};
export const whereRun = (id) => (modelById[id] && modelById[id].hosted ? "vendor's servers" : "our laptop (Apple M1 Max, 32 GB)");

// ---------------------------------------------------------------------------------------------
// Anthus: who makes this, and the one call to action (copied from Biased-Decisions' About page).
// ---------------------------------------------------------------------------------------------
export const ANTHUS = { name: "Anthus AI Solutions", url: "https://anth.us",
  who: "an independent AI engineering consultancy" };
export const REPO = data.provenance.repo;
export const SIBLING = { name: "Biased-Decisions", url: "https://biased-decisions.anth.us/" };
