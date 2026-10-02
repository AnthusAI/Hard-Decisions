# Preregistration: Jev on ProofWriter

Written before any engine has answered an item. Scored against these predictions word for word.

## Design (frozen)

- **Data:** ProofWriter V2020.12.3, official test splits (`depth-0,1,2,3,5` and `NatLang`), archive sha256
  `bbc5694901e8306d0bd659aa1ad53ccfd02c201864f4b320ffa3777827d1fc26`. Every gold label is recomputed by
  `hard_decisions/solver.py`; it reproduces all 216,820 published test labels (OWA and CWA) with zero disagreements.
- **Sample:** `hd build --n 1800 --seed 0` (1,800 items per semantics, difficulty-diverse, nested by seed).
  Parameters, per-stratum counts and axis histograms are in `tasks/*/build.json`.
- **Tasks:** `proofwriter-owa` (true / false / unknown) and `proofwriter-cwa` (true / false). One request per
  item, one fixed typed `choice` question per task, option order as listed in `question.yaml`.
- **Engine:** Jev (`typesafe-sdk`), model version recorded per row. A version change is a new engine.
- **Primary metric:** accuracy by proof depth (0 to 5) with a 95% percentile bootstrap interval (seed 0, 1,000
  resamples). **Secondary:** macro-F1, per-class recall, accuracy on every other axis in `hard_decisions/tasks.py`.
- **Floors:** chance (1 / number of options) and the best constant guesser on the same items.

## Predictions

1. Jev's accuracy falls as proof depth rises, on both tasks. Depth 0 is clearly above depth 5, with intervals
   that do not overlap on OWA.
2. On OWA, Jev's recall on `unknown` is the lowest of the three classes at depth 3 and above.
3. By depth 5, Jev is within 10 points of its own best-constant floor on at least one task (that is, it has
   largely stopped using the rules).
4. Negation in the theory (`theory_negation = negation`) lowers accuracy relative to no negation.
5. Paraphrased rules (`NatLang`) are no easier than templated ones.
6. No claim about the other axes (length, rule count, proof size, strategy) beyond reporting them; they correlate
   with depth, so those breakdowns are descriptive.

## What would count against us

Accuracy flat across depth (prediction 1 false), or `unknown` recall not the lowest (prediction 2 false), is
reported as such.

## Caveats stated in advance

ProofWriter is synthetic and templated, and models may have seen it in training. Interval widths at 100 to 150
items per depth are about plus or minus 8 to 10 points per class-balanced stratum, so only large differences are
resolvable at the depth-by-label level. Breakdowns are descriptive, not causal.

## Amendment 1: Kev (written before Kev answered any item)

- **Engine:** `kev-0.8b`, Kev's pointer head on Qwen3.5-0.8B-Base, served locally through the same `/v1/systemone`
  contract and the same typed question as Jev. Pinned identity, identical to the Biased-Decisions Kev study:
  checkpoint `jaredpalmer/kev-0.8b@54f4f8777356cd5bbbb6c6919c657f26e6f2f6d8`, base
  `Qwen/Qwen3.5-0.8B-Base@dc7cdfe2ee4154fa7e30f5b51ca41bfa40174e68`, server commit
  `c9c1f855505336ac32092a5f68305d397f7fcc3e`, MLX bfloat16, prefix cache and date facts off, stored temperature
  2.406. The server's `/v1/models` response is saved in `answers/kev-0.8b/provenance.json`.
- **Protocol:** one request at a time; a 20-item OWA timing pilot, then the full 1,800 items per task. Same
  sample, metrics and floors as above. Paired differences are reported as Jev minus Kev on the same items.
- **Predictions:**
  1. Kev's accuracy falls with proof depth on both tasks.
  2. Kev is below Jev overall on both tasks (paired interval excludes zero).
  3. On OWA, Kev's `unknown` recall is its lowest class recall.

## Amendment 2: LLM classifiers (written before any LLM answered an item)

- **Engine:** `openai-gpt-6-luna-effort-none`: OpenAI `gpt-6-luna` through Chat Completions with
  `reasoning_effort: none`, its lowest setting, so it answers directly as a classifier. The vendor's returned
  model id is recorded per row.
