"""Probe: can GPT-6 Luna's log-probabilities serve as a confidence? (Preregistration, Amendment 6.)

Sends every benchmark item to GPT-6 Luna with exactly the benchmark's request (same prompt, strict JSON schema with
the options as an enum, reasoning_effort none, default sampling) plus ``logprobs: true, top_logprobs: 5``, and keeps
every request body and the full response verbatim in ``probes/luna-logprobs/<task>.jsonl.gz``. Resumable: ids
already recorded are skipped. Not part of the scored benchmark; ``analyze_luna_logprobs.py`` reads these files.

    python tools/probe_luna_logprobs.py proofwriter-owa --confirm      # without --confirm: price only
"""
from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hard_decisions.answering import utc_now  # noqa: E402
from hard_decisions.engines.llm import answer_schema, render_prompt, spec_for  # noqa: E402
from hard_decisions.tasks import Task  # noqa: E402

OUT = ROOT / "probes" / "luna-logprobs"
TOP_LOGPROBS = 5


def request_body(task: Task, item: dict) -> dict:
    spec = spec_for("openai", "gpt-6-luna")
    question = next(iter(task.wire_questions().values()))
    return {"model": spec.model, "max_completion_tokens": spec.max_tokens,
            "messages": [{"role": "user", "content": render_prompt(item["text"], question)}],
            **spec.params,
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "decision", "strict": True, "schema": answer_schema(task.options)}},
            "logprobs": True, "top_logprobs": TOP_LOGPROBS}


def done_ids(path: Path) -> set:
    if not path.exists():
        return set()
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return {json.loads(line)["id"] for line in handle if line.strip()}


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task")
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--concurrency", type=int, default=8)
    args = parser.parse_args()
    task = Task.load(args.task)
    path = OUT / f"{task.slug}.jsonl.gz"
    todo = [i for i in task.load_items() if i["id"] not in done_ids(path)]
    chars = sum(len(request_body(task, i)["messages"][0]["content"]) for i in todo)
    print(f"{task.slug}: {len(todo)} requests, ~{chars / 3.6:,.0f} input tokens, ~${chars / 3.6 * 0.10 / 1e6 + len(todo) * 12 * 0.50 / 1e6:.3f}")
    if not args.confirm:
        print("dry run: nothing sent")
        return 0
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    from openai import AsyncOpenAI
    client = AsyncOpenAI(max_retries=6)
    gate, failed = asyncio.Semaphore(args.concurrency), 0
    OUT.mkdir(parents=True, exist_ok=True)
    started_at = utc_now()

    async def one(item: dict) -> None:
        nonlocal failed
        body = request_body(task, item)
        async with gate:
            t0, at = time.perf_counter(), utc_now()
            try:
                response = await client.chat.completions.create(**body)
            except Exception as error:  # noqa: BLE001 - recorded as a failure; rerun to retry
                failed += 1
                print(f"  failed {item['id']}: {type(error).__name__}")
                return
            row = {"id": item["id"], "started_at": at, "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
                   "request": body, "response": response.model_dump()}
            with gzip.open(path, "at", encoding="utf-8") as handle:
                handle.write(json.dumps(row, sort_keys=True) + "\n")

    await asyncio.gather(*(one(i) for i in todo))
    with open(OUT / f"{task.slug}.runs.jsonl", "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"task": task.slug, "started_at": started_at, "finished_at": utc_now(),
                                 "requested": len(todo), "failed": failed, "concurrency": args.concurrency,
                                 "top_logprobs": TOP_LOGPROBS}, sort_keys=True) + "\n")
    print(f"answered {len(todo) - failed}, failed {failed}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
