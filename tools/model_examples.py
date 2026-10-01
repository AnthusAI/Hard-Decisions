"""Per-model example problems at every proof depth, sized to that model's accuracy there. Writes
``studies/model-examples.json`` for the site; offline, no requests.

For each scored engine, task and depth (0-5): the model's accuracy on all sampled problems at that depth, and four
example problems. The number of wrong examples is 4 x (1 - accuracy), rounded half up (so 49.5% accuracy shows
2 right and 2 wrong); the rest are right. Examples are drawn at random from the model's right and wrong answers at
that depth, with a fixed seed derived from engine, task and depth, so the draw is reproducible and blind to
anything but correctness. Each example carries the exact text the model saw, the statement, the gold answer, the
model's answer and its stated probability (GPT-6 Luna's from the log-probability probe, when the probe returned
the same answer), and the dataset's gold proof as steps when one exists (true and false answers).

    python tools/model_examples.py
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from analyze_luna_logprobs import answer_position  # noqa: E402
from depth_examples import ARCHIVE, parse, steps_of  # noqa: E402
from hard_decisions.record import engines_with_records, read_by_id, record_path  # noqa: E402
from hard_decisions.tasks import QUESTION_NAME, Task  # noqa: E402

PER_DEPTH = 4
LUNA = "openai-gpt-6-luna-effort-none"


def seed_for(*parts: str) -> int:
    return int(hashlib.sha256("|".join(parts).encode()).hexdigest()[:12], 16)


def dataset_records(semantics: str) -> dict:
    """Theory id -> raw ProofWriter record, for every config the sample draws from (for gold proofs)."""
    out = {}
    for path in (ARCHIVE / semantics).glob("*/meta-test.jsonl"):
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                r = json.loads(line)
                out.setdefault(r["id"], r)
    return out


def gold_proof(record, qid):
    question = (record or {}).get("questions", {}).get(qid)
    if not question or not question.get("proofsWithIntermediates"):
        return None
    proof = question["proofsWithIntermediates"][0]
    try:
        if not proof.get("intermediates"):
            ref = proof["representation"].strip("()").split()[0]
            text = record["triples"].get(ref, {}).get("text")
            return {"stated": text, "steps": []} if text else None
        steps, _ = steps_of(parse(proof["representation"]), record, proof["intermediates"])
        return {"stated": None, "steps": steps}
    except (AssertionError, KeyError, IndexError, ValueError):
        return None   # closed-world proofs that rely on negation-as-failure don't parse into steps


def luna_probe(slug: str) -> dict:
    path = ROOT / "probes" / "luna-logprobs" / f"{slug}.jsonl.gz"
    out = {}
    if not path.exists():
        return out
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            r = json.loads(line)
            choice = r["response"]["choices"][0]
            try:
                answer = json.loads(choice["message"]["content"])["answer"]
                found = answer_position(choice["logprobs"]["content"], answer)
            except (TypeError, ValueError, KeyError):
                continue
            if found:
                out[r["id"]] = (answer, math.exp(found[1]))
    return out


def main() -> int:
    out = {"selection": __doc__.split("\n\n")[1].replace("\n", " "), "per_depth": PER_DEPTH, "engines": {}}
    for slug in ("proofwriter-owa", "proofwriter-cwa"):
        task = Task.load(slug)
        items = {i["id"]: i for i in task.load_items()}
        records = dataset_records(task.semantics)
        probe = luna_probe(slug)
        for engine in engines_with_records(slug):
            rows = read_by_id(record_path(engine, slug))
            per_depth = []
            for depth in range(6):
                ids = sorted(i for i in items if items[i]["metadata"]["depth"] == depth and i in rows)
                judged = []
                for i in ids:
                    a = (rows[i].get("answers") or {}).get(QUESTION_NAME) or {}
                    judged.append((i, a, a.get("choice") == items[i]["metadata"]["reference_label"]))
                if not judged:
                    continue
                accuracy = sum(c for _, _, c in judged) / len(judged)
                wrong_n = min(PER_DEPTH, math.floor(PER_DEPTH * (1 - accuracy) + 0.5))
                rng = random.Random(seed_for(engine, slug, str(depth)))
                right_pool = [j for j in judged if j[2]]
                wrong_pool = [j for j in judged if not j[2]]
                wrong_n = min(wrong_n, len(wrong_pool))
                right_n = min(PER_DEPTH - wrong_n, len(right_pool))
                picks = rng.sample(wrong_pool, wrong_n) + rng.sample(right_pool, right_n)
                rng.shuffle(picks)
                examples = []
                for i, a, correct in picks:
                    meta = items[i]["metadata"]
                    theory, statement = items[i]["text"].split("\n\nStatement: ")
                    probability = (a.get("probabilities") or {}).get(a.get("choice"))
                    source = "model" if probability is not None else None
                    if probability is None and engine == LUNA and i in probe and probe[i][0] == a.get("choice"):
                        probability, source = probe[i][1], "probe"
                    theory_id, qid = i.rsplit("-", 1)
                    examples.append({"id": i, "correct": correct, "gold": meta["reference_label"],
                                     "choice": a.get("choice"), "probability": probability, "probability_source": source,
                                     "theory": theory, "statement": statement, "paraphrased": meta["paraphrased"],
                                     "proof": gold_proof(records.get(theory_id), qid)})
                per_depth.append({"depth": depth, "n": len(judged), "accuracy": accuracy,
                                  "right_shown": sum(e["correct"] for e in examples),
                                  "wrong_shown": sum(not e["correct"] for e in examples), "examples": examples})
            out["engines"].setdefault(engine, {})[slug] = per_depth
    path = ROOT / "studies" / "model-examples.json"
    path.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    for engine, tasks in out["engines"].items():
        for slug, rows in tasks.items():
            print(f"{engine:32} {slug[-3:]} " + "  ".join(f"d{r['depth']}:{100*r['accuracy']:.0f}%={r['right_shown']}/{r['wrong_shown']}" for r in rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
