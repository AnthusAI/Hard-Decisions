// The words and numbers on every page's social card. og.js draws them; Base.astro puts the card's
// URL, alt text, title and description in the page's metadata. A card's headline is always its
// page's heading, and every number on a card is also on its page (test/build.test.mjs checks both).
import { createHash } from "node:crypto";
import { data, models, modelById, urls, axes, groups, axisByKey, OWA, CWA, taskBySlug, pct, pts, int, fmt, overall, axisRow, isComplete,
  ranked, leader, latency, retest, axisSpread, valueLabel, L, listOf } from "./site.js";
import { intro, liveComparisons, modelTitle } from "./content.js";
import { predictions, tally, STATUS_WORDS } from "./predictions.js";
import { coinFlipClaim } from "./insights.js";

export const STAMP = `v${data.provenance.version} · ${data.provenance.generated}`;
const complete = (slug) => ranked(slug).filter((x) => x.complete);
// Descriptions stay within 320 characters (test/build.test.mjs): drop whole sentences from the end.
export const fit = (text, max = 320) => {
  let out = text;
  while (out.length > max && /[.!?]\s+\S[^]*$/.test(out)) out = out.replace(/\s+[^.!?]*[.!?]?\s*$/, "").replace(/([^.!?])$/, "$1.");
  return out;
};
const bar = (id, value) => ({ engine: id, value, text: `${pct(value)}%`, alt: `${pct(value)}%` });

// ---------------------------------------------------------------------------------------------
// Facts several pages and cards share
// ---------------------------------------------------------------------------------------------
export function depthDrop(id, slug) {
  const d0 = axisRow(id, slug, "depth", "0"), d5 = axisRow(id, slug, "depth", "5");
  return d0 && d5 ? { d0, d5, drop: d0.accuracy - d5.accuracy } : null;
}
export function axisLead(axisKey, slug = OWA) {
  const top = leader(slug);
  if (!top) return null;
  const s = axisSpread(top.m.id, slug, axisKey);
  return s ? { id: top.m.id, ...s } : null;
}
export const axisLeadText = (axisKey, slug = OWA) => {
  const a = axisLead(axisKey, slug);
  return a ? `On the open-world task, ${L(a.id)}'s accuracy ranges from ${pct(a.lo.accuracy)}% (${valueLabel(axisKey, a.lo.value)}) to ${pct(a.hi.accuracy)}% (${valueLabel(axisKey, a.hi.value)}), a spread of ${pct(a.spread)} points` : null;
};

// ---------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------
function homeCard() {
  const c = complete(OWA);
  const top = c[0];
  const claim = coinFlipClaim();
  if (claim) return { template: "home", headline: intro.home.title,
    description: fit(`${claim.sentence} ${c.length} models, 3,600 ProofWriter reasoning problems, results by proof depth with 95% intervals.`),
    bars: c.slice(0, 5).map((x) => bar(x.m.id, x.r.accuracy)), rows: [{ engine: claim.lead, text: claim.short }],
    numberNote: "accuracy on 1,800 open-world problems (true, false or unknown)" };
  const description = top ? `${c.length} models on 3,600 ProofWriter reasoning problems. ${L(top.m.id)} leads the open-world task at ${pct(top.r.accuracy)}%${c[1] ? `, ahead of ${L(c[1].m.id)} at ${pct(c[1].r.accuracy)}%` : ""}. Accuracy by proof depth, paired comparisons, repeatability and latency.` : intro.home.intro;
  return { template: "home", headline: intro.home.title, description, bars: c.slice(0, 5).map((x) => bar(x.m.id, x.r.accuracy)), rows: [],
    numberNote: "accuracy on 1,800 open-world problems (true, false or unknown)" };
}

function modelCard(m) {
  const o = overall(m.id, OWA), c = overall(m.id, CWA);
  const owaDone = isComplete(m.id, OWA), cwaDone = isComplete(m.id, CWA);
  const dd = owaDone ? depthDrop(m.id, OWA) : null;
  const rows = [];
  const claim = coinFlipClaim();
  if (claim && claim.lead === m.id) rows.push({ engine: m.id, text: claim.short });
  if (cwaDone) rows.push({ engine: m.id, text: `${pct(c.accuracy)}% on the closed-world task (true or false)` });
  if (dd) rows.push({ text: `Open world: ${pct(dd.d0.accuracy)}% at depth 0, ${pct(dd.d5.accuracy)}% at depth 5` });
  const description = owaDone
    ? `${m.label} scored ${pct(o.accuracy)}% on 1,800 open-world ProofWriter problems${cwaDone ? ` and ${pct(c.accuracy)}% on 1,800 closed-world ones` : ""}${dd ? `; ${pct(dd.d0.accuracy)}% at proof depth 0 and ${pct(dd.d5.accuracy)}% at depth 5` : ""}. Results by depth, answer class, negation and paraphrase, with intervals.`
    : `${m.label} on the Hard-Decisions benchmark: results so far, marked as partial while scoring finishes.`;
  return { template: "model", headline: modelTitle(m), description,
    number: owaDone ? `${pct(o.accuracy)}%` : null, numberNote: owaDone ? "accuracy on 1,800 open-world problems" : null,
    rows: owaDone ? rows : [{ engine: m.id, text: "Scoring in progress: partial results only" }] };
}

