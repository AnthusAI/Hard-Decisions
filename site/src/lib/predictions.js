// The preregistered predictions (docs/preregistration.md), quoted word for word, each checked
// against the scored rows. Every check states its rule; a prediction whose data is missing or only
// partly scored is "pending", never guessed. Verdicts:
//   held · failed · partly held (one part held, another failed) · mixed (held on one task, failed
//   on the other, where the prediction did not name a task) · pending · no claim
import { data, OWA, CWA, L, pct, pts, fmt, overall, axisRow, depthRows, pairRow, retest, recallAt, isComplete, statusOf, modelById } from "./site.js";

const KEV = "kev-0.8b", KEV4 = "kev-4b", KEV9 = "kev-9b", LUNA = "openai-gpt-6-luna-effort-none", LAYA = "laya", JEV = "jev";
const TASKS = [OWA, CWA];
const T = (slug) => (slug === OWA ? "OWA" : "CWA");
const pending = (why) => ({ status: "pending", checks: [why] });
const ready = (ids, slugs = TASKS) => ids.every((id) => modelById[id] && slugs.every((s) => isComplete(id, s)));
const notReady = (ids, slugs = TASKS) => {
  const missing = [];
  for (const id of ids) for (const s of slugs) {
    const st = modelById[id] ? statusOf(id, s).status : "pending";
    if (st !== "complete") missing.push(`${L(id)} on ${T(s)} (${st === "stale" ? "partly scored; answers await rescoring" : st === "unscored" ? "answered, not yet scored" : st === "partial" ? "partly scored" : "no answers recorded yet"})`);
  }
  return `Waiting for scored results: ${missing.join("; ")}.`;
};

// "Falls with depth": depth 0 clearly above depth 5 (95% intervals do not overlap), and no deeper
// level clearly above a shallower one. Returns the check and any clear rises.
function fallsWithDepth(id, slug) {
  const rows = depthRows(id, slug);
  const d = (v) => rows.find((r) => r.value === String(v));
  const first = d(0), last = d(rows.length - 1);
  const ends = first.lo > last.hi;
  const rises = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (rows[j].lo > rows[i].hi) rises.push([rows[i], rows[j]]);
  return { ends, rises, first, last,
    text: `${T(slug)}: depth 0 ${pct(first.accuracy)}% [${pct(first.lo)}–${pct(first.hi)}], depth ${last.value} ${pct(last.accuracy)}% [${pct(last.lo)}–${pct(last.hi)}]${ends ? ", intervals apart" : ", intervals overlap"}${rises.length ? `; but depth ${rises[0][1].value} (${pct(rises[0][1].accuracy)}%) is clearly above depth ${rises[0][0].value} (${pct(rises[0][0].accuracy)}%)` : ""}.` };
}
function fallsVerdict(id) {
  if (!ready([id])) return pending(notReady([id]));
  const per = TASKS.map((s) => fallsWithDepth(id, s));
  const endsAll = per.every((p) => p.ends), smooth = per.every((p) => !p.rises.length);
  return { status: endsAll && smooth ? "held" : endsAll ? "partly held" : "failed",
    checks: ["Rule: depth 0 clearly above depth 5 on each task (95% intervals do not overlap), and no deeper level clearly above a shallower one.", ...per.map((p) => p.text)] };
}

// Which class has the lowest recall, overall (from the scored rows) or at one depth (from the record).
function lowestClass(recalls) {
  const entries = Object.entries(recalls).filter(([, v]) => v !== null && v !== undefined);
  return entries.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}
const recallText = (r) => Object.entries(r).map(([k, v]) => `${k} ${pct(v)}%`).join(", ");

function overallUnknownLowest(id) {
  if (!ready([id], [OWA])) return pending(notReady([id], [OWA]));
  const r = overall(id, OWA).recall;
  const low = lowestClass(r);
  return { status: low === "unknown" ? "held" : "failed",
    checks: [`Rule: on OWA, recall on unknown is the lowest of the three classes.`, `${L(id)} recall on OWA: ${recallText(r)}; lowest is ${low}.`] };
}

