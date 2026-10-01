# Hard-Decisions

How accurate are fast decision models and LLM classifiers at multi-step deductive reasoning, and where do they
break? This harness measures accuracy on [ProofWriter](https://allenai.org/data/proofwriter) (AI2, CC BY 4.0),
broken down by **proof depth** (the difficulty axis) and by the dataset's other parameters: gold label, theory
kind, negation, question strategy, paraphrase, theory length, rule count, fact count and proof size.

It reuses the Biased-Decisions design: an `Engine` protocol, committed answer records, offline scoring with
bootstrap intervals, preregistration, and a floor to read each number against. First engine: Jev. Next: Laya and
other open decision models, then hosted LLMs from several vendors.

## Quickstart

```
make install
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
