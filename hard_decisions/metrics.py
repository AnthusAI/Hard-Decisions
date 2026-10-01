"""Accuracy and its uncertainty. Percentile bootstrap, seed 0, 1,000 resamples (the
Biased-Decisions convention), so replaying a committed record reproduces an interval exactly."""
from __future__ import annotations

import random
from collections import Counter
from typing import Dict, List, Mapping, Optional, Sequence, Tuple

RESAMPLES = 1000
SEED = 0


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else float("nan")


def bootstrap_ci(values: Sequence[float], *, resamples: int = RESAMPLES, seed: int = SEED
                 ) -> Tuple[float, float]:
    if not values:
        return (float("nan"), float("nan"))
    rng = random.Random(seed)
    n = len(values)
    means = sorted(sum(rng.choices(values, k=n)) / n for _ in range(resamples))
    return (means[int(0.025 * resamples)], means[min(resamples - 1, int(0.975 * resamples))])


def paired_diff_ci(a: Sequence[float], b: Sequence[float], *, resamples: int = RESAMPLES,
                   seed: int = SEED) -> Tuple[float, float, float]:
    """(mean a - b, low, high) over items answered by both; items are resampled together."""
    diffs = [x - y for x, y in zip(a, b)]
    low, high = bootstrap_ci(diffs, resamples=resamples, seed=seed)
    return (mean(diffs), low, high)


def confusion(gold: Sequence[str], predicted: Sequence[str], options: Sequence[str]) -> Dict[str, Dict[str, int]]:
    table = {g: {p: 0 for p in list(options) + ["invalid"]} for g in options}
    for g, p in zip(gold, predicted):
        table[g][p if p in options else "invalid"] += 1
    return table


def per_class_recall(table: Mapping[str, Mapping[str, int]]) -> Dict[str, Optional[float]]:
    out: Dict[str, Optional[float]] = {}
    for g, row in table.items():
        total = sum(row.values())
        out[g] = (row[g] / total) if total else None
    return out


def macro_f1(table: Mapping[str, Mapping[str, int]]) -> float:
    scores: List[float] = []
    for c in table:
        tp = table[c][c]
        fp = sum(table[g][c] for g in table if g != c)
        fn = sum(v for p, v in table[c].items() if p != c)
        denom = 2 * tp + fp + fn
        scores.append(2 * tp / denom if denom else 0.0)
    return sum(scores) / len(scores)


def best_constant_accuracy(gold: Sequence[str]) -> float:
    """Accuracy of the best always-the-same-answer guesser on exactly these items."""
    return max(Counter(gold).values()) / len(gold) if gold else float("nan")