function belowJev(id, slugs = TASKS) {
  const rows = slugs.map((s) => ({ s, r: pairRow(s, JEV, id, "overall", "all") }));
  return rows.map(({ s, r }) => ({ s, ok: r ? r.ci_low > 0 : null,
    text: r ? `${T(s)}: Jev minus ${L(id)} ${pts(r.diff)} points [${pts(r.ci_low)} to ${pts(r.ci_high)}] on ${r.n.toLocaleString("en-US")} items.` : `${T(s)}: no paired result yet.` }));
}

const paraDrop = (id, s) => {
  const a = axisRow(id, s, "paraphrased", "False"), b = axisRow(id, s, "paraphrased", "True");
  return a && b ? { drop: a.accuracy - b.accuracy, a, b } : null;
};

const SECTIONS = [
  {
    match: /^Predictions$/, title: "Jev", model: JEV,
    checks: {
      1: () => fallsVerdict(JEV),
      2: () => {
        if (!ready([JEV], [OWA])) return pending(notReady([JEV], [OWA]));
        const depths = ["3", "4", "5"];
        const per = depths.map((d) => {
          const r = Object.fromEntries(["true", "false", "unknown"].map((c) => [c, (recallAt(JEV, OWA, d, c) || {}).recall ?? null]));
          return { d, r, low: lowestClass(r) };
        });
        if (per.some((p) => Object.values(p.r).some((v) => v === null))) return pending("Recall by depth and class is not available from the record yet.");
        const n = per.filter((p) => p.low === "unknown").length;
        return { status: n === per.length ? "held" : n === 0 ? "failed" : "partly held",
          checks: ["Rule: at each of depths 3, 4 and 5 on OWA, Jev's recall on unknown is the lowest of the three classes. (Recall by depth and class is counted from the saved answers.)",
            ...per.map((p) => `Depth ${p.d}: ${recallText(p.r)}; lowest is ${p.low}.`)] };
      },
      3: () => {
        if (!ready([JEV])) return pending(notReady([JEV]));
        const per = TASKS.map((s) => { const r = axisRow(JEV, s, "depth", "5"); return { s, r, gap: r.accuracy - r.best_constant }; });
        const any = per.some((p) => p.gap <= 0.10);
        return { status: any ? "held" : "failed",
          checks: ["Rule: at depth 5, Jev's accuracy is within 10 points of the best constant guess on at least one task.",
            ...per.map((p) => `${T(p.s)}: ${pct(p.r.accuracy)}% against a best constant of ${pct(p.r.best_constant)}%, ${pts(p.gap)} points above it.`)] };
      },
      4: () => {
        if (!ready([JEV])) return pending(notReady([JEV]));
        const per = TASKS.map((s) => ({ s, neg: axisRow(JEV, s, "theory_negation", "negation"), none: axisRow(JEV, s, "theory_negation", "no-negation") }));
        const lower = per.filter((p) => p.neg.accuracy < p.none.accuracy).length;
        return { status: lower === per.length ? "held" : lower === 0 ? "failed" : "mixed",
          checks: ["Rule: accuracy with negation in the theory is below accuracy without it.",
            ...per.map((p) => `${T(p.s)}: with negation ${pct(p.neg.accuracy)}% [${pct(p.neg.lo)}–${pct(p.neg.hi)}], without ${pct(p.none.accuracy)}% [${pct(p.none.lo)}–${pct(p.none.hi)}]${p.neg.lo > p.none.hi ? ": clearly higher with negation, the opposite of the prediction" : ""}.`)] };
      },
      5: () => {
        if (!ready([JEV])) return pending(notReady([JEV]));
        const per = TASKS.map((s) => ({ s, ...paraDrop(JEV, s) }));
        const ok = per.filter((p) => !(p.b.lo > p.a.hi)).length;
        return { status: ok === per.length ? "held" : ok === 0 ? "failed" : "mixed",
          checks: ["Rule: paraphrased rules are not clearly easier (their interval is not wholly above the templated one).",
            ...per.map((p) => `${T(p.s)}: paraphrased ${pct(p.b.accuracy)}%, templated ${pct(p.a.accuracy)}%.`)] };
      },
      6: () => ({ status: "no claim", checks: ["Reported, not predicted: see the breakdown pages."] }),
    },
  },
  {
    match: /^Amendment 1/, title: "Kev-0.8B", model: KEV,
    checks: {
      1: () => fallsVerdict(KEV),
      2: () => {
        if (!ready([JEV, KEV])) return pending(notReady([JEV, KEV]));
        const per = belowJev(KEV);
        return { status: per.every((p) => p.ok) ? "held" : per.every((p) => p.ok === false) ? "failed" : "mixed",
          checks: ["Rule: the paired interval for Jev minus Kev-0.8B lies above zero on both tasks.", ...per.map((p) => p.text)] };
      },
      3: () => overallUnknownLowest(KEV),
    },
  },
  {
    match: /^Amendment 2/, title: "GPT-6 Luna", model: LUNA,
    checks: {
      1: () => fallsVerdict(LUNA),
      2: () => overallUnknownLowest(LUNA),
      3: () => {
        if (!ready([JEV, LUNA], [OWA])) return pending(notReady([JEV, LUNA], [OWA]));
        const r = pairRow(OWA, JEV, LUNA, "depth", "5");
        return { status: r.ci_high < 0 ? "failed" : "held",
          checks: ["Rule: at depth 5 on OWA, the paired interval for Jev minus Luna does not lie wholly below zero.",
            `Depth 5, OWA: Jev minus Luna ${pts(r.diff)} points [${pts(r.ci_low)} to ${pts(r.ci_high)}] on ${r.n} items.`] };
      },
      4: () => {
        if (!ready([JEV, LUNA])) return pending(notReady([JEV, LUNA]));
        const per = TASKS.map((s) => ({ s, j: paraDrop(JEV, s), l: paraDrop(LUNA, s) }));
        const held = per.filter((p) => p.l.drop < p.j.drop).length;
        return { status: held === per.length ? "held" : held === 0 ? "failed" : "mixed",
          checks: ["Rule: on each task, Luna's accuracy drop from templated to paraphrased rules is smaller than Jev's. (No interval was preregistered for this difference, so it is a point comparison.)",
            ...per.map((p) => `${T(p.s)}: Luna drops ${pts(p.l.drop)} points, Jev drops ${pts(p.j.drop)}: ${p.l.drop < p.j.drop ? "held" : "failed"}.`)] };
      },
    },
  },
  {
    match: /^Amendment 3/, title: "Kev-4B and Kev-9B", model: KEV4,
    checks: {
      1: () => {
        if (!ready([KEV, KEV4])) return pending(notReady([KEV, KEV4]));
        const per = TASKS.map((s) => ({ s, a: overall(KEV4, s), b: overall(KEV, s) }));
        const notAhead = per.filter((p) => p.a.accuracy <= p.b.accuracy);
        const lines = per.map((p) => `${T(p.s)}: Kev-4B ${pct(p.a.accuracy)}%, Kev-0.8B ${pct(p.b.accuracy)}%.`);
        if (notAhead.length) return { status: "failed", checks: ["Rule: Kev-4B is above Kev-0.8B overall on both tasks, with a paired interval that excludes zero.", ...lines,
          `Kev-4B is not ahead on ${notAhead.map((p) => T(p.s)).join(" or ")}, so its interval cannot exclude zero in its favour there.`] };
        return pending(`Kev-4B is ahead on both tasks (${lines.join(" ")}), but the harness has not yet computed the paired interval for Kev-4B minus Kev-0.8B.`);
      },
      2: () => {
        const parts = [];
        let anyFail = false, allReady = true;
        for (const id of [KEV4, KEV9]) {
          if (!ready([JEV, id])) { allReady = false; parts.push(notReady([id])); continue; }
          for (const p of belowJev(id)) { parts.push(p.text); if (p.ok === false) anyFail = true; }
        }
        if (anyFail) return { status: "failed", checks: ["Rule: the paired interval for Jev minus each larger Kev lies above zero on both tasks.", ...parts] };
        return allReady ? { status: "held", checks: ["Rule: the paired interval for Jev minus each larger Kev lies above zero on both tasks.", ...parts] }
          : { status: "pending", checks: ["Rule: the paired interval for Jev minus each larger Kev lies above zero on both tasks.", ...parts] };
      },
      3: () => (ready([KEV4, KEV9]) ? pending("Kev-9B and Kev-4B are both scored, but the harness has not computed their paired interval.") : pending(notReady([KEV9, KEV4]))),
    },
  },
  {
    match: /^Amendment 4/, title: "Repeatability", model: null,
    checks: {
      1: () => {
        const ids = ["kev-0.8b", "kev-4b", "kev-9b", LAYA];
        const have = [], missing = [];
        for (const id of ids) for (const s of TASKS) {
          const r = retest(id, s);
          if (r && r.n >= data.tasks.find((t) => t.slug === s).n) have.push({ id, s, r }); else missing.push(`${L(id)} on ${T(s)}`);
        }
        const fails = have.filter((h) => h.r.agreement < 0.995);
        const lines = have.map((h) => `${L(h.id)} on ${T(h.s)}: ${pct(h.r.agreement)}% agreement.`);
        if (fails.length) return { status: "failed", checks: ["Rule: every Kev and Laya rerun agrees with its first run on at least 99.5% of items, on both tasks.", ...lines] };
        return { status: "pending", checks: ["Rule: every Kev and Laya rerun agrees with its first run on at least 99.5% of items, on both tasks.", ...lines,
          `No scored rerun yet for: ${missing.join(", ")}.`] };
      },
      2: () => {
        const per = TASKS.map((s) => ({ s, r: retest(JEV, s) }));
        if (per.some((p) => !p.r)) return pending("Jev's rerun is not scored on both tasks yet.");
        return { status: per.every((p) => p.r.ac1 >= 0.9) ? "held" : "failed",
          checks: ["Rule: Jev's AC1 is at least 0.90 on both tasks. (The amendment notes this was already observed when it was written.)",
            ...per.map((p) => `${T(p.s)}: AC1 ${fmt(p.r.ac1, 3)} [${fmt(p.r.ac1_lo, 3)}–${fmt(p.r.ac1_hi, 3)}], agreement ${pct(p.r.agreement)}%.`)] };
      },
      3: () => {
        const lines = [], verdicts = [];
        for (const s of TASKS) {
          for (const [id, r] of Object.entries((data.results[s] || { studies: { retest: {} } }).studies.retest)) {
            if (r.changed < 20) { lines.push(`${L(id)} on ${T(s)}: ${r.changed} changes, under the 20 the rule needs.`); continue; }
            const sum = (rows) => rows.reduce((a, x) => ({ n: a.n + x.n, c: a.c + x.changed }), { n: 0, c: 0 });
            const lo = sum(r.depth.filter((x) => Number(x.value) <= 2)), hi = sum(r.depth.filter((x) => Number(x.value) >= 3));
            const ok = hi.c / hi.n > lo.c / lo.n;
            verdicts.push(ok);
            lines.push(`${L(id)} on ${T(s)}: ${pct(hi.c / hi.n)}% of answers changed at depths 3 to 5 (${hi.c} of ${hi.n}) against ${pct(lo.c / lo.n)}% at depths 0 to 2 (${lo.c} of ${lo.n}).`);
          }
        }
        const others = ["kev-0.8b", "kev-4b", LAYA, LUNA].filter((id) => TASKS.some((s) => !retest(id, s)));
        const rule = "Rule: for every model with at least 20 changed answers, the share that changes is higher at depths 3 and above than at depths 0 to 2.";
        if (verdicts.some((v) => !v)) return { status: "failed", checks: [rule, ...lines] };
        if (others.length) return { status: verdicts.length ? "held so far" : "pending", checks: [rule, ...lines, `Reruns not yet scored: ${others.map(L).join(", ")}.`] };
        return { status: "held", checks: [rule, ...lines] };
      },
    },
  },
];

