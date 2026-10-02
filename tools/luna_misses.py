"""GPT-6 Luna's one-step misses: depth-1 problems Luna answered wrong and Jev answered right. Writes
``studies/luna-misses.json`` for the site; offline, no requests.

For each task: how many depth-1 problems there are, how many Luna got wrong, and how many of those Jev got right.
Then the two such problems with the shortest text (ties by id), so a reader can check them in a few seconds.
Selection is by length only, among the problems that meet the condition; it is not a random draw and is not meant
as a sample of Luna's accuracy. Each example has the same fields as studies/model-examples.json (Luna's answer and
its probability from the log-probability probe when the probe returned the same answer), plus Jev's answer.

    python tools/luna_misses.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT))

from model_examples import LUNA, dataset_records, gold_proof, luna_probe  # noqa: E402
from hard_decisions.record import read_by_id, record_path  # noqa: E402
from hard_decisions.tasks import QUESTION_NAME, Task  # noqa: E402

JEV = "jev"
DEPTH = 1
SHOWN = 2


def answer(row: dict) -> dict:
    return (row.get("answers") or {}).get(QUESTION_NAME) or {}


def main() -> int:
    out = {"selection": __doc__.split("\n\n")[1].replace("\n", " "), "depth": DEPTH, "tasks": {}}
    for slug in ("proofwriter-owa", "proofwriter-cwa"):
        task = Task.load(slug)
        items = {i["id"]: i for i in task.load_items()}
        luna, jev = read_by_id(record_path(LUNA, slug)), read_by_id(record_path(JEV, slug))
        probe = luna_probe(slug)
        records = dataset_records(task.semantics)
        gold = {i: items[i]["metadata"]["reference_label"] for i in items}
        ids = sorted(i for i in items if items[i]["metadata"]["depth"] == DEPTH and i in luna and i in jev)
        luna_wrong = [i for i in ids if answer(luna[i]).get("choice") != gold[i]]
        jev_right = [i for i in luna_wrong if answer(jev[i]).get("choice") == gold[i]]
        examples = []
        for i in sorted(jev_right, key=lambda i: (len(items[i]["text"]), i))[:SHOWN]:
            a = answer(luna[i])
            theory, statement = items[i]["text"].split("\n\nStatement: ")
            probability, source = None, None
            if i in probe and probe[i][0] == a.get("choice"):
                probability, source = probe[i][1], "probe"
            theory_id, qid = i.rsplit("-", 1)
            examples.append({"id": i, "correct": False, "gold": gold[i], "choice": a.get("choice"),
                             "probability": probability, "probability_source": source, "theory": theory,
                             "statement": statement, "paraphrased": items[i]["metadata"]["paraphrased"],
                             "proof": gold_proof(records.get(theory_id), qid), "jev_choice": answer(jev[i]).get("choice")})
        out["tasks"][slug] = {"n": len(ids), "luna_wrong": len(luna_wrong), "luna_wrong_jev_right": len(jev_right),
                              "examples": examples}
        print(f"{slug}: depth {DEPTH} n={len(ids)}, Luna wrong {len(luna_wrong)}, of which Jev right {len(jev_right)}; "
              f"shown {[e['id'] for e in examples]}")
    path = ROOT / "studies" / "luna-misses.json"
    path.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
