"""The answer record: committed caches so ``hd replay`` reproduces every number without a key.

``answers/<engine>/<task>.jsonl.gz`` holds one JSON row per answered item:
``{id, model, usage, latency_ms, answers}``, plus ``started_at`` (UTC, from 2026-10-01 onward). Rows
are appended as they arrive (a gzip file may hold several members), so an interrupted run resumes by
skipping ids already present. Each run also appends one line to ``<task>.runs.jsonl`` beside the
record: when it ran, at what concurrency, on which machine and code.

``timing/<engine>/<task>.jsonl.gz`` has the same shape: reruns made only to measure timing. Scoring
never reads it, so the scored ``answers/`` records stay the ones the preregistration was scored on.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Dict, Iterable, List, Mapping

from hard_decisions.tasks import ROOT

REQUIRED = ("id", "model", "usage", "latency_ms", "answers")


TREES = ("answers", "timing")


def record_path(engine: str, task: str, *, root: Path = ROOT, tree: str = "answers") -> Path:
    if tree not in TREES:
        raise ValueError(f"unknown record tree {tree!r}")
    return Path(root) / tree / engine / f"{task}.jsonl.gz"


def manifest_path(path: Path) -> Path:
    return Path(path).with_name(Path(path).name.replace(".jsonl.gz", ".runs.jsonl"))


def append_manifest(path: Path, entry: Mapping) -> None:
    target = manifest_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, sort_keys=True) + "\n")


def read_record(path: Path) -> List[Dict]:
    if not Path(path).exists():
        return []
    rows: List[Dict] = []
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def read_by_id(path: Path) -> Dict[str, Dict]:
    return {row["id"]: row for row in read_record(path)}


def append_rows(path: Path, rows: Iterable[Mapping]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "at", encoding="utf-8") as handle:
        for row in rows:
            missing = [f for f in REQUIRED if f not in row]
            if missing:
                raise ValueError(f"record row {row.get('id')!r} is missing {missing}")
            handle.write(json.dumps(row, sort_keys=True) + "\n")


def engines_with_records(task: str, *, root: Path = ROOT) -> List[str]:
    return sorted(p.parent.name for p in (Path(root) / "answers").glob(f"*/{task}.jsonl.gz"))