// Amendment 6: the GPT-6 Luna log-probability probe, outside the scored benchmark. Checked against
// probes/luna-logprobs/analysis.json.
const probeTask = (slug) => (data.probe && data.probe.tasks[slug]) || null;
const probeReady = () => TASKS.every((s) => probeTask(s));
SECTIONS.push({
  match: /^Amendment 6/, title: "Luna confidence probe", model: LUNA,
  checks: {
    1: () => {
      if (!probeReady()) return pending("The probe's analysis is not available yet.");
      const per = TASKS.map((s) => ({ s, v: probeTask(s).ece }));
      return { status: per.every((p) => p.v > 0.15) ? "held" : per.every((p) => p.v <= 0.15) ? "failed" : "mixed",
        checks: ["Rule: Luna's expected calibration error is above 0.15 on each task.", ...per.map((p) => `${T(p.s)}: ECE ${fmt(p.v, 3)}.`)] };
    },
    2: () => {
      if (!probeReady()) return pending("The probe's analysis is not available yet.");
      const per = TASKS.map((s) => ({ s, v: probeTask(s).wrong_at_95, n: probeTask(s).wrong }));
      return { status: per.every((p) => p.v >= 0.5) ? "held" : per.every((p) => p.v < 0.5) ? "failed" : "mixed",
        checks: ["Rule: at least half of Luna's wrong answers are stated at 95% or more, on each task.", ...per.map((p) => `${T(p.s)}: ${pct(p.v)}% of ${p.n} wrong answers.`)] };
    },
    3: () => {
      if (!probeReady()) return pending("The probe's analysis is not available yet.");
      const per = TASKS.map((s) => ({ s, l: probeTask(s).auroc, j: (probeTask(s).other_engines_same_items.jev || {}).auroc }));
      if (per.some((p) => p.j == null)) return pending("Jev's probabilities on the probe's items are not available.");
      return { status: per.every((p) => p.l < p.j) ? "held" : per.every((p) => p.l >= p.j) ? "failed" : "mixed",
        checks: ["Rule: Luna's AUROC is below Jev's on each task, on the same items.", ...per.map((p) => `${T(p.s)}: Luna ${fmt(p.l, 3)}, Jev ${fmt(p.j, 3)}.`)] };
    },
    4: () => {
      if (!probeReady()) return pending("The probe's analysis is not available yet.");
      const per = TASKS.map((s) => {
        const t = probeTask(s), all = t.options.length;
        const n = Object.values(t.options_disclosed).reduce((a, b) => a + b, 0);
        const fewer = Object.entries(t.options_disclosed).filter(([k]) => Number(k) < all).reduce((a, [, v]) => a + v, 0);
        return { s, fewer, n, all };
      });
      return { status: per.every((p) => p.fewer > p.n / 2) ? "held" : per.every((p) => p.fewer <= p.n / 2) ? "failed" : "mixed",
        checks: ["Rule: on more than half of the responses, fewer than all of the task's options are disclosed.",
          ...per.map((p) => `${T(p.s)}: ${p.fewer.toLocaleString("en-US")} of ${p.n.toLocaleString("en-US")} responses disclose fewer than all ${p.all} options.`)] };
    },
  },
});

