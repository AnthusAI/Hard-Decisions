"""Analyse the Luna log-probability probe (Amendment 6) and write ``probes/luna-logprobs/analysis.json``.

For each response: the probability Luna gave the answer it returned (the answer token's log-probability, summed
over the tokens that spell the answer), the alternatives it disclosed at that position, and whether the answer was
right. Then, per task and overall:

- a reliability table: accuracy within bands of stated probability;
- expected calibration error (ECE) of the returned answer's probability;
- the share of wrong answers stated at 95% or more, and at 99% or more;
- AUROC: how well the stated probability separates right answers from wrong ones (0.5 = no better than a coin);
  computed the same way for every engine with probabilities in ``answers/`` (Jev, Kev, Laya) on the same items;
- how many alternatives came back, and how much probability they covered;
- how often the returned answer was not the most probable disclosed option (sampling at OpenAI's default
  temperature).

Offline; no requests. ``python tools/analyze_luna_logprobs.py``
"""
from __future__ import annotations

import gzip
import json
import math
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hard_decisions.record import read_by_id, record_path  # noqa: E402
from hard_decisions.tasks import QUESTION_NAME, Task  # noqa: E402

PROBE = ROOT / "probes" / "luna-logprobs"
BANDS = [(0.0, 0.5), (0.5, 0.8), (0.8, 0.9), (0.9, 0.95), (0.95, 0.99), (0.99, 1.0000001)]
TASKS = ("proofwriter-owa", "proofwriter-cwa")


def answer_position(content: List[dict], answer: str) -> Optional[Tuple[int, float]]:
    """Index of the first token of the answer string inside the JSON reply, and the summed log-probability of the
    tokens that spell it."""
    text, starts = "", []
    for token in content:
        starts.append(len(text))
        text += token["token"]
    needle = f'"{answer}"'
    at = text.find(needle, text.find('"answer"') + len('"answer"'))
    if at < 0:
        return None
    lo, hi = at + 1, at + 1 + len(answer)
    covering = [i for i, s in enumerate(starts) if s < hi and s + len(content[i]["token"]) > lo]
    return (covering[0], sum(content[i]["logprob"] for i in covering)) if covering else None


def option_of(token: str, options: List[str]) -> Optional[str]:
    t = token.strip().strip('"').strip()
    if not t:
        return None
    hits = [o for o in options if o.startswith(t)]
    return hits[0] if len(hits) == 1 else None


def auroc(scores: List[float], correct: List[int]) -> Optional[float]:
    pos = [s for s, c in zip(scores, correct) if c]
    neg = [s for s, c in zip(scores, correct) if not c]
    if not pos or not neg:
        return None
    wins = 0.0
    for p in pos:
        for n in neg:
            wins += 1.0 if p > n else 0.5 if p == n else 0.0
    return wins / (len(pos) * len(neg))


def summarize(rows: List[dict]) -> dict:
    n = len(rows)
    correct = [r["correct"] for r in rows]
    conf = [r["p"] for r in rows]
    bands = []
    for lo, hi in BANDS:
        group = [r for r in rows if lo <= r["p"] < hi]
        bands.append({"from": lo, "to": min(hi, 1.0), "n": len(group),
                      "accuracy": sum(r["correct"] for r in group) / len(group) if group else None,
                      "mean_stated": sum(r["p"] for r in group) / len(group) if group else None})
    ece = sum(b["n"] / n * abs(b["accuracy"] - b["mean_stated"]) for b in bands if b["n"])
    wrong = [r for r in rows if not r["correct"]]
    return {"n": n, "accuracy": sum(correct) / n, "mean_stated": sum(conf) / n, "ece": ece, "bands": bands,
            "wrong": len(wrong),
            "wrong_at_95": sum(r["p"] >= 0.95 for r in wrong) / len(wrong) if wrong else None,
            "wrong_at_99": sum(r["p"] >= 0.99 for r in wrong) / len(wrong) if wrong else None,
            "auroc": auroc(conf, correct)}


def engine_rows(engine: str, task: Task, ids: List[str], gold: Dict[str, str]) -> List[dict]:
    record = read_by_id(record_path(engine, task.slug))
    rows = []
    for i in ids:
        answer = ((record.get(i) or {}).get("answers") or {}).get(QUESTION_NAME) or {}
        probs, choice = answer.get("probabilities"), answer.get("choice")
        if probs and choice in probs:
            rows.append({"id": i, "p": probs[choice], "correct": int(choice == gold[i])})
    return rows