- **Protocol:** one request per item. The prompt is the item text, then the task's question and each option with
  its description (the same wire question every engine gets), asking for `{"answer": <option>}`. The reply is
  constrained by a strict JSON schema with the options as an enum. Any reply that is not exactly one option is
  scored as invalid and kept raw in the record; it is never re-asked. Same sample, metrics and floors as above;
  paired differences are Jev minus Luna on the same items.
- **Spend:** list price $0.10 input and $0.50 output per million tokens; the dry run prices both tasks at about
  $0.15 in total.
- **Claude engines** (`hard_decisions/engines/llm.py`) are implemented but not run: there is no Anthropic key.
- **Predictions:**
  1. Luna's accuracy falls with proof depth on both tasks.
  2. On OWA, Luna's `unknown` recall is its lowest class recall.
  3. With reasoning off, Luna does not beat Jev at depth 5 on OWA (the paired interval does not exclude zero in
     Luna's favour).
  4. Paraphrased rules lower Luna's accuracy less than they lower Jev's.

## Amendment 3: Kev-4B and Kev-9B (written before either answered an item)

- **Engines:** `kev-4b` (`jaredpalmer/kev-4b@139fdd94f1b6a6ad80cc15e08fcb99cac885a101` on
  `Qwen/Qwen3.5-4B-Base@1001bb4d826a52d1f399e183466143f4da7b741b`) and, if memory allows, `kev-9b`
  (`jaredpalmer/kev-9b@b5d8c18e44c60888d138b65cb6507ff0a5a448a0` on
  `Qwen/Qwen3.5-9B-Base@68c46c4b3498877f3ef123c856ecfde50c39f404`). Same server commit, MLX bfloat16 and settings as
  `kev-0.8b`; each checkpoint's own stored temperature (4B: 2.406). Weights in a gitignored cache; the server's
  `/v1/models` response is saved in `answers/<engine>/provenance.json`. Kev-27B (51 GB) does not fit this machine
  and is not run.
- **Protocol:** identical to every other engine: same items, same question, one request at a time, a 20-item OWA
  pilot, then 1,800 items per task.
- **Predictions:**
  1. Accuracy rises with size: Kev-4B is above Kev-0.8B overall on both tasks (paired interval excludes zero).
  2. Kev-4B and Kev-9B stay below Jev overall on both tasks.
  3. Kev-9B is not reliably above Kev-4B (paired interval includes zero) on at least one task.

## Amendment 4: test-retest repeatability (written before any rerun except Jev's)

- **Design:** every engine answers the full sample a second time under the original protocol, one request at a
  time, into `timing/<engine>/<task>.jsonl.gz`. That rerun also provides the latency data and is never scored.
  Jev's rerun was collected for timing before this metric was chosen; every other rerun comes after this
  amendment is committed.
- **Metrics, per engine and task:** percent agreement (headline); Gwet's AC1 with a 95% percentile bootstrap
  interval over items (seed 0, 1,000 resamples), the primary chance-corrected measure, chosen because several
  engines answer one option far more often than the others and Cohen's kappa understates agreement then (the
  prevalence paradox); Cohen's kappa as a secondary figure; share of answers that change, by proof depth; accuracy in
  each run; for engines that return probabilities, the mean and maximum absolute change in run 1's chosen
  option's probability.
- **Predictions:**
  1. Kev and Laya agree with themselves on at least 99.5% of items on both tasks (local, fixed weights).
  2. Jev's AC1 is at least 0.90 on both tasks (observed: 0.958 on both, before this amendment).
  3. Where answers change, they change more at depth 3 and above than at depth 0 to 2, for every engine with at
     least 20 changes.

## Amendment 5: Kev-9B loads through a memory patch (written before Kev-9B answered any item)

Kev-9B's original MLX loader would need about 35-40 GB while merging its adapter, more than this 32 GB machine.
It is served through a copy of the same runtime with `merge_lora` changed to merge and load one matrix at a time
(`tools/kev-merge-one-at-a-time.patch`). On Kev-4B the patched loader produced bit-identical weights (same SHA-256
over every backbone matrix) and identical answers and probabilities on 100 items, with peak memory 9.2 GB instead
of 17 GB (`tools/README.md`). Everything else in Amendment 3 is unchanged.