export const STATUS_WORDS = { held: "Held", failed: "Failed", "partly held": "Partly held", mixed: "Mixed", pending: "Pending", "no claim": "No claim", "held so far": "Held so far" };
export const STATUS_CLASS = { held: "v-held", failed: "v-failed", "partly held": "v-part", mixed: "v-part", pending: "v-pending", "no claim": "v-none", "held so far": "v-held" };

let cache = null;
export function predictions() {
  if (cache) return cache;
  const out = [];
  for (const sec of data.prereg.sections) {
    const def = SECTIONS.find((d) => d.match.test(sec.heading));
    if (!def || !sec.predictions.length) continue;
    out.push({ heading: sec.heading, title: def.title, model: def.model, id: def.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      predictions: sec.predictions.map((p) => {
        const check = def.checks[p.n];
        const v = check ? check() : { status: "pending", checks: ["No check is defined for this prediction yet."] };
        return { n: p.n, text: p.text, ...v };
      }) });
  }
  cache = out;
  return out;
}

export function tally() {
  const t = {};
  for (const s of predictions()) for (const p of s.predictions) t[p.status] = (t[p.status] || 0) + 1;
  return t;
}
export const predictionsFor = (modelId) => predictions().filter((s) => s.model === modelId || (modelId === "kev-9b" && s.model === "kev-4b"));

