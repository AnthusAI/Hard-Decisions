from collections import Counter

import pytest

from hard_decisions.proofwriter import Candidate
from hard_decisions.sampling import pick_sequence, select, seeded_rank, stratum_order


def make(sem, depth, label, k, **meta):
    metadata = {"theory_kind": "attribute", "theory_negation": "no-negation", "statement_negated": False,
                "strategy": "proof", "paraphrased": False, "words_bin": "50-79", "rules_bin": "3-5",
                "proof_size_bin": "1", "config": "depth-3"}
    metadata.update(meta)
    return Candidate(id=f"T{depth}{label}{k}-Q1", semantics=sem, config="depth-3", line=k, qid="Q1",
                     label=label, depth=depth, metadata=metadata)


def pools(sizes):
    out = {}
    for depth in range(6):
        for label in ("true", "false", "unknown"):
            n = sizes.get((depth, label), 40)
            out[("OWA", depth, label)] = [make("OWA", depth, label, k, strategy=("proof", "inv-proof", "random")[k % 3])
                                          for k in range(n)]
    return out


def test_every_stratum_represented_before_any_repeats():
    chosen = select(pools({}), 18, seed=0)
    assert Counter(c.stratum for c in chosen) == Counter({s: 1 for s in pools({})})


def test_nested_prefix_property():
    small = select(pools({}), 30, seed=3)
    large = select(pools({}), 90, seed=3)
    assert [c.id for c in large[:30]] == [c.id for c in small]


def test_deterministic_and_seed_sensitive():
    a = [c.id for c in select(pools({}), 40, seed=1)]
    assert a == [c.id for c in select(pools({}), 40, seed=1)]
    assert a != [c.id for c in select(pools({}), 40, seed=2)]


def test_small_stratum_is_not_padded_and_others_continue():
    chosen = select(pools({(5, "unknown"): 2}), 100, seed=0)
    counts = Counter(c.stratum for c in chosen)
    assert counts[("OWA", 5, "unknown")] == 2
    assert len(chosen) == 100


def test_weights_tilt_toward_hard_depths():
    flat = Counter(c.depth for c in select(pools({}), 90, seed=0))
    tilted = Counter(c.depth for c in select(pools({}), 90, seed=0, weights={5: 3.0}))
    assert tilted[5] > flat[5]


def test_greedy_spreads_over_secondary_axes():
    cands = [make("OWA", 2, "true", k, strategy=("proof", "inv-proof", "random")[k % 3]) for k in range(60)]
    order = stratum_order(cands, seed=0)[:6]
    assert Counter(c.metadata["strategy"] for c in order) == Counter({"proof": 2, "inv-proof": 2, "random": 2})


def test_greedy_avoids_repeating_a_theory():
    cands = [Candidate(id=f"T{k // 2}-Q{k % 2}", semantics="OWA", config="depth-3", line=k, qid="Q",
                       label="true", depth=2, metadata=make("OWA", 2, "true", 0).metadata) for k in range(20)]
    order = stratum_order(cands, seed=0)[:10]
    assert len({c.id.rsplit("-", 1)[0] for c in order}) == 10


def test_seeded_rank_stable():
    assert seeded_rank(0, "x") == seeded_rank(0, "x") != seeded_rank(1, "x")
