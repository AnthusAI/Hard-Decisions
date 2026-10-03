"""Choose GLiNER2.5-Decide's request form on ProofWriter's dev split (studies/gliner-request-form/PLAN.md).

Offline and local: no benchmark item is used. Writes studies/gliner-request-form/results.json. Run in the
GLiNER environment:

    var/gliner-venv/bin/python tools/gliner_request_form.py
"""
from __future__ import annotations

import json
import random
import sys
import warnings
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hard_decisions.engines.gliner_decide import REPO, REVISION  # noqa: E402
from hard_decisions.proofwriter import CONFIGS, DEFAULT_ARCHIVE, candidate_for, render_text  # noqa: E402
from hard_decisions.tasks import QUESTION_NAME, Task  # noqa: E402

PER_DEPTH = int(__import__("os").environ.get("GLINER_DEV_PER_DEPTH", "50"))
SEED = 20261002


def dev_items(semantics):
    by_depth = defaultdict(list)
    for config in CONFIGS:
        with open(DEFAULT_ARCHIVE / semantics / config / "meta-dev.jsonl", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle):
                record = json.loads(line)
                for qid, question in record["questions"].items():
                    c = candidate_for(record, qid, question, semantics, config, line_number)
                    if c is not None:
                        by_depth[c.depth].append({"id": f"dev-{config}-{c.id}", "depth": c.depth, "gold": c.label,
                                                  "theory": record["theory"].strip(), "text": render_text(record, question)})
    rng = random.Random(SEED)
    out = []
    for depth in sorted(by_depth):
        pool = sorted(by_depth[depth], key=lambda i: i["id"])
        out += rng.sample(pool, min(PER_DEPTH, len(pool)))
    return out


def forms(item, q):
    statement = item["text"].rsplit("\n\nStatement: ", 1)[1]
    described = {"labels": dict(q["criteria"])}
    bare = list(q["criteria"])
    instr = q["instructions"]
    options = "\n".join(f"- {k}: {v}" for k, v in q["criteria"].items())
    full_message = f"{item['text']}\n\n{instr}\n\nOptions:\n{options}"
    sp = f"Statement: {statement}"
    return {
        "A": (f"{item['theory']}\n\n{instr}", {**described, "prompt": sp}),
        "B": (f"{instr}\n\n{item['theory']}", {**described, "prompt": sp}),
        "C": (item["theory"], {**described, "prompt": f"{sp}\n\n{instr}"}),
        "D": (full_message, {**described, "prompt": sp}),
        "X (diagnostic: no instructions or descriptions)": (item["theory"], {"labels": bare, "prompt": sp}),
        "benchmark full message, bare labels": (full_message, bare),
        "benchmark labels only": (item["text"], bare),
    }


def main():
    warnings.simplefilter("ignore")
    from gliner2 import AutoExtractor
    import torch
    model = AutoExtractor.from_pretrained(REPO, revision=REVISION)
    model.to("mps" if torch.backends.mps.is_available() else "cpu")
    results = {}
    for slug in ("proofwriter-owa", "proofwriter-cwa"):
        task = Task.load(slug)
        q = task.wire_questions()[QUESTION_NAME]
        items = dev_items(task.semantics)
        gold = Counter(i["gold"] for i in items)
        per = defaultdict(lambda: {"right": 0, "said": Counter(), "by_depth": defaultdict(lambda: [0, 0])})
        for item in items:
            for form, (text, spec) in forms(item, q).items():
                choice = model.classify_text(text, {QUESTION_NAME: spec})[QUESTION_NAME]
                r = per[form]
                ok = choice == item["gold"]
                r["right"] += ok
                r["said"][choice] += 1
                r["by_depth"][item["depth"]][0] += ok
                r["by_depth"][item["depth"]][1] += 1
        results[slug] = {"n": len(items), "best_constant": max(gold.values()) / len(items), "gold": dict(gold),
                         "forms": {f: {"accuracy": r["right"] / len(items), "said": dict(r["said"]),
                                       "by_depth": {d: v[0] / v[1] for d, v in sorted(r["by_depth"].items())}}
                                   for f, r in per.items()}}
        print(slug, "best constant", round(results[slug]["best_constant"], 3))
        for f, r in results[slug]["forms"].items():
            print(f"  {f:48} {100 * r['accuracy']:5.1f}%  said {r['said']}  depth " +
                  " ".join(f"{100 * v:.0f}" for v in r["by_depth"].values()))
    out = ROOT / "studies" / "gliner-request-form" / "results.json"
    out.write_text(json.dumps({"plan": "studies/gliner-request-form/PLAN.md", "seed": SEED, "per_depth": PER_DEPTH,
                               "model": f"{REPO}@{REVISION[:7]}", "tasks": results}, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