// One line per preregistration section about these models, for the model pages: "2 of 3
// predictions about Kev-0.8B held", linking to the section on How we measured. A model with no
// section of its own gets a line for each other prediction that names it.
export function predictionLines(ids) {
  const secs = predictions();
  const own = secs.filter((s) => ids.includes(s.model) || (ids.includes("kev-9b") && s.model === "kev-4b"));
  const lines = own.map((s) => {
    const counted = s.predictions.filter((p) => p.status !== "no claim");
    const held = counted.filter((p) => /held/.test(p.status) && p.status !== "partly held").length;
    const rest = Object.entries(counted.reduce((t, p) => { if (!(/held/.test(p.status) && p.status !== "partly held")) t[p.status] = (t[p.status] || 0) + 1; return t; }, {}))
      .map(([k, v]) => `${v} ${STATUS_WORDS[k].toLowerCase()}`);
    return { section: s.id, text: `${held} of ${counted.length} predictions about ${s.title} held${rest.length ? ` (${rest.join(", ")})` : ""}` };
  });
  const names = ids.map((id) => (modelById[id] ? modelById[id].label : id));
  const family = ids.some((id) => /^kev-/.test(id)) ? ["Kev"] : [];
  if (ids.includes("jev")) return lines;
  for (const s of secs.filter((x) => !own.includes(x))) for (const p of s.predictions) {
    if ([...names, ...family].some((n) => new RegExp(`\\b${n.replace(/[.]/g, "\\.")}\\b`).test(p.text)))
      lines.push({ section: s.id, text: `${s.title} prediction ${p.n}, which names ${listNames(names, family, p.text)}: ${STATUS_WORDS[p.status].toLowerCase()}` });
  }
  return lines;
}
function listNames(names, family, text) {
  const hit = [...names, ...family].filter((n) => text.includes(n));
  return hit.length > 1 ? `${hit.slice(0, -1).join(", ")} and ${hit.at(-1)}` : hit[0];
}