def main() -> int:
    out = {"tasks": {}, "examples": []}
    all_luna = []
    for slug in TASKS:
        path = PROBE / f"{slug}.jsonl.gz"
        if not path.exists():
            continue
        task = Task.load(slug)
        gold = {i["id"]: i["metadata"]["reference_label"] for i in task.load_items()}
        depth = {i["id"]: i["metadata"]["depth"] for i in task.load_items()}
        rows, alt_counts, disclosed_mass, not_argmax, unparsed = [], {}, [], 0, 0
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            raw = [json.loads(line) for line in handle if line.strip()]
        for r in raw:
            choice_obj = r["response"]["choices"][0]
            try:
                answer = json.loads(choice_obj["message"]["content"])["answer"]
            except (TypeError, ValueError, KeyError):
                unparsed += 1
                continue
            content = (choice_obj.get("logprobs") or {}).get("content") or []
            found = answer_position(content, answer)
            if not found:
                unparsed += 1
                continue
            index, logprob = found
            alts = {}
            for alt in content[index].get("top_logprobs") or []:
                o = option_of(alt["token"], list(task.options))
                if o:
                    alts[o] = alts.get(o, 0.0) + math.exp(alt["logprob"])
            alt_counts[len(alts)] = alt_counts.get(len(alts), 0) + 1
            disclosed_mass.append(sum(alts.values()))
            if alts and max(alts, key=alts.get) != answer:
                not_argmax += 1
            rows.append({"id": r["id"], "p": math.exp(logprob), "correct": int(answer == gold[r["id"]]),
                         "answer": answer, "gold": gold[r["id"]], "depth": depth[r["id"]], "alternatives": alts})
        ids = [r["id"] for r in rows]
        summary = summarize(rows)
        summary.update({"responses": len(raw), "unparsed": unparsed, "options_disclosed": alt_counts,
                        "mean_disclosed_mass": sum(disclosed_mass) / len(disclosed_mass) if disclosed_mass else None,
                        "returned_not_most_probable": not_argmax,
                        "by_depth": {str(d): summarize([r for r in rows if r["depth"] == d])
                                     for d in sorted({r["depth"] for r in rows})}})
        others = {}
        for engine in ("jev", "glide", "gliner-2.5-decide", "gliner-2.5-decide-labels-only", "kev-4b", "kev-0.8b", "laya", "kev-9b"):
            er = engine_rows(engine, task, ids, gold)
            if len(er) == len(ids):
                s = summarize(er)
                others[engine] = {k: s[k] for k in ("n", "accuracy", "ece", "auroc", "wrong_at_95", "wrong_at_99", "bands")}
        summary["other_engines_same_items"] = others
        out["tasks"][slug] = summary
        all_luna += rows
        # Verbatim examples for the write-up: the first confident wrong answer and the first right one, per task.
        for want in (0, 1):
            pick = next((r for r in raw for x in rows if x["id"] == r["id"] and x["correct"] == want
                         and (want or x["p"] >= 0.95)), None)
            if pick:
                out["examples"].append({"task": slug, "correct": bool(want), "request": pick["request"],
                                        "response": pick["response"],
                                        "gold": gold[pick["id"]], "id": pick["id"]})
    if all_luna:
        out["overall"] = summarize(all_luna)
    path = PROBE / "analysis.json"
    path.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for slug, s in out["tasks"].items():
        print(f"{slug}: n={s['n']} acc={s['accuracy']:.3f} mean stated={s['mean_stated']:.3f} ECE={s['ece']:.3f} "
              f"AUROC={s['auroc']:.3f} wrong>=95%={s['wrong_at_95']:.2%} wrong>=99%={s['wrong_at_99']:.2%} "
              f"options disclosed={s['options_disclosed']} returned-not-most-probable={s['returned_not_most_probable']}")
        for e, o in s["other_engines_same_items"].items():
            print(f"    {e:9} acc={o['accuracy']:.3f} ECE={o['ece']:.3f} AUROC={o['auroc']:.3f} wrong>=95%={o['wrong_at_95']:.2%}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
