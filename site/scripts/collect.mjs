// Builds data/results.json, the one data file every page of the site is generated from. It reads
// the harness's own outputs and nothing else, so a rebuild picks up whatever has been scored since:
//
//   ../studies/<task>-<engine>.jsonl          scored rows (hd replay), the source of every accuracy
//   ../studies/<task>-jev-vs-<engine>.jsonl   paired differences on the same items
//   ../studies/retest/<task>.jsonl            test-retest agreement (Amendment 4)
//   ../answers/<engine>/<task>.jsonl.gz       the committed record: counted, to tell scored from
//                                             answered, and read for the two tables the harness does
//                                             not report (recall by depth and label; calibration)
//   ../timing/<engine>/<task>.jsonl.gz        reruns made for latency (and retest)
//   ../{answers,timing}/*/*.runs.jsonl        run manifests: machine, concurrency, memory, load
//   ../engines.yaml                           published facts: size, weights, hardware, sources
//   ../tasks/<task>/{question.yaml,build.json,items.jsonl}
//   ../docs/preregistration.md                the predictions, quoted word for word
//
// Nothing here calls a model or the network. Missing data is written as missing, never as zero.
//
//   node scripts/collect.mjs            (runs before `astro dev` and `astro build`)
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.HD_ROOT || join(SITE, "..");
const OUT = join(SITE, "data", "results.json");