function comparisonCard(cmp) {
  const a = cmp.a;
  const others = cmp.b.filter((id) => modelById[id] && isComplete(id, OWA) && isComplete(a, OWA));
  const bars = [a, ...others].filter((id) => isComplete(id, OWA)).map((id) => bar(id, overall(id, OWA).accuracy));
  const claim = coinFlipClaim();
  const strong = claim && [a, ...cmp.b].includes(claim.lead) && cmp.b.concat(a).some((id) => claim.others.includes(id)) ? `${claim.short}. ` : "";
  const description = bars.length > 1 ? fit(`${strong}${cmp.intro} On the open-world task: ${bars.map((b) => `${L(b.engine)} ${b.text}`).join(", ")}. Paired differences by proof depth, with 95% intervals.`) : cmp.intro;
  if (bars.length < 2) return { template: "compare", headline: cmp.title, description: `${cmp.intro} Partial results while scoring finishes.`,
    rows: [{ text: "Scoring in progress: partial results only" }] };
  return { template: "compare", headline: cmp.title, description, bars, rows: [], numberNote: "accuracy on the same 1,800 open-world problems" };
}

function axisCard(axis) {
  const a = axisLead(axis.key);
  const c = complete(OWA);
  const first = `${axis.what.split(". ")[0]}.`;
  const description = a ? `${axisLeadText(axis.key)}. ${first.length < 150 ? `${first} ` : ""}Every model, both tasks, with 95% intervals.` : axis.what;
  if (axis.key === "depth") {
    const bars = c.map((x) => bar(x.m.id, axisRow(x.m.id, OWA, "depth", "5").accuracy));
    const claim = coinFlipClaim();
    return { template: "axis", headline: axis.h1, description: claim ? fit(`${claim.sentence} Every model, both tasks, with 95% intervals.`) : description,
      bars, rows: claim ? [{ engine: claim.lead, text: claim.short }] : [], numberNote: "accuracy at proof depth 5 (five chained inferences), open world" };
  }
  return { template: "axis", headline: axis.h1, description, number: a ? `${pct(a.spread)} points` : null,
    numberNote: a ? `${L(a.id)}'s spread across ${axis.label.toLowerCase()}, open world` : null,
    rows: a ? [{ engine: a.id, text: `${pct(a.lo.accuracy)}% on ${valueLabel(axis.key, a.lo.value)}, ${pct(a.hi.accuracy)}% on ${valueLabel(axis.key, a.hi.value)}` }] : [] };
}

function groupCard(g) {
  if (g.single) return { ...axisCard(g.axes[0]), headline: g.h1 };
  const leads = g.axes.map((a) => ({ a, l: axisLead(a.key) })).filter((x) => x.l);
  return { template: "axis", headline: g.h1, description: fit(`${g.what} Every model, both tasks, with 95% intervals.`),
    rows: leads.slice(0, 2).map(({ a, l }) => ({ engine: l.id, text: `${L(l.id)}: ${pct(l.lo.accuracy)}% to ${pct(l.hi.accuracy)}% by ${a.label.toLowerCase()}` })) };
}

function hubCard(key, extra = {}) {
  const c = complete(OWA);
  return { template: "hub", headline: intro[key].title, description: intro[key].intro, bars: c.slice(0, 5).map((x) => bar(x.m.id, x.r.accuracy)), rows: [],
    numberNote: "accuracy on 1,800 open-world problems", ...extra };
}


function repeatCard() {
  const r = retest("jev", OWA), r2 = retest("jev", CWA);
  if (!r) return { template: "topic", headline: intro.repeatability.title, description: intro.repeatability.intro, rows: [{ text: "Reruns in progress" }] };
  const others = models.filter((m) => m.id !== "jev").map((m) => ({ id: m.id, r: retest(m.id, OWA) })).filter((x) => x.r);
  return { template: "topic", headline: intro.repeatability.title,
    description: `Asked every question twice, Jev gave the same answer on ${pct(r.agreement)}% of open-world items${r2 ? ` and ${pct(r2.agreement)}% of closed-world ones` : ""} (Gwet's AC1 ${fmt(r.ac1, 3)}).${others.length ? ` ${listOf(others.map((x) => `${L(x.id)} ${pct(x.r.agreement)}%`))}.` : ""} Calibration of each model's probabilities, from its saved answers.`,
    number: `${pct(r.agreement)}%`, numberNote: "of Jev's open-world answers were the same when asked twice",
    rows: [{ engine: "jev", text: `Gwet's AC1 ${fmt(r.ac1, 3)}; ${r.changed} of ${int(r.n)} answers changed` }] };
}

