"""Turn a task's items and an engine's record into result rows (``studies/*.jsonl``).

Every row is one (engine, task, axis, value) cell: accuracy with its bootstrap interval, the
best-constant floor on the same items, and (overall only) macro-F1, per-class recall and the
confusion matrix. Nothing here calls an engine; everything comes from the committed record.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Mapping, Optional

from hard_decisions import metrics
from hard_decisions.record import engines_with_records, read_by_id, record_path
from hard_decisions.tasks import AXES, QUESTION_NAME, ROOT, Task


def judged(task: Task, items: List[dict], rows: Mapping[str, dict]) -> List[dict]:
    """Items that have a record row, with the engine's choice and whether it was right."""
    out = []
    for item in items:
        row = rows.get(item["id"])
        if row is None:
            continue
        answer = (row.get("answers") or {}).get(QUESTION_NAME) or {}
        choice = answer.get("choice")
        gold = item["metadata"]["reference_label"]
        out.append({"id": item["id"], "metadata": item["metadata"], "gold": gold, "choice": choice,
                    "valid": choice in task.options, "correct": int(choice == gold),
                    "probabilities": answer.get("probabilities"), "model": row.get("model")})
    return out


def _cell(engine: str, task: Task, axis: str, value: str, group: List[dict]) -> dict:
    correct = [g["correct"] for g in group]
    low, high = metrics.bootstrap_ci(correct)
    return {"engine": engine, "task": task.slug, "axis": axis, "value": value, "n": len(group),
            "correct": sum(correct), "accuracy": metrics.mean(correct), "ci_low": low, "ci_high": high,
            "best_constant": (metrics.best_constant_accuracy([g["gold"] for g in group])
                              if len({g["gold"] for g in group}) > 1 else None),
            "chance": 1 / len(task.options), "invalid": sum(1 for g in group if not g["valid"])}


def _sort_key(value: str):
    head = value.split("-")[0].rstrip("+")
    return (0, int(head)) if head.isdigit() else (1, value)


def score(engine: str, task: Task, *, root: Path = ROOT) -> List[dict]:
    items = task.load_items()
    group = judged(task, items, read_by_id(record_path(engine, task.slug, root=root)))
    if not group:
        return []
    overall = _cell(engine, task, "overall", "all", group)
    table = metrics.confusion([g["gold"] for g in group], [g["choice"] for g in group], task.options)
    overall.update({"macro_f1": metrics.macro_f1(table), "recall": metrics.per_class_recall(table),
                    "confusion": table, "model": sorted({str(g["model"]) for g in group})})
    rows = [overall]
    for axis, _heading in AXES:
        values = sorted({str(g["metadata"][axis]) for g in group}, key=_sort_key)
        for value in values:
            rows.append(_cell(engine, task, axis, value,
                              [g for g in group if str(g["metadata"][axis]) == value]))
    return rows


def paired(engine_a: str, engine_b: str, task: Task, *, root: Path = ROOT) -> List[dict]:
    items = task.load_items()
    a = {g["id"]: g for g in judged(task, items, read_by_id(record_path(engine_a, task.slug, root=root)))}
    b = {g["id"]: g for g in judged(task, items, read_by_id(record_path(engine_b, task.slug, root=root)))}
    common = [i for i in a if i in b]
    if not common:
        return []

    def cell(axis: str, value: str, ids: List[str]) -> dict:
        diff, low, high = metrics.paired_diff_ci([a[i]["correct"] for i in ids], [b[i]["correct"] for i in ids])
        return {"engine_a": engine_a, "engine_b": engine_b, "task": task.slug, "axis": axis, "value": value,
                "n": len(ids), "diff": diff, "ci_low": low, "ci_high": high}

    rows = [cell("overall", "all", common)]
    for axis in ("depth", "reference_label"):
        for value in sorted({str(a[i]["metadata"][axis]) for i in common}, key=_sort_key):
            rows.append(cell(axis, value, [i for i in common if str(a[i]["metadata"][axis]) == value]))
    return rows


def study_path(task: str, name: str, *, root: Path = ROOT) -> Path:
    return Path(root) / "studies" / f"{task}-{name}.jsonl"


def write_rows(path: Path, rows: List[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, sort_keys=True) + "\n" for r in rows), encoding="utf-8")


def replay(task: Task, *, root: Path = ROOT) -> List[Path]:
    """Rescore every engine that has a record for ``task`` and every pair of them."""
    written = []
    engines = engines_with_records(task.slug, root=root)
    for engine in engines:
        rows = score(engine, task, root=root)
        if rows:
            path = study_path(task.slug, engine, root=root)
            write_rows(path, rows)
            written.append(path)
    for i, a in enumerate(engines):
        for b in engines[i + 1:]:
            rows = paired(a, b, task, root=root)
            if rows:
                path = study_path(task.slug, f"{a}-vs-{b}", root=root)
                write_rows(path, rows)
                written.append(path)
    return written
