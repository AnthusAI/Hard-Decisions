"""Test-retest repeatability: an engine's scored record (run 1, ``answers/``) against its rerun
(run 2, ``timing/``) on the same items. Preregistered in Amendment 4.

Percent agreement is the headline. Gwet's AC1 is the chance-corrected measure: unlike Cohen's kappa it
does not collapse when an engine gives one answer to most items (the prevalence paradox). Kappa is
reported beside it. Nothing here calls an engine.
"""
from __future__ import annotations

import random
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from hard_decisions.record import read_by_id, record_path
from hard_decisions.scoring import _sort_key, study_path, write_rows
from hard_decisions.tasks import QUESTION_NAME, ROOT, Task

Pair = Tuple[Optional[str], Optional[str]]


def coefficients(pairs: Sequence[Pair], categories: Sequence[str]) -> Dict[str, float]:
    """Percent agreement, Cohen's kappa and Gwet's AC1 for two runs' choices. An invalid answer
    (None) is its own category, so an invalid that repeats counts as agreement."""
    cats = list(categories) + ([None] if any(a is None or b is None for a, b in pairs) else [])
    n = len(pairs)
    observed = sum(a == b for a, b in pairs) / n
    first, second = Counter(a for a, _ in pairs), Counter(b for _, b in pairs)
    kappa_chance = sum(first[c] / n * second[c] / n for c in cats)
    prevalence = [(first[c] + second[c]) / (2 * n) for c in cats]
    ac1_chance = sum(p * (1 - p) for p in prevalence) / (len(cats) - 1)

    def corrected(chance: float) -> float:
        return 1.0 if chance >= 1 else (observed - chance) / (1 - chance)

    return {"agreement": observed, "kappa": corrected(kappa_chance), "ac1": corrected(ac1_chance)}


def bootstrap_ac1(pairs: Sequence[Pair], categories: Sequence[str], *, resamples: int = 1000,
                  seed: int = 0) -> Tuple[float, float]:
    rng = random.Random(seed)
    values = sorted(coefficients([pairs[rng.randrange(len(pairs))] for _ in pairs], categories)["ac1"]
                    for _ in range(resamples))
    return values[int(0.025 * resamples)], values[int(0.975 * resamples) - 1]


def _choice(row: dict) -> Optional[str]:
    return ((row.get("answers") or {}).get(QUESTION_NAME) or {}).get("choice")


def _probability(row: dict, option: Optional[str]) -> Optional[float]:
    probabilities = ((row.get("answers") or {}).get(QUESTION_NAME) or {}).get("probabilities")
    return None if not probabilities or option is None else probabilities.get(option)


def retest(engine: str, task: Task, *, root: Path = ROOT) -> List[dict]:
    first = read_by_id(record_path(engine, task.slug, root=root))
    second = read_by_id(record_path(engine, task.slug, root=root, tree="timing"))
    items = {i["id"]: i for i in task.load_items()}
    ids = [i for i in items if i in first and i in second]
    if not ids:
        return []
    pairs = [(_choice(first[i]), _choice(second[i])) for i in ids]
    overall = {"engine": engine, "task": task.slug, "axis": "overall", "value": "all", "n": len(ids),
               **coefficients(pairs, task.options)}
    overall["ac1_low"], overall["ac1_high"] = bootstrap_ac1(pairs, task.options)
    overall["changed"] = sum(a != b for a, b in pairs)
    for run, rows in (("run1", first), ("run2", second)):
        overall[f"accuracy_{run}"] = sum(_choice(rows[i]) == items[i]["metadata"]["reference_label"]
                                         for i in ids) / len(ids)
    shifts = [abs(p2 - p1) for i in ids
              if (p1 := _probability(first[i], _choice(first[i]))) is not None
              and (p2 := _probability(second[i], _choice(first[i]))) is not None]
    overall["prob_shift_mean"] = sum(shifts) / len(shifts) if shifts else None
    overall["prob_shift_max"] = max(shifts) if shifts else None
    out = [overall]
    for depth in sorted({str(items[i]["metadata"]["depth"]) for i in ids}, key=_sort_key):
        group = [p for i, p in zip(ids, pairs) if str(items[i]["metadata"]["depth"]) == depth]
        out.append({"engine": engine, "task": task.slug, "axis": "depth", "value": depth, "n": len(group),
                    "changed": sum(a != b for a, b in group),
                    "change_rate": sum(a != b for a, b in group) / len(group)})
    return out


def replay(task: Task, *, root: Path = ROOT) -> Optional[Path]:
    engines = sorted(p.parent.name for p in (Path(root) / "timing").glob(f"*/{task.slug}.jsonl.gz"))
    rows = [r for e in engines for r in retest(e, task, root=root)]
    if not rows:
        return None
    path = study_path(task.slug, "retest", root=root).parent / "retest" / f"{task.slug}.jsonl"
    write_rows(path, rows)
    return path
