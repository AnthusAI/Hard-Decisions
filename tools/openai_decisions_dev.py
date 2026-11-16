"""Dev-split check of OpenAI's Decisions API before any benchmark item is used. Offline except for the requests it
sends; writes studies/openai-decisions-dev/results.json. No benchmark item is used.

    python tools/openai_decisions_dev.py            # one request, printed in full, to check the request shape
    DEV_PER_DEPTH=10 python tools/openai_decisions_dev.py --run
"""
from __future__ import annotations

import asyncio
import json
import os
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("GLINER_DEV_PER_DEPTH", os.environ.get("DEV_PER_DEPTH", "10"))

from gliner_request_form import dev_items  # noqa: E402  (tools/ is on sys.path when run as a script)
from hard_decisions.engines.openai_decisions import OpenAIDecisionsEngine, request_body  # noqa: E402
from hard_decisions.tasks import QUESTION_NAME, Task  # noqa: E402


async def main(run: bool) -> int:
    engine = OpenAIDecisionsEngine()
    out = {}
    for slug in ("proofwriter-owa", "proofwriter-cwa"):
        task = Task.load(slug)
        q = task.wire_questions()
        items = dev_items(task.semantics)
        if not run:
            items = [min((i for i in items if i["depth"] == 0), key=lambda i: len(i["text"]))]
            print(json.dumps(request_body(items[0]["text"], q), indent=1))
        rows = []
        sem = asyncio.Semaphore(4)

        async def one(item):
            async with sem:
                t = time.perf_counter()
                a = await engine.answer(item["text"], q)
                return item, a, (time.perf_counter() - t) * 1000
        for item, a, ms in await asyncio.gather(*(one(i) for i in items)):
            ans = a.answers[QUESTION_NAME]
            rows.append({"depth": item["depth"], "gold": item["gold"], "choice": ans["choice"], "confidence": ans["confidence"],
                         "probabilities": ans["probabilities"], "usage": a.usage, "model": a.model, "ms": ms})
            if not run:
                print(json.dumps({"model": a.model, "answers": a.answers, "usage": a.usage, "ms": round(ms)}, indent=1))
        if run:
            by = defaultdict(lambda: [0, 0])
            for r in rows:
                by[r["depth"]][0] += r["choice"] == r["gold"]
                by[r["depth"]][1] += 1
            ms = sorted(r["ms"] for r in rows)
            out[slug] = {"n": len(rows), "accuracy": sum(r["choice"] == r["gold"] for r in rows) / len(rows),
                         "said": dict(Counter(r["choice"] for r in rows)), "by_depth": {d: v[0] / v[1] for d, v in sorted(by.items())},
                         "latency_ms": {"p50": ms[len(ms) // 2], "max": ms[-1]},
                         "tokens": sum((r["usage"] or {}).get("input_tokens", 0) for r in rows), "rows": rows}
            print(slug, {k: v for k, v in out[slug].items() if k != "rows"})
    if run:
        path = ROOT / "studies" / "openai-decisions-dev" / "results.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--run" in sys.argv)))
