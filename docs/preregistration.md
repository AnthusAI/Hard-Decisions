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
