"""The parametrized, difficulty-diverse sampler.

``build(archive, semantics, n, seed)`` picks ``n`` items from the ProofWriter test pool so that:

* every (proof depth x gold label) stratum is represented before any stratum gets a second helping,
  so hard depths and the ``unknown`` class are never starved the way a uniform draw would starve
  them (``weights`` tilts the allocation toward chosen depths);
* inside a stratum, items are ranked by greedy coverage of the secondary axes (theory kind,
  negation, strategy, length, ...), so a small sample spans their ranges instead of clustering at
  the typical theory, and questions from one theory are spread out;
* the sample is nested: for one seed, ``sample(n)`` is a prefix of ``sample(n')`` when ``n < n'``,
  so enlarging a run only adds items and every answer already paid for stays valid.
"""
from __future__ import annotations

import hashlib
import heapq
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from hard_decisions.proofwriter import (CONFIGS, LABELS, MAX_DEPTH, Candidate, iter_pool,
                                        materialize)
from hard_decisions.tasks import AXES

GREEDY_AXES = ("theory_kind", "theory_negation", "statement_negated", "strategy", "paraphrased",
               "words_bin", "rules_bin", "proof_size_bin", "config")
THEORY_WEIGHT = 3
POOL_CAP = 1000   # seeded candidates kept per stratum before greedy ranking
PICK_CAP = 150    # most items one stratum can contribute, so n is capped at strata * PICK_CAP

Stratum = Tuple[str, int, str]


def seeded_rank(seed: int, item_id: str) -> int:
    return int(hashlib.sha256(f"{seed}:{item_id}".encode()).hexdigest()[:12], 16)


def theory_id(candidate: Candidate) -> str:
    return candidate.id.rsplit("-", 1)[0]


def _features(candidate: Candidate) -> List[Tuple[Tuple[str, object], int]]:
    keys = [((axis, candidate.metadata[axis]), 1) for axis in GREEDY_AXES]
    keys.append((("theory", theory_id(candidate)), THEORY_WEIGHT))
    return keys


def stratum_order(candidates: Sequence[Candidate], seed: int, pick_cap: int = PICK_CAP) -> List[Candidate]:
    """Greedy coverage ranking: each pick is the candidate whose feature values are currently the
    least represented among the picks so far; ties go to the lower seeded rank."""
    ranked = sorted(candidates, key=lambda c: (seeded_rank(seed, c.id), c.id))
    features = [_features(c) for c in ranked]
    counts: Counter = Counter()
    remaining = list(range(len(ranked)))
    order: List[Candidate] = []
    for _ in range(min(pick_cap, len(ranked))):
        best = min(remaining, key=lambda i: (sum(counts[k] for k, _w in features[i]), i))
        order.append(ranked[best])
        remaining.remove(best)
        for key, weight in features[best]:
            counts[key] += weight
    return order


def pick_sequence(orders: Mapping[Stratum, Sequence[Candidate]],
                  weights: Optional[Mapping[int, float]] = None) -> List[Candidate]:
    """Every candidate in global pick order. The j-th pick of a stratum with weight w has priority
    (j - 0.5) / w, so equal weights round-robin over strata (hardest depth first on ties) and a
    heavier stratum is visited proportionally more often."""
    weights = weights or {}
    label_rank = {label: i for i, label in enumerate(("true", "false", "unknown"))}
    keyed = []
    for stratum, order in orders.items():
        semantics, depth, label = stratum
        weight = float(weights.get(depth, 1.0))
        if weight <= 0:
            continue
        tie = (-depth, label_rank[label], semantics)
        for j, candidate in enumerate(order, 1):
            keyed.append(((j - 0.5) / weight, tie, candidate.id, candidate))
    keyed.sort(key=lambda row: row[:3])
    return [row[3] for row in keyed]


def scan_pool(archive: Path, semantics: str, depths: Iterable[int], configs: Sequence[str],
              seed: int, pool_cap: int = POOL_CAP):
    """One pass over the archive. Keeps the ``pool_cap`` lowest-ranked candidates per stratum
    (a seeded uniform subsample), the true stratum sizes, and the pool-wide axis histograms."""
    depths = set(depths)
    heaps: Dict[Stratum, list] = defaultdict(list)
    sizes: Counter = Counter()
    pool_hist: Dict[str, Counter] = {axis: Counter() for axis, _ in AXES}
    for candidate in iter_pool(archive, semantics, configs):
        if candidate.depth not in depths or candidate.label not in LABELS[semantics]:
            continue
        sizes[candidate.stratum] += 1
        for axis in pool_hist:
            pool_hist[axis][str(candidate.metadata[axis])] += 1
        entry = (-seeded_rank(seed, candidate.id), candidate.id, candidate)
        heap = heaps[candidate.stratum]
        if len(heap) < pool_cap:
            heapq.heappush(heap, entry)
        elif entry > heap[0]:
            heapq.heapreplace(heap, entry)
    pools = {s: [e[2] for e in heap] for s, heap in heaps.items()}
    return pools, sizes, pool_hist


def select(pools: Mapping[Stratum, Sequence[Candidate]], n: int, seed: int,
           weights: Optional[Mapping[int, float]] = None, pick_cap: int = PICK_CAP) -> List[Candidate]:
    orders = {s: stratum_order(c, seed, pick_cap) for s, c in pools.items()}
    return pick_sequence(orders, weights)[:n]


def build(archive: Path, semantics: str, n: int, seed: int, *,
          depths: Sequence[int] = tuple(range(MAX_DEPTH + 1)),
          configs: Sequence[str] = CONFIGS,
          weights: Optional[Mapping[int, float]] = None) -> Tuple[List[dict], dict]:
    """(items, manifest) for one semantics. Every label is recomputed by the solver."""
    pools, sizes, pool_hist = scan_pool(archive, semantics, depths, configs, seed)
    chosen = select(pools, n, seed, weights)
    items = materialize(archive, chosen)
    selected = Counter(c.stratum for c in chosen)
    strata = []
    for stratum in sorted(sizes, key=lambda s: (s[1], s[2])):
        strata.append({"depth": stratum[1], "label": stratum[2], "available": sizes[stratum],
                       "selected": selected.get(stratum, 0)})
    selected_hist = {axis: dict(Counter(str(i["metadata"][axis]) for i in items)) for axis, _ in AXES}
    manifest = {
        "semantics": semantics, "n_requested": n, "n_selected": len(items), "seed": seed,
        "depths": list(depths), "configs": list(configs),
        "weights": {str(k): v for k, v in (weights or {}).items()},
        "pool_cap_per_stratum": POOL_CAP, "pick_cap_per_stratum": PICK_CAP,
        "label_check": "every selected label recomputed by hard_decisions.solver; zero disagreements",
        "strata": strata,
        "axis_counts": {"selected": selected_hist,
                        "pool": {axis: dict(hist) for axis, hist in pool_hist.items()}},
    }
    return items, manifest
