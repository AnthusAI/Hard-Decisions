// The fixed words: each page's heading and introduction (the heading is also its social card's
// headline), the search query it answers, the caveats panel and the comparisons. Numbers are never
// typed here; pages read them from the data file.
import { modelById, models, pendingModels } from "./site.js";

export const honesty = [
  { id: "synthetic", title: "ProofWriter is synthetic",
    text: "Its theories are generated from templates (some reworded by people), and models may have seen it in training. It measures one kind of reasoning, not decisions in your domain." },
  { id: "protocol", title: "One protocol for every model",
    text: "Each model answered each item once, with the same question and the same options. GPT-6 Luna ran with reasoning off, its lowest setting, as a direct classifier; another setting would be another model." },
  { id: "latency", title: "Latency is not like for like",
    text: "Hosted models' times include the network and the vendor's servers. Open models ran on one laptop. Compare speed within a setting, not across settings." },
  { id: "descriptive", title: "Only depth is controlled",
    text: "The sample balances proof depth and the answer. Other breakdowns, such as negation, length or paraphrase, move with depth and with each other: they show where errors fall, not why." },
  { id: "predictions", title: "Predictions came first",
    text: "We wrote down what we expected before any model answered, and report each prediction as held or failed, including the ones we got wrong." },
  { id: "replay", title: "Every number re-runs offline",
    text: "Scores are computed from the saved answers; one command rebuilds them without calling a model. Results still being scored are marked as such, never filled in." },
];

export const intro = {
  home: { title: "Decision model benchmark: how accuracy falls as reasoning gets deeper",
    query: "decision model benchmark",
    intro: "Fast decision models and LLM classifiers answer a question about a text in one step. We gave them 3,600 multi-hop reasoning problems from ProofWriter, from statements read straight off the page to ones that need five chained inferences, and measured where each one breaks." },
  models: { title: "Every decision model and LLM classifier we tested", query: "decision model comparison",
    intro: "Each model answered the same 1,800 problems on each task, one request per problem. Here is how they compare, with what each one is, how big it is and where it ran." },
  compare: { title: "Head-to-head comparisons on the same problems", query: "Jev vs LLM",
    intro: "Each comparison is paired: both models answered exactly the same items, so the difference between them has its own 95% interval." },
  breakdowns: { title: "Where decision models fail: every breakdown", query: "ProofWriter results",
    intro: "Accuracy broken down by every property ProofWriter records about a problem. Proof depth is the controlled difficulty axis; the others are descriptive." },
  methodology: { title: "How the ProofWriter benchmark was run", query: "evaluating decision models methodology",
    intro: "What the models were asked, which problems they saw, how answers were scored, and what the numbers can and cannot tell you." },
  preregistration: { title: "Preregistered predictions: which held and which failed", query: "preregistered benchmark predictions",
    intro: "Before any model answered an item, we wrote down what we expected. Each prediction is quoted word for word below and checked against the scored results, by the rule stated beside it." },
  repeatability: { title: "Decision model consistency: does the same model give the same answer twice?", query: "decision model calibration and consistency",
    intro: "A decision you cannot repeat is hard to audit. We asked each model every question a second time and counted how many answers changed; for models that report probabilities, we also checked how well those probabilities match how often they are right." },
  latency: { title: "Decision model latency: time per decision", query: "decision model latency",
    intro: "How long one decision takes, measured around each request, one request at a time. Hosted models were timed over the network against the vendor's servers; open models on a laptop. The two are not like for like." },
  sizes: { title: "Model sizes and memory: what it takes to run each model", query: "open-source Jev alternative hardware",
    intro: "Parameters, weights on disk, the hardware each maker states, and the memory the open models used on our laptop." },
  evaluating: { title: "Evaluating decision models: what a deep-reasoning benchmark shows", query: "evaluating decision models",
    intro: "Overall accuracy hides most of what matters when you evaluate a decision model. This benchmark shows four things a single number would have missed, and how to check each one on your own decisions." },
  finetuning: { title: "Fine-tuning decision models: where they fail and what to train on", query: "fine-tuning decision models",
    intro: "The failures in this benchmark are specific enough to plan training data around: deep proofs, the unknown answer, reworded rules and a lean toward one answer. Here is what the results show, model by model." },
  aligning: { title: "Aligning decision models with the decision you mean", query: "aligning decision models",
    intro: "A decision model can be accurate and still answer a different question from the one you meant. The open-world and closed-world tasks ask the same problems under two rules for what \"unknown\" means; the gap between them is an alignment problem you can measure." },
  about: { title: "Who makes this and how we tested each model", query: "Hard-Decisions benchmark",
    intro: "Who makes this site, how it is funded, and how each model was reached." },
};

const kevIds = ["kev-9b", "kev-4b", "kev-0.8b"];
export const comparisons = [
  { slug: "jev-vs-gpt-6-luna", a: "jev", b: ["openai-gpt-6-luna-effort-none"], query: "Jev vs LLM",
    title: "Jev vs GPT-6 Luna: a decision model against an LLM classifier",
    intro: "Jev is built to make one decision per request. GPT-6 Luna is a general large language model, used here as a classifier with reasoning off. Both answered the same 3,600 problems." },
  { slug: "jev-vs-kev", a: "jev", b: kevIds, query: "Kev vs Jev",
    title: "Kev vs Jev: is an open-source decision model a Jev alternative?",
    intro: "Kev is an open decision model you can run on your own hardware; Jev is hosted. We ran every Kev size that fits a 32 GB laptop against Jev on the same problems." },
  { slug: "kev-sizes", a: "kev-4b", b: ["kev-0.8b", "kev-9b"], query: "Kev 0.8B vs 4B vs 9B",
    title: "Kev model sizes: does a bigger Kev reason better?",
    intro: "Kev comes in several sizes built the same way on bigger base models. We preregistered that bigger would be better. Here is what the same problems show." },
  { slug: "jev-vs-laya", a: "jev", b: ["laya"], query: "Jev vs Laya",
    title: "Jev vs Laya: hosted and open decision models on deep reasoning",
    intro: "Laya is a small open decision model built on an encoder. Both it and Jev answered the same problems." },
];
export const comparisonBySlug = Object.fromEntries(comparisons.map((c) => [c.slug, c]));
// A comparison has a page once both sides have scored results.
export const liveComparisons = comparisons.filter((c) => modelById[c.a] && modelById[c.a].measured && c.b.some((id) => modelById[id] && modelById[id].measured));
export const comparisonsFor = (id) => liveComparisons.filter((c) => c.a === id || c.b.includes(id));

export const modelQuery = (m) => ({
  jev: "Jev accuracy", "openai-gpt-6-luna-effort-none": "GPT-6 Luna classifier accuracy", laya: "Laya decision model accuracy",
}[m.id] || `${m.label} accuracy`);
export const modelTitle = (m) => ({
  jev: "Jev accuracy on multi-hop reasoning",
  "openai-gpt-6-luna-effort-none": "GPT-6 Luna as a classifier: accuracy with reasoning off",
  laya: "Laya accuracy on multi-hop reasoning",
}[m.id] || `${m.label} accuracy on multi-hop reasoning`);
export { models, pendingModels };
