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
  { id: "cost", title: "Costs are list prices",
    text: "A hosted model's cost is its published price times the tokens its own API reported. Discounts, free tiers and invoices are not included; open models have no API cost, only the hardware they run on." },
  { id: "replay", title: "Every number re-runs offline",
    text: "Scores are computed from the saved answers; one command rebuilds them without calling a model. Results still being scored are marked as such, never filled in." },
];

export const intro = {
  home: { title: "Decision model benchmark: how accuracy falls as reasoning gets deeper",
    query: "decision model benchmark",
    intro: "Fast decision models and LLM classifiers answer a question about a text in one step. We gave them 3,600 multi-hop reasoning problems from ProofWriter, from statements read straight off the page to ones that need five chained inferences, and measured where each one breaks." },
  models: { title: "Every decision model and LLM classifier we tested, compared with Jev", query: "decision model comparison",
    intro: "Each model answered the same 1,800 problems on each task, one request per problem. Here is how they compare overall and head to head with Jev, with what each one is and where it ran. Every rival has one page: its comparison with Jev." },
  compare: { title: "Head-to-head comparisons on the same problems", query: "Jev vs LLM",
    intro: "Each comparison is paired: both models answered exactly the same items, so the difference between them has its own 95% interval." },
  breakdowns: { title: "Where decision models fail: every breakdown", query: "ProofWriter results",
    intro: "Accuracy broken down by every property ProofWriter records about a problem. Proof depth is the controlled difficulty axis; the others are descriptive." },
  measured: { title: "How we measured decision model accuracy on ProofWriter", query: "evaluating decision models methodology",
    intro: "What the models were asked, which problems they saw, how answers were scored, what the numbers cannot tell you." },
  repeatability: { title: "Decision model consistency: does the same model give the same answer twice?", query: "decision model calibration and consistency",
    intro: "A decision you cannot repeat is hard to audit. We asked each model every question a second time and counted how many answers changed; for models that report probabilities, we also checked how well those probabilities match how often they are right." },
  speed: { title: "Decision model speed, size and memory: what each model needs to run", query: "decision model latency",
    intro: "How long one decision takes, how big each model is, what hardware its maker states, and how much memory the open models used on our laptop." },
  asked: { title: "Exactly what each model was asked, and what it answered", query: "decision model API request examples",
    intro: "The request each model received for the same problems, field for field, and the answer it sent back, taken from the saved records. Every model got the same problem, the same question and the same meaning for each answer; where a model's interface is shaped differently, this shows exactly where each piece went." },
  cost: { title: "Decision model cost per decision: Jev, GLiDE, GPT-6 Luna and the OpenAI Decisions API", query: "decision model API cost",
    intro: "What each hosted model cost to answer the same 3,600 problems, at its published list price and the tokens its own API reported, per decision and per correct decision." },
  sizes: { title: "Model sizes and memory", query: "open-source Jev alternative hardware", intro: "Parameters, weights on disk and memory." },
  evaluating: { title: "Evaluating decision models: what a deep-reasoning benchmark shows", query: "evaluating decision models",
    intro: "Overall accuracy hides most of what matters when you evaluate a decision model. This benchmark shows four things a single number would have missed, and how to check each one on your own decisions." },
  finetuning: { title: "Fine-tuning decision models: where they fail and what to train on", query: "fine-tuning decision models",
    intro: "The failures in this benchmark are specific enough to plan training data around: deep proofs, the unknown answer, reworded rules and a lean toward one answer. Here is what the results show, model by model." },
  aligning: { title: "Aligning decision models with the decision you mean", query: "aligning decision models",
    intro: "A decision model can be accurate and still answer a different question from the one you meant. The open-world and closed-world tasks ask the same problems under two rules for what \"unknown\" means; the gap between them is an alignment problem you can measure." },
  preview: { title: "OpenAI Decisions API benchmark: accuracy, confidence and speed on deep reasoning",
    seoTitle: "OpenAI Decisions API benchmark: accuracy, confidence and speed", query: "OpenAI Decisions API",
    intro: "We sent OpenAI's Decisions API, generally available since 22 October 2026, the same 3,600 multi-step reasoning problems as every other model. Here is how accurate it is by proof depth, whether its confidence tells right answers from wrong ones, how fast it answered, and what it cost." },
  depthMeans: { title: "What proof depth means: multi-hop reasoning, step by step, with examples",
    seoTitle: "What proof depth means: multi-hop reasoning examples from ProofWriter", query: "multi-hop reasoning examples",
    intro: "Proof depth is how many rules must be chained to reach an answer. Here is what that means, from a statement written in the text (depth 0) to one that needs five chained inferences (depth 5), with a real ProofWriter problem and its proof at every depth." },
  about: { title: "Who makes this and how we tested each model", query: "Hard-Decisions benchmark",
    intro: "Who makes this site, how it is funded, and how each model was reached." },
};