function latencyCard() {
  const l = latency("jev", OWA);
  if (!l) return { template: "topic", headline: intro.speed.title, description: intro.speed.intro, rows: [{ text: "Timing runs in progress" }] };
  return { template: "topic", headline: intro.speed.title,
    description: `Jev took a median ${Math.round(l.p50)} ms per decision on the open-world task, measured over the network against TypeSafe's servers. Open models were timed on a laptop, so the numbers are not like for like. Parameters, weights and memory for every model.`,
    number: `${Math.round(l.p50)} ms`, numberNote: "Jev's median time per open-world decision, over the network",
    rows: [{ text: "Hosted models timed against vendor servers; open models on a laptop" }] };
}


function depth5Card(key) {
  const c = complete(OWA);
  const bars = c.map((x) => bar(x.m.id, axisRow(x.m.id, OWA, "depth", "5").accuracy));
  return { template: "topic", headline: intro[key].title, description: intro[key].intro, bars, rows: [], numberNote: "accuracy at proof depth 5, open world" };
}

function measuredCard() {
  const n = data.tasks.reduce((a, t) => a + t.n, 0);
  const t = tally();
  const total = Object.values(t).reduce((a, b) => a + b, 0) - (t["no claim"] || 0);
  const held = (t.held || 0) + (t["held so far"] || 0);
  return { template: "topic", headline: intro.measured.title, description: fit(`${intro.measured.intro} So far ${held} of ${total} predictions held.`), number: int(n),
    numberNote: `problems: ${int(taskBySlug[OWA].n)} per task, about 300 per proof depth`,
    rows: [{ text: "One request per problem, the same question for every model" }, { text: `${held} of ${total} predictions held so far` }] };
}

function aboutCard() {
  return { template: "topic", headline: intro.about.title, description: intro.about.intro,
    rows: [{ text: "Anthus AI Solutions made this. It's self-funded." }, { text: `Models: ${listOf(models.map((m) => m.label))}` }] };
}

// ---------------------------------------------------------------------------------------------
// Every page's card, by page path
// ---------------------------------------------------------------------------------------------
const LAYOUT = 1;
const hashOf = (card) => createHash("sha256").update(JSON.stringify({ LAYOUT, card })).digest("hex").slice(0, 10);

export function altOf(c) {
  const parts = [`${c.headline}${c.number ? `: ${c.number} ${c.numberNote}` : ""}.`];
  if (c.bars) { if (c.numberNote) parts.push(`${c.numberNote.charAt(0).toUpperCase()}${c.numberNote.slice(1)}.`); for (const b of c.bars) parts.push(`${L(b.engine)}: ${b.alt || b.text}.`); }
  for (const r of c.rows) parts.push(`${r.text}.`);
  parts.push(`Hard-Decisions benchmark, ${c.stamp.replace(" · ", ", ")}.`);
  return parts.join(" ");
}

function finish(path, card) {
  const c = { ...card, rows: card.rows.slice(0, card.bars ? 0 : 2), stamp: STAMP };
  const hash = hashOf(c);
  const base = urls.home();
  const rel = path.slice(base.length).replace(/\/$/, "") || "index";
  return { ...c, path, hash, slug: `${rel}.${hash}`, url: `${base}og/${rel}.${hash}.png`, alt: altOf(c) };
}

let cache = null;
export function allCards() {
  if (cache) return cache;
  const out = [];
  out.push(finish(urls.home(), homeCard()));
  out.push(finish(urls.models(), hubCard("models")));
  out.push(finish(urls.model("jev"), modelCard(modelById.jev)));
  for (const c of liveComparisons) out.push(finish(urls.comparison(c.slug), comparisonCard(c)));
  out.push(finish(urls.breakdowns(), hubCard("breakdowns", { bars: complete(OWA).map((x) => bar(x.m.id, axisRow(x.m.id, OWA, "depth", "5").accuracy)), numberNote: "accuracy at proof depth 5, open world" })));
  for (const g of groups) out.push(finish(urls.group(g.slug), groupCard(g)));
  out.push(finish(urls.measured(), measuredCard()));
  out.push(finish(urls.page("repeatability"), repeatCard()));
  out.push(finish(urls.speed(), latencyCard()));
  out.push(finish(urls.page("evaluating-decision-models"), depth5Card("evaluating")));
  out.push(finish(urls.page("fine-tuning-decision-models"), depth5Card("finetuning")));
  out.push(finish(urls.page("aligning-decision-models"), { ...hubCard("aligning"), template: "topic" }));
  out.push(finish(urls.page("about"), aboutCard()));
  cache = out;
  return out;
}

export function cardFor(path) {
  return allCards().find((c) => c.path === path) || null;
}