// Amendment 7: GLiDE. Kev-9B is the best open model; there is no GLiDE-minus-Kev paired study, so the
// overall rule uses the stricter test that the two 95% intervals do not overlap.
const GLIDE = "glide";
SECTIONS.push({
  match: /^Amendment 7/, title: "GLiDE", model: GLIDE,
  checks: {
    1: () => {
      if (!ready([GLIDE, KEV9])) return pending(notReady([GLIDE, KEV9]));
      const per = TASKS.map((s) => ({ s, g: overall(GLIDE, s), k: overall(KEV9, s) }));
      const ok = per.map((p) => p.g.lo > p.k.hi);
      return { status: ok.every(Boolean) ? "held" : ok.some(Boolean) ? "mixed" : "failed",
        checks: ["Rule: on each task, GLiDE's 95% interval lies wholly above Kev-9B's (stricter than a paired interval excluding zero).",
          ...per.map((p) => `${T(p.s)}: GLiDE ${pct(p.g.accuracy)}% [${pct(p.g.lo)}–${pct(p.g.hi)}], Kev-9B ${pct(p.k.accuracy)}% [${pct(p.k.lo)}–${pct(p.k.hi)}].`)] };
    },
    2: () => {
      if (!ready([GLIDE, KEV9])) return pending(notReady([GLIDE, KEV9]));
      const per = TASKS.flatMap((s) => [3, 4, 5].map((d) => ({ s, d, g: axisRow(GLIDE, s, "depth", String(d)), k: axisRow(KEV9, s, "depth", String(d)) })));
      const ok = per.map((p) => p.g.accuracy > p.k.accuracy);
      return { status: ok.every(Boolean) ? "held" : ok.some(Boolean) ? "partly held" : "failed",
        checks: ["Rule: at each of depths 3, 4 and 5 on each task, GLiDE's accuracy is above Kev-9B's. (No interval was preregistered, so it is a point comparison; where the intervals overlap it is noted.)",
          ...per.map((p) => `${T(p.s)} depth ${p.d}: GLiDE ${pct(p.g.accuracy)}%, Kev-9B ${pct(p.k.accuracy)}%${p.g.lo > p.k.hi ? "" : " (intervals overlap)"}.`)] };
    },
    3: () => fallsVerdict(GLIDE),
    4: () => {
      if (!probeReady()) return pending("The probe's analysis is not available yet.");
      const per = TASKS.map((s) => ({ s, l: probeTask(s).auroc, g: (probeTask(s).other_engines_same_items.glide || {}).auroc }));
      if (per.some((p) => p.g == null)) return pending("GLiDE's probabilities on the probe's items are not available.");
      return { status: per.every((p) => p.g > p.l) ? "held" : per.every((p) => p.g <= p.l) ? "failed" : "mixed",
        checks: ["Rule: GLiDE's AUROC is above GPT-6 Luna's probe AUROC on each task, on the same items.", ...per.map((p) => `${T(p.s)}: GLiDE ${fmt(p.g, 3)}, Luna ${fmt(p.l, 3)}.`)] };
    },
  },
});
