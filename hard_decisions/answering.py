"""``hd answer``: ask an engine and append to the record.

Dry-run by default: without ``confirm`` nothing is sent and the price is printed. A paid run needs
``confirm=True`` and an explicit ``max_requests`` ceiling; it resumes by skipping ids already in
the record, so a repeat run only pays for what is missing.
"""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from hard_decisions.engines.base import Engine
from hard_decisions.record import append_rows, read_record
from hard_decisions.tasks import Task

JEV_USD_PER_INPUT_TOKEN = 42 / 1e9   # TypeSafe's published price; output tokens are free
DEFAULT_CHARS_PER_TOKEN = 3.6
FALLBACK_OVERHEAD_TOKENS = 80          # wire framing around the text, replaced by measured usage


class AnswerRefused(RuntimeError):
    pass


@dataclass
class Price:
    requests: int
    input_tokens: float
    usd: float
    basis: str

    def __str__(self) -> str:
        return (f"{self.requests} requests, ~{self.input_tokens:,.0f} input tokens, "
                f"~${self.usd:.4f} at ${JEV_USD_PER_INPUT_TOKEN * 1e9:.0f} per billion input tokens ({self.basis})")


def pending(items: Sequence[dict], path: Path, limit: Optional[int] = None) -> List[dict]:
    done = {row["id"] for row in read_record(path)}
    todo = [item for item in items if item["id"] not in done]
    return todo[:limit] if limit is not None else todo


def estimate(task: Task, items: Sequence[dict], recorded: Sequence[dict],
             texts: Optional[Dict[str, str]] = None) -> Price:
    """Price from measured usage when a record exists (tokens per character of item text plus the
    fixed question overhead), else from a characters-per-token guess."""
    question_chars = len(json.dumps(task.wire_questions()))
    usages = [r["usage"]["input_tokens"] for r in recorded if r.get("usage") and r["usage"].get("input_tokens")]
    if usages and texts:
        chars = [len(texts[r["id"]]) for r in recorded if r.get("usage") and r["usage"].get("input_tokens")
                 and r["id"] in texts]
        measured = sum(usages[:len(chars)]) / max(1, sum(chars) + question_chars * len(chars))
        total = sum((len(i["text"]) + question_chars) * measured for i in items)
        basis = f"measured from {len(chars)} recorded requests"
    else:
        total = sum((len(i["text"]) + question_chars) / DEFAULT_CHARS_PER_TOKEN + FALLBACK_OVERHEAD_TOKENS
                    for i in items)
        basis = "estimated from text length; no usage recorded yet"
    return Price(requests=len(items), input_tokens=total, usd=total * JEV_USD_PER_INPUT_TOKEN, basis=basis)


@dataclass
class LLMPrice:
    requests: int
    input_tokens: float
    output_tokens: float
    usd: float
    basis: str

    def __str__(self) -> str:
        return (f"{self.requests} requests, ~{self.input_tokens:,.0f} input and ~{self.output_tokens:,.0f} output "
                f"tokens, ~${self.usd:.2f} at list price ({self.basis})")


ASSUMED_OUTPUT_TOKENS = {False: 15, True: 600}   # without / with a reasoning setting, until measured


def estimate_llm(spec, task: Task, items: Sequence[dict], recorded: Sequence[dict],
                 texts: Dict[str, str]) -> Optional[LLMPrice]:
    """Price a hosted LLM run from measured usage when a record exists, else from text length and a
    conservative output allowance. None when the model has no list price on file."""
    from hard_decisions import pricing
    from hard_decisions.engines.llm import render_prompt
    rates = pricing.per_token(spec.model)
    if rates is None:
        return None
    question = next(iter(task.wire_questions().values()))
    chars = [len(render_prompt(i["text"], question)) for i in items]
    measured = [r for r in recorded if r.get("usage") and r["usage"].get("input_tokens") and r["id"] in texts]
    if measured:
        per_char = sum(r["usage"]["input_tokens"] for r in measured) / sum(
            len(render_prompt(texts[r["id"]], question)) for r in measured)
        out_each = sum(r["usage"].get("output_tokens") or 0 for r in measured) / len(measured)
        basis = f"measured from {len(measured)} recorded requests"
    else:
        per_char = 1 / DEFAULT_CHARS_PER_TOKEN
        out_each = ASSUMED_OUTPUT_TOKENS[spec.setting not in ("t0", "no-thinking", "effort-none")]
        basis = f"estimated; assumes {out_each} output tokens per request"
    inp = sum(chars) * per_char
    out = out_each * len(items)
    return LLMPrice(len(items), inp, out, inp * rates[0] + out * rates[1], basis)


async def run(engine: Engine, task: Task, items: Sequence[dict], path: Path, *, concurrency: int = 8,
              max_failures: int = 10) -> Dict[str, int]:
    """Answer ``items`` and append each row as it arrives. Returns counts."""
    questions = task.wire_questions()
    gate = asyncio.Semaphore(concurrency)
    stats = {"answered": 0, "failed": 0}
    stop = asyncio.Event()

    async def one(item: dict) -> None:
        if stop.is_set():
            return
        async with gate:
            if stop.is_set():
                return
            started = time.perf_counter()
            try:
                result = await engine.answer(item["text"], questions)
            except Exception as error:  # noqa: BLE001 - a failed item is retried on the next run
                stats["failed"] += 1
                if stats["failed"] >= max_failures:
                    stop.set()
                print(f"  failed {item['id']}: {type(error).__name__}")
                return
            append_rows(path, [{"id": item["id"], "model": result.model or engine.name, "usage": result.usage,
                                "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                                "answers": result.answers}])
            stats["answered"] += 1

    await asyncio.gather(*(one(item) for item in items))
    return stats
