"""Worked examples of proof depth: one ProofWriter problem per depth, its gold proof as numbered steps, and how
every engine answered it. Writes ``studies/depth-examples.json`` for the site; offline, no requests.

Selection is fixed and blind to the answers: for each task and depth 0-5, among sampled items that are templated
(not paraphrased), attribute theories, gold answer ``true`` (so a proof exists) and question strategy ``proof``,
take the one with the fewest words of theory, ties broken by id. The proof comes from the dataset's own
``proofsWithIntermediates`` (the first proof listed), parsed into steps in the order they're derived.

    python tools/depth_examples.py
"""
from __future__ import annotations

import gzip
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hard_decisions.record import read_by_id, record_path  # noqa: E402
from hard_decisions.tasks import QUESTION_NAME, Task  # noqa: E402

ARCHIVE = ROOT / ".data" / "proofwriter-dataset-V2020.12.3"
ENGINES = ("jev", "openai-gpt-6-luna-effort-none", "kev-9b", "kev-4b", "kev-0.8b", "laya")
TOKEN = re.compile(r"\(|\)|->|%|[A-Za-z0-9_]+")


def parse(representation: str):
    """``((triple7 (...)) -> (rule4 % int1))`` into nested (premises, rule, conclusion) tuples. A premise is a
    triple id or a nested step."""
    tokens = TOKEN.findall(representation)
    pos = 0

    def node():
        nonlocal pos
        assert tokens[pos] == "("
        pos += 1
        items = []
        while tokens[pos] not in (")", "->"):
            if tokens[pos] == "(":
                items.append(node())
            else:
                items.append(tokens[pos]); pos += 1
        if tokens[pos] == "->":
            pos += 1
            assert tokens[pos] == "("; pos += 1
            rule = tokens[pos]; pos += 1
            assert tokens[pos] == "%"; pos += 1
            conclusion = tokens[pos]; pos += 1
            assert tokens[pos] == ")"; pos += 1
            assert tokens[pos] == ")"; pos += 1
            premises = items[0] if len(items) == 1 and isinstance(items[0], list) else items
            return {"premises": premises, "rule": rule, "conclusion": conclusion}
        pos += 1
        return items

    return node()


def steps_of(tree, record, intermediates):
    """Depth-first, so every step's premises are stated before it is. The dataset writes proofs as trees, so a
    conclusion used twice appears twice; each conclusion is listed once, at its first derivation."""
    out, seen = [], set()

    def text(ref):
        if ref.startswith("triple"):
            return record["triples"][ref]["text"]
        return intermediates[ref]["text"]

    def walk(n):
        if isinstance(n, str):
            return n
        if isinstance(n, list):
            return [walk(x) for x in n]
        names = []
        for p in (n["premises"] if isinstance(n["premises"], list) else [n["premises"]]):
            r = walk(p)
            names.extend(r if isinstance(r, list) else [r])
        if intermediates[n["conclusion"]]["text"] in seen:
            return n["conclusion"]
        seen.add(intermediates[n["conclusion"]]["text"])
        out.append({"uses": [{"ref": x, "text": text(x), "kind": "fact" if x.startswith("triple") else "derived"} for x in names],
                    "rule": n["rule"], "rule_text": record["rules"][n["rule"]]["text"],
                    "concludes": n["conclusion"], "conclusion_text": intermediates[n["conclusion"]]["text"]})
        return n["conclusion"]

    final = walk(tree)
    return out, final


def main() -> int:
    out = {"selection": __doc__.split("\n\n")[1].replace("\n", " "), "tasks": {}}
    for slug in ("proofwriter-owa", "proofwriter-cwa"):
        task = Task.load(slug)
        semantics = task.semantics
        items = task.load_items()
        records = {e: read_by_id(record_path(e, slug)) for e in ENGINES}
        examples = []
        for depth in range(6):
            pool = [i for i in items if i["metadata"]["depth"] == depth and not i["metadata"]["paraphrased"]
                    and i["metadata"]["theory_kind"] == "attribute" and i["metadata"]["reference_label"] == "true"
                    and i["metadata"]["strategy"] == "proof"]
            if not pool:
                continue
            item = min(pool, key=lambda i: (i["metadata"]["theory_words"], i["id"]))
            theory_id, qid = item["id"].rsplit("-", 1)
            config = item["metadata"]["config"]
            path = ARCHIVE / semantics / config / "meta-test.jsonl"
            record = next(json.loads(l) for l in open(path) if f'"id":"{theory_id}"' in l or f'"id": "{theory_id}"' in l)
            question = record["questions"][qid]
            proof = question["proofsWithIntermediates"][0]
            if depth == 0:
                fact = proof["representation"].strip("()")
                steps, final_text = [], record["triples"][fact]["text"]
                stated = {"ref": fact, "text": record["triples"][fact]["text"]}
            else:
                steps, final = steps_of(parse(proof["representation"]), record, proof["intermediates"])
                final_text, stated = proof["intermediates"][final]["text"], None
            answers = {}
            for e in ENGINES:
                row = records[e].get(item["id"])
                if row:
                    a = row["answers"][QUESTION_NAME]
                    answers[e] = {"choice": a.get("choice"), "probability": (a.get("probabilities") or {}).get(a.get("choice")),
                                  "correct": a.get("choice") == item["metadata"]["reference_label"]}
            examples.append({"depth": depth, "id": item["id"], "label": item["metadata"]["reference_label"],
                             "facts": [t["text"] for t in record["triples"].values()],
                             "rules": [r["text"] for r in record["rules"].values()],
                             "statement": question["question"], "stated_fact": stated, "steps": steps,
                             "proves": final_text, "theory_words": item["metadata"]["theory_words"],
                             "answers": answers})
        out["tasks"][slug] = examples
    path = ROOT / "studies" / "depth-examples.json"
    path.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    for slug, ex in out["tasks"].items():
        for e in ex:
            marks = " ".join(f"{k.split('-')[0] if k != 'openai-gpt-6-luna-effort-none' else 'luna'}:{'Y' if v['correct'] else 'n'}" for k, v in e["answers"].items())
            print(f"{slug} d{e['depth']} {e['id']:28} words={e['theory_words']:3} steps={len(e['steps'])}  {marks}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