const rel = (p) => p.slice(ROOT.length + 1);
const jsonl = (path) => readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const gz = (path) => gunzipSync(readFileSync(path)).toString("utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const ls = (dir) => (existsSync(dir) ? readdirSync(dir) : []);
const mtime = (p) => (existsSync(p) ? statSync(p).mtime.toISOString() : null);
const warnings = [];

// ---------------------------------------------------------------------------------------------
// The axes, in report order, read from the harness so a new axis appears without a site change.
// ---------------------------------------------------------------------------------------------
function readAxes() {
  const src = readFileSync(join(ROOT, "hard_decisions", "tasks.py"), "utf8");
  const block = /AXES[^=]*=\s*\(([\s\S]*?)\n\)/.exec(src);
  if (!block) throw new Error("could not read AXES from hard_decisions/tasks.py");
  return [...block[1].matchAll(/\("([a-z_]+)",\s*"([^"]+)"\)/g)].map((m) => ({ key: m[1], heading: m[2] }));
}

// ---------------------------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------------------------
// For every axis value in the sample: its gold-label mix and mean proof depth, so a page can say
// how far a breakdown is tangled up with depth and with the answer itself.
function profileOf(items) {
  const out = {};
  for (const { key } of readAxes()) {
    const by = {};
    for (const it of items) {
      // Python's spelling of booleans, to match the scored rows' values.
      const raw = it.metadata[key];
      const v = typeof raw === "boolean" ? (raw ? "True" : "False") : String(raw);
      const p = (by[v] ||= { n: 0, depth_sum: 0, labels: {} });
      p.n++; p.depth_sum += it.metadata.depth;
      p.labels[it.metadata.reference_label] = (p.labels[it.metadata.reference_label] || 0) + 1;
    }
    out[key] = Object.fromEntries(Object.entries(by).map(([v, p]) => [v, { n: p.n, mean_depth: p.depth_sum / p.n, labels: p.labels }]));
  }
  return out;
}

function readTasks() {
  return ls(join(ROOT, "tasks")).filter((d) => d.startsWith("proofwriter-") && existsSync(join(ROOT, "tasks", d, "question.yaml"))).sort().map((slug) => {
    const q = YAML.parse(readFileSync(join(ROOT, "tasks", slug, "question.yaml"), "utf8"));
    const build = JSON.parse(readFileSync(join(ROOT, "tasks", slug, "build.json"), "utf8"));
    const items = jsonl(join(ROOT, "tasks", slug, "items.jsonl"));
    // One short example item per depth (the shortest theory), shown on the depth page.
    const examples = {};
    for (const it of items) {
      const d = it.metadata.depth;
      // A "true" item, so the example shows a proof that goes through.
      if (it.metadata.reference_label !== "true" || it.metadata.paraphrased) continue;
      if (!examples[d] || it.text.length < examples[d].text.length) examples[d] = { id: it.id, text: it.text, label: it.metadata.reference_label, depth: d, paraphrased: it.metadata.paraphrased };
    }
    return {
      slug, semantics: q.semantics, question: q.question, options: q.options, descriptions: q.descriptions,
      n: build.n_selected, seed: build.seed, configs: build.configs, depths: build.depths, label_check: build.label_check,
      strata: build.strata, pool: build.axis_counts.pool, selected: build.axis_counts.selected,
      examples, profile: profileOf(items), _items: items,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Scored rows, paired differences and retest rows
// ---------------------------------------------------------------------------------------------
function readStudies(task) {
  const dir = join(ROOT, "studies");
  const engines = {}, pairs = {};
  for (const f of ls(dir).filter((f) => f.startsWith(`${task.slug}-`) && f.endsWith(".jsonl")).sort()) {
    const name = f.slice(task.slug.length + 1, -".jsonl".length);
    const rows = jsonl(join(dir, f));
    if (name.includes("-vs-")) {
      const [a, b] = name.split("-vs-");
      pairs[`${a}|${b}`] = { a, b, file: `studies/${f}`, modified: mtime(join(dir, f)), rows: rows.map(({ task: _t, engine_a: _a, engine_b: _b, ...r }) => r) };
    } else {
      const overall = rows.find((r) => r.axis === "overall");
      const byAxis = {};
      for (const r of rows.filter((r) => r.axis !== "overall")) {
        (byAxis[r.axis] ||= []).push({ value: r.value, n: r.n, correct: r.correct, accuracy: r.accuracy, lo: r.ci_low, hi: r.ci_high, best_constant: r.best_constant, invalid: r.invalid });
      }
      engines[name] = {
        file: `studies/${f}`, modified: mtime(join(dir, f)),
        overall: { n: overall.n, correct: overall.correct, accuracy: overall.accuracy, lo: overall.ci_low, hi: overall.ci_high, macro_f1: overall.macro_f1,
          invalid: overall.invalid, best_constant: overall.best_constant, chance: overall.chance, recall: overall.recall, confusion: overall.confusion, model: overall.model },
        axes: byAxis,
      };
    }
  }
  const rpath = join(dir, "retest", `${task.slug}.jsonl`);
  const retest = {};
  if (existsSync(rpath)) {
    for (const r of jsonl(rpath)) {
      const e = (retest[r.engine] ||= { file: `studies/retest/${task.slug}.jsonl`, depth: [] });
      if (r.axis === "overall") Object.assign(e, { n: r.n, agreement: r.agreement, ac1: r.ac1, ac1_lo: r.ac1_low, ac1_hi: r.ac1_high, kappa: r.kappa, changed: r.changed,
        accuracy_run1: r.accuracy_run1, accuracy_run2: r.accuracy_run2, prob_shift_mean: r.prob_shift_mean, prob_shift_max: r.prob_shift_max });
      else if (r.axis === "depth") e.depth.push({ value: r.value, n: r.n, changed: r.changed, rate: r.change_rate });
    }
  }
  return { engines, pairs, retest };
}

// ---------------------------------------------------------------------------------------------
// Records: counts (scored vs answered), recall by depth x gold label, calibration
// ---------------------------------------------------------------------------------------------
const choiceOf = (row) => ((row.answers || {}).Decision || {}).choice ?? null;
const probsOf = (row) => ((row.answers || {}).Decision || {}).probabilities || null;

function readRecord(engine, task) {
  const path = join(ROOT, "answers", engine, `${task.slug}.jsonl.gz`);
  if (!existsSync(path)) return null;
  const rows = gz(path);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const judged = task._items.filter((it) => byId.has(it.id)).map((it) => {
    const r = byId.get(it.id);
    const choice = choiceOf(r);
    const probs = probsOf(r);
    return { depth: it.metadata.depth, gold: it.metadata.reference_label, choice, correct: choice === it.metadata.reference_label,
      p: probs && choice in probs ? probs[choice] : null };
  });
  // Recall for each (depth, gold label).
  const cross = {};
  for (const j of judged) {
    const k = `${j.depth}|${j.gold}`;
    const c = (cross[k] ||= { depth: String(j.depth), label: j.gold, n: 0, correct: 0, said: {} });
    c.n++; if (j.correct) c.correct++;
    c.said[j.choice ?? "invalid"] = (c.said[j.choice ?? "invalid"] || 0) + 1;
  }
  // Calibration: the probability the model gave its own answer against how often that answer was right.
  let calibration = null;
  const withP = judged.filter((j) => typeof j.p === "number");
  if (withP.length === judged.length && judged.length > 0) {
    const edges = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];
    const bins = edges.slice(0, -1).map((lo, i) => ({ lo, hi: Math.min(1, edges[i + 1]), n: 0, correct: 0, psum: 0 }));
    for (const j of withP) {
      const b = bins.find((b, i) => j.p >= b.lo && (j.p < edges[i + 1]));
      b.n++; b.psum += j.p; if (j.correct) b.correct++;
    }
    const N = withP.length;
    const ece = bins.reduce((a, b) => a + (b.n ? (b.n / N) * Math.abs(b.correct / b.n - b.psum / b.n) : 0), 0);
    const meanP = withP.reduce((a, j) => a + j.p, 0) / N;
    const acc = withP.filter((j) => j.correct).length / N;
    calibration = { n: N, ece, mean_confidence: meanP, accuracy: acc,
      bins: bins.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, accuracy: b.n ? b.correct / b.n : null, confidence: b.n ? b.psum / b.n : null })) };
  }
  return { file: rel(path), modified: mtime(path), rows: rows.length, judged: judged.length, cross: Object.values(cross), calibration,
    models: [...new Set(rows.map((r) => r.model).filter(Boolean))] };
}

// ---------------------------------------------------------------------------------------------
// Manifests and latency
// ---------------------------------------------------------------------------------------------
function readManifests() {
  const out = [];
  for (const tree of ["answers", "timing"]) {
    for (const engine of ls(join(ROOT, tree))) {
      for (const f of ls(join(ROOT, tree, engine)).filter((f) => f.endsWith(".runs.jsonl"))) {
        for (const m of jsonl(join(ROOT, tree, engine, f))) {
          out.push({ file: `${tree}/${engine}/${f}`, tree, engine: m.engine || engine, task: m.task, started_at: m.started_at, finished_at: m.finished_at,
            requested: m.requested, answered: m.answered, failed: m.failed, concurrency: m.concurrency, machine: m.machine || null,
            memory: m.memory || null, load: m.load || null, code: m.code || null });
        }
      }
    }
  }
  return out;
}

function readLatency(task, manifests) {
  const out = {};
  for (const engine of ls(join(ROOT, "timing"))) {
    const path = join(ROOT, "timing", engine, `${task.slug}.jsonl.gz`);
    if (!existsSync(path)) continue;
    const values = gz(path).map((r) => r.latency_ms).filter((v) => typeof v === "number").sort((a, b) => a - b);
    if (!values.length) continue;
    const q = (p) => values[Math.floor(p * (values.length - 1))];
    const manifest = manifests.filter((m) => m.tree === "timing" && m.engine === engine && m.task === task.slug).at(-1) || null;
    // A rerun is complete when every item has a timing and the run wrote its manifest at the end.
    const complete = values.length >= task.n && !!manifest;
    out[engine] = { file: rel(path), n: values.length, of: task.n, complete, p50: q(0.5), p90: q(0.9), max: values.at(-1),
      total_minutes: values.reduce((a, b) => a + b, 0) / 60000, concurrency: manifest ? manifest.concurrency : null,
      machine: manifest ? manifest.machine : null,
      load_start: manifest && manifest.load && manifest.load.start ? manifest.load.start.loadavg : null,
      load_end: manifest && manifest.load && manifest.load.end ? manifest.load.end.loadavg : null };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// engines.yaml, the preregistration, provenance
// ---------------------------------------------------------------------------------------------
function readFacts() {
  const facts = YAML.parse(readFileSync(join(ROOT, "engines.yaml"), "utf8"));
  const machine = facts.machine || null;
  delete facts.machine;
  return { facts, machine };
}

// Each section of docs/preregistration.md and its numbered predictions, verbatim.
function readPrereg() {
  const path = join(ROOT, "docs", "preregistration.md");
  const md = readFileSync(path, "utf8");
  const sections = [];
  let cur = null;
  for (const line of md.split("\n")) {
    const h = /^## (.+)$/.exec(line);
    if (h) { cur = { heading: h[1], lines: [] }; sections.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  const predictionsOf = (lines) => {
    const start = lines.findIndex((l) => /^-? ?\**Predictions:?\**/.test(l.trim()) || /^## Predictions/.test(l));
    const body = start >= 0 ? lines.slice(start + 1) : lines;
    const out = [];
    for (const l of body) {
      const m = /^\s*(\d+)\.\s+(.*)$/.exec(l);
      if (m) out.push({ n: Number(m[1]), text: m[2] });
      else if (out.length && /^\s{2,}\S/.test(l)) out.at(-1).text += " " + l.trim();
      else if (out.length && l.trim() && !/^\s/.test(l)) break;
    }
    return out;
  };
  const design = sections.find((s) => s.heading.startsWith("Design"));
  return {
    file: "docs/preregistration.md", modified: mtime(path),
    intro: md.split("\n").slice(1).find((l) => l.trim()) || "",
    design: design ? design.lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2)) : [],
    sections: sections.map((s) => ({ heading: s.heading, predictions: predictionsOf(s.lines),
      text: s.lines.join("\n").trim() })).filter((s) => s.predictions.length || /caveat|count against/i.test(s.heading)),
  };
}

function readCommit() {
  try {
    const git = join(ROOT, ".git");
    const head = readFileSync(join(git, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return { commit: head, branch: null };
    const ref = head.slice(5).trim();
    let commit = existsSync(join(git, ref)) ? readFileSync(join(git, ref), "utf8").trim() : null;
    if (!commit && existsSync(join(git, "packed-refs"))) {
      const line = readFileSync(join(git, "packed-refs"), "utf8").split("\n").find((l) => l.endsWith(` ${ref}`));
      commit = line ? line.split(" ")[0] : null;
    }
    return { commit, branch: ref.replace(/^refs\/heads\//, "") };
  } catch { return { commit: null, branch: null }; }
}

// ---------------------------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------------------------
const axes = readAxes();
const tasks = readTasks();
const manifests = readManifests();
const { facts, machine } = readFacts();
const prereg = readPrereg();
const engineIds = new Set(Object.keys(facts));
const perTask = {};
for (const task of tasks) {
  const studies = readStudies(task);
  for (const e of Object.keys(studies.engines)) engineIds.add(e);
  const records = {};
  for (const e of new Set([...ls(join(ROOT, "answers")), ...Object.keys(studies.engines)])) {
    const r = readRecord(e, task);
    if (r) { records[e] = r; engineIds.add(e); }
  }
  // Scored vs answered: the site shows scored rows only, and says when they lag the record.
  const status = {};
  for (const e of engineIds) {
    const s = studies.engines[e], r = records[e];
    let st;
    if (s && s.overall.n >= task.n && (!r || r.judged === s.overall.n)) st = "complete";
    else if (s && r && r.judged > s.overall.n) st = "stale";
    else if (s) st = "partial";
    else if (r) st = "unscored";
    else st = "pending";
    status[e] = { status: st, scored: s ? s.overall.n : 0, answered: r ? r.judged : 0, of: task.n };
    if (st === "stale") warnings.push(`${task.slug}/${e}: ${r.judged} items answered but only ${s.overall.n} scored; run \`hd replay\` to rescore`);
    if (st === "unscored") warnings.push(`${task.slug}/${e}: ${r.judged} items answered but no scored rows yet; run \`hd replay\``);
  }
  // Record-derived tables only where the record and the scored rows agree, so no page mixes two states.
  const derived = {};
  for (const [e, r] of Object.entries(records)) {
    if (status[e].status === "complete") derived[e] = { cross: r.cross, calibration: r.calibration, models: r.models, file: r.file };
  }
  perTask[task.slug] = { studies, status, derived, latency: readLatency(task, manifests) };
}

// ---------------------------------------------------------------------------------------------
// The GPT-6 Luna log-probability probe (Amendment 6; outside the scored benchmark). Summaries come
// from probes/luna-logprobs/analysis.json (tools/analyze_luna_logprobs.py). The analysis gives
// AUROC by depth for Luna only, so the same AUROC is computed here, the analysis's way, for every
// engine with recorded probabilities on the same items, by depth.
// ---------------------------------------------------------------------------------------------
function aurocOf(scores, correct) {
  const pos = [], neg = [];
  scores.forEach((s, i) => (correct[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return null;
  // Rank-based Mann-Whitney with ties counted half: the same value as the pairwise count.
  const all = scores.map((s, i) => ({ s, c: correct[i] })).sort((a, b) => a.s - b.s);
  let rankSumPos = 0;
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j < all.length && all[j].s === all[i].s) j++;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (all[k].c) rankSumPos += avg;
    i = j;
  }
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

// The probability the model gave its own answer, as the analysis reads it from a Luna response:
// the summed log-probability of the tokens that spell the answer inside the JSON reply.
function answerLogprob(content, answer) {
  let text = "";
  const starts = content.map((t) => { const at = text.length; text += t.token; return at; });
  const needle = `"${answer}"`;
  const at = text.indexOf(needle, text.indexOf('"answer"') + '"answer"'.length);
  if (at < 0) return null;
  const lo = at + 1, hi = at + 1 + answer.length;
  const covering = content.map((t, i) => i).filter((i) => starts[i] < hi && starts[i] + content[i].token.length > lo);
  return covering.length ? { index: covering[0], tokens: covering.map((i) => content[i].token), logprob: covering.reduce((a, i) => a + content[i].logprob, 0) } : null;
}

function readProbe(tasks) {
  const dir = join(ROOT, "probes", "luna-logprobs");
  const path = join(dir, "analysis.json");
  if (!existsSync(path)) return null;
  const a = JSON.parse(readFileSync(path, "utf8"));
  const out = { file: rel(path), modified: mtime(path), tasks: {}, overall: a.overall || null, examples: [], runs: [] };
  for (const f of ls(dir).filter((f) => f.endsWith(".runs.jsonl"))) for (const m of jsonl(join(dir, f))) out.runs.push(m);
  for (const task of tasks) {
    const t = a.tasks && a.tasks[task.slug];
    if (!t) continue;
    const gz_ = join(dir, `${task.slug}.jsonl.gz`);
    const ids = existsSync(gz_) ? gz(gz_).map((r) => r.id) : [];
    const meta = Object.fromEntries(task._items.map((i) => [i.id, i.metadata]));
    // AUROC by depth for every engine with probabilities on all the probe's items.
    const byDepth = {};
    for (const engine of ["jev", "kev-4b", "kev-0.8b", "laya", "kev-9b"]) {
      const recPath = join(ROOT, "answers", engine, `${task.slug}.jsonl.gz`);
      if (!existsSync(recPath)) continue;
      const rec = new Map(gz(recPath).map((r) => [r.id, r]));
      const rows = [];
      for (const id of ids) {
        const ans = ((rec.get(id) || {}).answers || {}).Decision || {};
        if (ans.probabilities && ans.choice in ans.probabilities) rows.push({ p: ans.probabilities[ans.choice], c: ans.choice === meta[id].reference_label ? 1 : 0, d: String(meta[id].depth) });
      }
      if (rows.length !== ids.length || !ids.length) continue;
      byDepth[engine] = Object.fromEntries([...new Set(rows.map((r) => r.d))].sort().map((d) => {
        const g = rows.filter((r) => r.d === d);
        return [d, { n: g.length, accuracy: g.reduce((x, r) => x + r.c, 0) / g.length, auroc: aurocOf(g.map((r) => r.p), g.map((r) => r.c)) }];
      }));
    }
    out.tasks[task.slug] = { ...t, other_engines_by_depth: byDepth, options: task.options };
  }
  // The verbatim examples, with the stated probability read from the response the analysis's way.
  for (const e of a.examples || []) {
    const choice = e.response.choices[0];
    let answer = null;
    try { answer = JSON.parse(choice.message.content).answer; } catch { answer = null; }
    const pos = answer ? answerLogprob((choice.logprobs || {}).content || [], answer) : null;
    const alts = pos ? (choice.logprobs.content[pos.index].top_logprobs || []).map((x) => ({ token: x.token, p: Math.exp(x.logprob) })) : [];
    out.examples.push({ ...e, answer, stated: pos ? Math.exp(pos.logprob) : null, answer_tokens: pos ? pos.tokens : [], alternatives: alts,
      depth: (tasks.find((t) => t.slug === e.task)._items.find((i) => i.id === e.id) || { metadata: {} }).metadata.depth });
  }
  return out;
}

const probe = readProbe(tasks);
// Worked examples of proof depth (tools/depth_examples.py): fixed, answer-blind selection.
const depthExamplesPath = join(ROOT, "studies", "depth-examples.json");
const depthExamples = existsSync(depthExamplesPath)
  ? { file: rel(depthExamplesPath), modified: mtime(depthExamplesPath), ...JSON.parse(readFileSync(depthExamplesPath, "utf8")) } : null;
// Right and wrong examples per model and depth (tools/model_examples.py): seeded, blind to anything
// but correctness, with the right/wrong mix set by the model's accuracy at that depth.
const lunaMissesPath = join(ROOT, "studies", "luna-misses.json");
const lunaMisses = existsSync(lunaMissesPath)
  ? { file: rel(lunaMissesPath), modified: mtime(lunaMissesPath), ...JSON.parse(readFileSync(lunaMissesPath, "utf8")) } : null;

const modelExamplesPath = join(ROOT, "studies", "model-examples.json");
const modelExamples = existsSync(modelExamplesPath)
  ? (({ engines, selection }) => ({ file: rel(modelExamplesPath), modified: mtime(modelExamplesPath), selection, engines }))(JSON.parse(readFileSync(modelExamplesPath, "utf8"))) : null;
const memory = {};
for (const m of manifests) {
  if (!m.memory) continue;
  const best = (memory[m.engine] ||= { phys_footprint_mb: null, phys_footprint_peak_mb: null, runs: [] });
  for (const k of ["phys_footprint_mb", "phys_footprint_peak_mb"]) if (m.memory[k] != null) best[k] = Math.max(best[k] ?? 0, m.memory[k]);
  best.runs.push({ file: m.file, task: m.task, ...m.memory });
}

const { commit, branch } = readCommit();
const data = {
  schema: 1,
  provenance: {
    generated: new Date().toISOString().slice(0, 10),
    generated_at: new Date().toISOString(),
    record_commit: commit, record_commit_short: commit ? commit.slice(0, 7) : null, branch,
    version: (/^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, "pyproject.toml"), "utf8")) || [])[1] || null,
    command: "hd replay, then npm run build in site/",
    repo: process.env.HD_REPO_URL || null,
    note: "Built from the working tree: results scored after the named commit are included.",
    warnings,
  },
  axes, machine, facts, memory,
  tasks: tasks.map(({ _items, ...t }) => t),
  results: perTask,
  // Load averages only: the manifests also name the busiest other processes on the machine, which
  // are not the public's business.
  manifests: manifests.map(({ load, ...m }) => ({ ...m, load_start: load && load.start ? load.start.loadavg : null, load_end: load && load.end ? load.end.loadavg : null,
    busy_processes: load && load.start ? (load.start.busy_processes || []).length : null })),
  prereg,
  probe,
  depthExamples,
  modelExamples,
  lunaMisses,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
console.log(`collect: wrote ${rel(OUT).replace(/^site\//, "")} (${tasks.length} tasks, ${engineIds.size} models, ${manifests.length} run manifests)`);
for (const w of warnings) console.warn(`collect: ${w}`);
