"""GLiDE's launch-week run (2026-10-02) against the rerun Fastino's CEO asked for (2026-10-03), on the same problems
with the same request. Writes studies/glide-rerun/compare.json; offline, no requests.

    python tools/glide_rerun_compare.py
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from analyze_luna_logprobs import auroc  # noqa: E402
from hard_decisions.record import read_by_id, record_path  # noqa: E402
from hard_decisions.tasks import QUESTION_NAME, Task  # noqa: E402

RUNS = {"2026-10-02 (launch)": "glide", "2026-10-03 (rerun at Fastino's request)": "glide-rerun-2026-10-03"}
PRICE = 0.30 / 1e6


def boot_ci(xs, n=2000, seed=7):
    rng = random.Random(seed)
    means = sorted(sum(rng.choice(xs) for _ in xs) / len(xs) for _ in range(n))
    return means[int(0.025 * n)], means[int(0.975 * n)]


def stats(rows, items):
    ok = [r["answers"][QUESTION_NAME]["choice"] == items[i]["metadata"]["reference_label"] for i, r in rows.items()]
    ms = sorted(r["latency_ms"] for r in rows.values())
    probs = [((r["answers"][QUESTION_NAME].get("probabilities") or {}).get(r["answers"][QUESTION_NAME]["choice"]), c)
             for r, c in zip(rows.values(), ok)]
    probs = [(p, c) for p, c in probs if p is not None]
    tokens = sum((r.get("usage") or {}).get("input_tokens", 0) for r in rows.values())
    by_depth = {}
    for d in range(6):
        g = [c for (i, r), c in zip(rows.items(), ok) if items[i]["metadata"]["depth"] == d]
        if g:
            by_depth[d] = sum(g) / len(g)
    lo, hi = boot_ci([float(c) for c in ok])
    return {"n": len(ok), "accuracy": sum(ok) / len(ok), "ci": [lo, hi], "by_depth": by_depth,
            "latency_ms": {"p50": ms[len(ms) // 2], "p90": ms[int(0.9 * (len(ms) - 1))], "max": ms[-1],
                           "at_least_10s": sum(x >= 10000 for x in ms)},
            "input_tokens": tokens, "usd_per_million": tokens * PRICE / len(ok) * 1e6,
            "auroc": auroc([p for p, _ in probs], [int(c) for _, c in probs])}


def main():
    out = {"runs": RUNS, "tasks": {}}
    for slug in ("proofwriter-owa", "proofwriter-cwa"):
        items = {i["id"]: i for i in Task.load(slug).load_items()}
        recs = {label: read_by_id(record_path(engine, slug)) for label, engine in RUNS.items()}
        common = sorted(set.intersection(*(set(r) for r in recs.values())))
        jev = read_by_id(record_path("jev", slug))
        task = {"common_items": len(common), "runs": {}}
        for label, rows in recs.items():
            sub = {i: rows[i] for i in common}
            s = stats(sub, items)
            diff = [float(rows[i]["answers"][QUESTION_NAME]["choice"] == items[i]["metadata"]["reference_label"]) -
                    float(jev[i]["answers"][QUESTION_NAME]["choice"] == items[i]["metadata"]["reference_label"]) for i in common]
            lo, hi = boot_ci(diff)
            s["minus_jev"] = {"diff": sum(diff) / len(diff), "ci": [lo, hi]}
            task["runs"][label] = s
        a, b = list(recs.values())
        changed = [i for i in common if a[i]["answers"][QUESTION_NAME]["choice"] != b[i]["answers"][QUESTION_NAME]["choice"]]
        gold = lambda i, r: r[i]["answers"][QUESTION_NAME]["choice"] == items[i]["metadata"]["reference_label"]  # noqa: E731
        task["changed"] = {"n": len(changed), "share": len(changed) / len(common),
                           "wrong_to_right": sum(not gold(i, a) and gold(i, b) for i in changed),
                           "right_to_wrong": sum(gold(i, a) and not gold(i, b) for i in changed),
                           "by_depth": {d: sum(items[i]["metadata"]["depth"] == d for i in changed) for d in range(6)}}
        out["tasks"][slug] = task
    path = ROOT / "studies" / "glide-rerun" / "compare.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=1) + "\n")
    for slug, t in out["tasks"].items():
        print(f"== {slug} ({t['common_items']} problems in both runs)")
        for label, s in t["runs"].items():
            print(f"  {label:42} acc {100*s['accuracy']:.1f}% [{100*s['ci'][0]:.1f}-{100*s['ci'][1]:.1f}]  vs Jev {100*s['minus_jev']['diff']:+.1f} "
                  f"[{100*s['minus_jev']['ci'][0]:+.1f},{100*s['minus_jev']['ci'][1]:+.1f}]  depth " + " ".join(f"{100*v:.0f}" for v in s["by_depth"].values()) +
                  f"  | p50 {s['latency_ms']['p50']/1000:.2f}s p90 {s['latency_ms']['p90']/1000:.1f}s max {s['latency_ms']['max']/1000:.0f}s >=10s {s['latency_ms']['at_least_10s']}"
                  f"  | ${s['usd_per_million']:.0f}/M  | AUROC {s['auroc']:.3f}")
        c = t["changed"]
        print(f"  answers changed between runs: {c['n']} ({100*c['share']:.1f}%), wrong->right {c['wrong_to_right']}, right->wrong {c['right_to_wrong']}, by depth {c['by_depth']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