const kevIds = ["kev-9b", "kev-4b", "kev-0.8b"];
// One page per rival model, written as its comparison with Jev. A model listed here that has no
// scored results yet (Kev-9B) joins its page automatically once it does.
export const comparisons = [
  { slug: "jev-vs-glide", a: "jev", b: ["glide-rerun-2026-10-03", "glide"], query: "Jev vs GLiDE",
    title: "Jev vs GLiDE: two hosted decision models on deep reasoning",
    intro: "GLiDE is Fastino's hosted decision model, released on 1 October 2026, which Fastino calls the first thinking decision model. It takes the same request as Jev, so both got exactly the same text, question and options for the same 3,600 problems.",
    seoTitle: "Jev vs GLiDE: Fastino's thinking decision model on multi-hop reasoning",
    note: "We ran GLiDE twice. The first run was on October 2, the day after launch. On October 3 Fastino's CEO asked us to re-evaluate GLiDE, saying Fastino had problems during the launch, so we ran exactly the same benchmark again with the same request. Both runs are shown side by side. Jev answers every decision in one parallel pass; GLiDE, by Fastino's own description, spends extra time and tokens on decisions it is unsure of. Fastino reports that GLiDE beats Jev on its Decision Index 0.2.1 (64.81 to 57.91); that is Fastino's benchmark, not this one." },
  { slug: "jev-vs-gpt-6-luna", a: "jev", b: ["openai-gpt-6-luna-effort-none"], query: "Jev vs LLM",
    title: "Jev vs GPT-6 Luna: a decision model against an LLM classifier",
    intro: "Jev is built to make one decision per request. GPT-6 Luna is a general large language model, used here as a classifier with reasoning off. Both answered the same 3,600 problems.",
    seoTitle: "Jev vs GPT-6 Luna: a chat-endpoint LLM classifier with reasoning off",
    note: "This is GPT-6 Luna through OpenAI's chat endpoint with reasoning off. OpenAI's dedicated Decisions API, which also serves gpt-6-luna, is a separate entry with its own page." },
  { slug: "jev-vs-openai-decisions-api", a: "jev", b: ["openai-decisions-gpt-6-luna", "openai-gpt-6-luna-effort-none"], query: "OpenAI Decisions API vs Jev",
    title: "Jev vs the OpenAI Decisions API: a decision model against OpenAI's decision endpoint",
    intro: "OpenAI's Decisions API (POST /v1/decisions, model gpt-6-luna) answers a question with a choice, probabilities and a confidence. Jev and the Decisions API answered the same 3,600 problems, and GPT-6 Luna through the chat endpoint is shown beside them.",
    seoTitle: "Jev vs the OpenAI Decisions API: accuracy on multi-step reasoning",
    note: "The Decisions API entry is gpt-6-luna through OpenAI's dedicated endpoint, sent the benchmark's identical instructions and option descriptions. The GPT-6 Luna entry is the same model name through the chat endpoint with reasoning off. We did not test other wordings of the instructions. We do not know why the two endpoints differ." },
  { slug: "jev-vs-kev", a: "jev", b: kevIds, query: "Kev vs Jev",
    title: "Kev vs Jev: is an open-source decision model a Jev alternative?",
    intro: "Kev is an open decision model you can run on your own hardware; Jev is hosted. We ran every Kev size that fits a 32 GB laptop against Jev on the same problems, and asked whether a bigger Kev helps." },
  { slug: "jev-vs-gliner-2-5-decide", a: "jev", b: ["gliner-2.5-decide", "gliner-2.5-decide-labels-only"], query: "GLiNER2.5-Decide vs Jev",
    title: "Jev vs GLiNER2.5-Decide: a hosted decision model against Fastino's open one",
    intro: "GLiNER2.5-Decide is Fastino's open 340M-parameter decision model, released under Apache 2.0, that answers in one pass. We ran it on a laptop against Jev on the same 3,600 problems.",
    note: "Every model received the same problem, the same question and the same meaning for each answer. GLiNER2.5-Decide is shown two ways. GLiNER2.5-Decide: the instructions and the meaning of each answer are in its text, after the problem, because Fastino's API for this model has no separate field for them; given them, it answered unknown to every open-world problem and false to almost every closed-world one. GLiNER2.5-Decide, without instructions: only the problem and the three answer words; its answers vary but stay near chance, even at depth 0, where the answer is written in the text. Fastino's hosted API for this model gave the same answer as our copy on 7,197 of the 7,200 problems in both forms, and the same setup scores 63.7% on Fastino's own benchmark data (Fastino reports 60.2%), so the model is working as published. Asked a plain yes-or-no question in the form its model card shows (“Is it true that …?”, with the facts as the passage), it does better: 76% at depth 0 on held-out ProofWriter problems whose answer is true or false, against Jev's 98% on the benchmark. That form leaves out the instructions, so it is not a benchmark entry." },
  { slug: "jev-vs-laya", a: "jev", b: ["laya"], query: "Jev vs Laya",
    title: "Jev vs Laya: hosted and open decision models on deep reasoning",
    intro: "Laya is a small open decision model built on an encoder. Both it and Jev answered the same problems." },
];
// The OpenAI Decisions API: facts as OpenAI's guide states them (read 2026-11-16) and the sources for the
// secondary log-probability section.
export const DECISIONS_API = {
  sources: {
    guide: { label: "OpenAI's Decisions API guide", url: "https://developers.openai.com/api/docs/guides/decisions" },
    announcement: { label: "OpenAI's announcement of 22 October 2026", url: "https://openai.com/index/decisions-api/" },
    latest: { label: "OpenAI's latest-model guide", url: "https://developers.openai.com/api/docs/guides/latest-model" },
    luna: { label: "GPT-6 Luna's model page", url: "https://developers.openai.com/api/docs/models/gpt-6-luna" },
    gpt4: { label: "GPT-4 Technical Report", url: "https://arxiv.org/abs/2303.08774" },
    carlini: { label: "Carlini et al., 2024", url: "https://arxiv.org/abs/2403.06634" },
    finlayson: { label: "Finlayson et al., 2024", url: "https://arxiv.org/abs/2403.09539" },
    o1: { label: "OpenAI on o1's chain of thought", url: "https://openai.com/index/learning-to-reason-with-llms/" },
  },
};
// How each vendor says its model reaches an answer, quoted, for the Time and money section.
export const VENDOR_DESIGN = {
  "glide-rerun-2026-10-03": null,
  glide: { source: "Fastino", url: "https://fastino.ai/blog/introducing-glide-the-first-thinking-decision-model",
    text: "Fastino is upfront that GLiDE works this way. It writes that \"traditional decision models score a set of options in a single fixed pass,\" while GLiDE \"first produces a fast probability distribution, then allocates additional reasoning when the leading result is uncertain,\" so it can \"spend more computation on difficult decisions while keeping straightforward ones fast.\" Fastino bills that reasoning as tokens, and its API documentation recommends a read timeout of at least 300 seconds." },
  jev: { source: "TypeSafe", url: "https://typesafe.ai/blog/introducing-system-one-models-and-jev",
    text: "TypeSafe describes Jev, a System One model, as generating all outputs \"in a single query,\" in parallel, in 70 to 500 milliseconds, so every decision takes about the same time and money." },
};
export const comparisonBySlug = Object.fromEntries(comparisons.map((c) => [c.slug, c]));
// A comparison has a page once both sides have scored results.
export const liveComparisons = comparisons.filter((c) => modelById[c.a] && modelById[c.a].measured && c.b.some((id) => modelById[id] && modelById[id].measured));
export const comparisonsFor = (id) => liveComparisons.filter((c) => c.a === id || c.b.includes(id));

export const modelQuery = (m) => ({
  jev: "Jev accuracy", "gliner-2.5-decide": "GLiNER2.5-Decide accuracy", glide: "GLiDE decision model accuracy", "openai-gpt-6-luna-effort-none": "GPT-6 Luna classifier accuracy", "openai-decisions-gpt-6-luna": "OpenAI Decisions API accuracy", laya: "Laya decision model accuracy",
}[m.id] || `${m.label} accuracy`);
export const modelTitle = (m) => ({
  jev: "Jev accuracy on multi-hop reasoning",
  "openai-gpt-6-luna-effort-none": "GPT-6 Luna as a classifier: accuracy with reasoning off",
  "openai-decisions-gpt-6-luna": "OpenAI Decisions API accuracy on multi-hop reasoning",
  laya: "Laya accuracy on multi-hop reasoning",
}[m.id] || `${m.label} accuracy on multi-hop reasoning`);
export { models, pendingModels };
