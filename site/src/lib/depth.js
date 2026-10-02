// The worked examples of proof depth (studies/depth-examples.json, written by tools/depth_examples.py):
// which lines of each problem its proof uses, and a plain sentence on what makes it that depth. The
// selection is fixed and blind to the answers, and picks the shortest theory at each depth, so these
// items are easier than typical problems at their depth.
import { data, modelById } from "./site.js";

export const depthData = data.depthExamples;
export const depthExamples = (slug) => (depthData && depthData.tasks[slug]) || [];
export const theoryId = (ex) => ex.id.replace(/-Q\d+$/, "");

// The facts and rules the proof uses, by their text.
export function used(ex) {
  const facts = new Set(), rules = new Set();
  if (ex.stated_fact) facts.add(ex.stated_fact.text);
  for (const s of ex.steps) {
    rules.add(s.rule_text);
    for (const u of s.uses) if (u.kind === "fact") facts.add(u.text);
  }
  return { facts, rules };
}

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const n = (k) => NUM[k] || String(k);
const plural = (k, w) => `${n(k)} ${w}${k === 1 ? "" : "s"}`;

// What makes this example this depth, from its own proof.
export function whyThisDepth(ex, prev = null) {
  const u = used(ex);
  const distractFacts = ex.facts.length - u.facts.size, distractRules = ex.rules.length - u.rules.size;
  const parts = [];
  if (ex.depth === 0) {
    parts.push(`The statement is one of the facts, word for word, so no rule is needed: depth 0.`);
  } else {
    const derived = ex.steps.slice(0, -1).map((s) => `"${s.conclusion_text.replace(/\.$/, "")}"`);
    parts.push(`The answer takes ${plural(ex.depth, "rule application")}${ex.depth > 1 ? " in a chain" : ""}${derived.length ? `: each new fact (${derived.join(", ")}) feeds the next rule` : ""}, so it is depth ${ex.depth}.`);
    const both = ex.steps.filter((s) => s.uses.length > 1).length;
    if (both) parts.push(`${both === ex.steps.length ? "Every step needs" : both === 1 ? "One step needs" : `${cap(n(both))} steps need`} two premises at once, which the model must keep track of.`);
  }
  const extra = [distractFacts ? plural(distractFacts, "fact") : null, distractRules ? plural(distractRules, "rule") : null].filter(Boolean);
  if (extra.length) parts.push(`${cap(extra.join(" and "))} in the text ${distractFacts + distractRules === 1 ? "is not needed: a distractor" : "are not needed: distractors"}.`);
  if (prev && theoryId(prev) === theoryId(ex)) parts.push(`This is the same text as the depth ${prev.depth} example, with ${ex.facts.length} facts and ${ex.rules.length} rules either way; only the statement changes, and it sits one step further down the same chain. Depth is the length of the chain, not the number of facts or rules.`);
  return parts.join(" ");
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Each example's heading, from its depth.
export function depthHeading(ex) {
  if (ex.depth === 0) return "Depth 0: the answer is written down";
  if (ex.depth === 1) return "Depth 1: one rule";
  return `Depth ${ex.depth}: ${n(ex.depth)} rules in a chain`;
}

// The models in a fixed display order, with their answers on this example.
export function answersOf(ex) {
  const order = ["jev", "glide", "openai-gpt-6-luna-effort-none", "kev-9b", "kev-4b", "kev-0.8b", "laya"];
  const ids = [...order.filter((id) => ex.answers[id]), ...Object.keys(ex.answers).filter((id) => !order.includes(id))];
  return ids.map((id) => ({ id, m: modelById[id] || null, ...ex.answers[id] }));
}