## Amendment 6: can GPT-6 Luna's log-probabilities serve as a confidence? (written before the probe ran)

- **Why:** OpenAI's Decisions API is built on a version of GPT-6 Luna. A decision model is only useful with a
  confidence you can threshold on. Our Luna arm asked for the answer only, like every engine, so it has none. This
  probe asks whether Luna's log-probabilities could supply one. It is outside the scored benchmark and changes no
  benchmark number.
- **A spot check before this amendment** (12 open-world items at depth 3 to 5, 2026-10-01) found Luna returns the
  chosen answer's log-probability and at most one or two alternatives with reasoning off, refuses `logprobs` with
  reasoning on, and gave 5 of 12 wrong answers at 97.8% or more. It motivated the probe and is not part of its
  results.
- **Design:** every one of the 3,600 benchmark items, sent with exactly the benchmark's GPT-6 Luna request (same
  prompt, strict JSON schema, `reasoning_effort: none`, default sampling) plus `logprobs: true, top_logprobs: 5`.
  Every request and response is kept verbatim in `probes/luna-logprobs/` (`tools/probe_luna_logprobs.py`). The
  answer's probability is the summed probability of the tokens that spell it.
- **Metrics** (`tools/analyze_luna_logprobs.py`): a reliability table in six probability bands; expected
  calibration error (ECE); the share of wrong answers stated at 95% or more and at 99% or more; AUROC of the stated
  probability for separating right from wrong answers, computed the same way for Jev, Kev and Laya on the same
  items from their recorded probabilities; how many alternatives Luna discloses; and how often the returned answer
  is not the most probable disclosed option.
- **Predictions:**
  1. Luna's ECE exceeds 0.15 on both tasks.
  2. At least half of Luna's wrong answers are stated at 95% or more, on both tasks.
  3. Luna's AUROC is lower than Jev's on both tasks.
  4. On most responses, Luna discloses fewer than all of the task's options.

## Amendment 7: GLiDE (written before GLiDE answered any item)

- **Engine:** `glide`: Fastino's hosted decision model, model `fastino/GLiDE`, through `POST
  https://api.fastino.ai/v1/systemone` (`hard_decisions/engines/glide.py`). Fastino serves it on the same System One
  contract as Jev, so the request is exactly Jev's: `state: {"text": <item text>}` and the task's wire question,
  with no other setting. Fastino describes GLiDE as a "thinking" decision model that spends more computation
  when its first distribution is uncertain; there is no parameter for this, so it runs as served. The returned
  model id is recorded per row.
- **Protocol:** as for every engine: one request per item, no examples, no retries of an answer. A request that
  fails is retried by the client and, if it still fails, left out of the record and rerun later; an answer that
  is not one of the options is scored wrong. Same sample, metrics, floors and paired differences (Jev minus
  GLiDE on the same items). Before the full run, one 20-item pilot on OWA checks the response shape; its rows are
  kept and count toward the 1,800.
- **Repeatability and timing:** after the scored run, one `--timing` rerun of every item per task at concurrency
  1, scored for retest agreement as in Amendment 4 and for latency. Separately, GLiDE's stated probabilities get
  the same AUROC as Amendment 6 computed for Jev, Kev and Laya.
- **Spend:** list price $0.30 per million input tokens, output free (docs.fastino.ai/pricing, read 2026-10-02).
  The dry run prices each task at about $0.22, so the scored runs plus the reruns cost about $1.
- **Claims under test:** we expect GLiDE to beat the open models. Fastino says it beats Jev (Decision Index 0.2.1,
  64.81 against 57.91). We make no directional prediction about Jev and report the paired difference either way.
- **Predictions:**
  1. GLiDE's overall accuracy is above Kev-9B's, the best open model, on both tasks (paired interval excludes
     zero).
  2. GLiDE's accuracy at depths 3 to 5 is above Kev-9B's on both tasks.
  3. GLiDE's accuracy falls with proof depth on both tasks.
  4. GLiDE's AUROC exceeds GPT-6 Luna's probe AUROC on both tasks.
