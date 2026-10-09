# Hard-Decisions

How accurate are fast decision models and LLM classifiers at multi-step deductive reasoning, and where do they
break? This harness measures accuracy on [ProofWriter](https://allenai.org/data/proofwriter) (AI2, CC BY 4.0),
broken down by **proof depth** (the difficulty axis) and by the dataset's other parameters: gold label, theory
kind, negation, question strategy, paraphrase, theory length, rule count, fact count and proof size.

It reuses the Biased-Decisions design: an `Engine` protocol, committed answer records, offline scoring with
bootstrap intervals, preregistration, and a floor to read each number against.

## Engines

| engine | kind | how it is called | cost |
|---|---|---|---|
| `jev` | hosted decision model | `typesafe-sdk`, `TYPESAFE_API_KEY` | $42 per billion input tokens |
| `laya` | open decision model | upstream `laya` package, MPS or CPU | local |
| `kev-0.8b` | open decision model | pinned local Kev server on `HD_KEV_URL` (default `127.0.0.1:8009`) | local |
| `openai:gpt-6-luna` | LLM classifier, reasoning off | `openai` SDK, `OPENAI_API_KEY` | $0.10 / $0.50 per M tokens |
| `anthropic:claude-*` | LLM classifier, lowest reasoning | `anthropic` SDK, `ANTHROPIC_API_KEY` | implemented, not run |

LLM engines are recorded under `<vendor>-<model>-<setting>` (e.g. `openai-gpt-6-luna-effort-none`); a different
model or reasoning setting is a new engine. Only models listed in `hard_decisions/engines/llm.py` and priced in
`hard_decisions/pricing.py` can run.

## Quickstart

```
make install                  # add '.[llm]' for the LLM engines
hd fetch --confirm            # one-time: download and checksum the 214 MB ProofWriter archive into .data/
hd verify                     # recompute every gold label with the independent solver (216,820 questions)
hd build --n 1800 --seed 0    # sample 1,800 items per semantics (OWA, CWA), difficulty-diverse
hd answer jev proofwriter-owa                         # dry run: prints the price, sends nothing
hd answer jev proofwriter-owa --confirm --max-requests 1800
hd replay && hd report        # rescore from the record, write RESULTS.md
```

## The sampler

The full test set (over 200,000 questions) is too large to run every engine on, so `hd build` draws a sample you
control: `--n` items per semantics, `--seed`, `--depths`, and `--weights 4=2,5=2` to tilt toward hard depths.

- Items are spread evenly over (proof depth x gold label) strata first, so deep proofs and the `unknown` class are
  never starved the way a uniform draw would starve them.
- Inside a stratum, items are ranked by greedy coverage of the secondary axes and spread across theories.
- The sample is nested: for one seed, a bigger `--n` only adds items, so answers already paid for stay valid.
- Every selected label is recomputed with `hard_decisions/solver.py` and the build fails on any disagreement.

## Tasks

| task | semantics | options |
|---|---|---|
| `proofwriter-owa` | open world: unknown if neither the statement nor its negation follows | true, false, unknown |
| `proofwriter-cwa` | closed world: anything not derivable is false | true, false |

`~` in a rule body means explicit negation under OWA and negation-as-failure under CWA; the solver encodes this.

## Layout

```
hard_decisions/   solver, proofwriter loader, sampler, engines, record, scoring, report, CLI
tasks/<task>/     question.yaml, items.jsonl (the sample), build.json (parameters and strata)
answers/<engine>/<task>.jsonl.gz   committed record; the unit of reproducibility
studies/          scored rows;  RESULTS.md is generated from them
docs/preregistration.md
```

## Caveats

ProofWriter is synthetic and templated, and may be in training data. Axes other than depth correlate with it, so
breakdowns are descriptive, not causal. Results are reported against a chance floor and a best-constant floor.

## Deployment

The results site (https://hard-decisions.anth.us) deploys automatically: every push to `main` runs
`.github/workflows/site.yml`, which builds and tests `site/`, then uploads the tested `site/dist` to the
Amplify app through a GitHub OIDC role (variables in the `production` environment). `make deploy`
(`tools/deploy_site.sh`) remains the manual fallback.
