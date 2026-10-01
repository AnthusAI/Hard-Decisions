import asyncio
import json

import pytest
import yaml

from hard_decisions import answering, report, scoring
from hard_decisions.engines.base import EngineAnswer
from hard_decisions.record import append_rows, read_record, record_path
from hard_decisions.tasks import Task


def make_root(tmp_path, n=8):
    task_dir = tmp_path / "tasks" / "proofwriter-owa"
    task_dir.mkdir(parents=True)
    (task_dir / "question.yaml").write_text(yaml.safe_dump({
        "semantics": "OWA", "question": "Q?", "options": ["true", "false", "unknown"],
        "descriptions": {"true": "t", "false": "f", "unknown": "u"}}))
    labels = ["true", "false", "unknown", "true"]
    items = [{"id": f"i{k}", "text": f"theory {k}\n\nStatement: x",
              "metadata": {"reference_label": labels[k % 4], "depth": k % 2, "theory_kind": "attribute",
                           "theory_negation": "no-negation", "statement_negated": False, "strategy": "proof",
                           "paraphrased": False, "theory_max_depth": 3, "words_bin": "0-49", "rules_bin": "0-2",
                           "facts_bin": "0-3", "proof_size_bin": "1"}} for k in range(n)]
    (task_dir / "items.jsonl").write_text("".join(json.dumps(i) + "\n" for i in items))
    return tmp_path, items


class Oracle:
    name = "oracle"

    def __init__(self, wrong=()):
        self.wrong = set(wrong)

    async def answer(self, text, questions):
        k = int(text.split()[1])
        gold = ["true", "false", "unknown", "true"][k % 4]
        choice = "false" if (k in self.wrong and gold != "false") else gold
        return EngineAnswer(answers={"Decision": {"type": "choice", "choice": choice}}, model="oracle-1",
                            usage={"input_tokens": 100, "output_tokens": 1})


def test_run_resumes_and_scores(tmp_path):
    root, items = make_root(tmp_path)
    task = Task.load("proofwriter-owa", root=root)
    path = record_path("oracle", task.slug, root=root)
    todo = answering.pending(items, path, limit=5)
    stats = asyncio.run(answering.run(Oracle(wrong={0, 2}), task, todo, path))
    assert stats == {"answered": 5, "failed": 0}
    assert len(answering.pending(items, path)) == 3
    asyncio.run(answering.run(Oracle(wrong={0, 2}), task, answering.pending(items, path), path))
    rows = scoring.score("oracle", task, root=root)
    overall = rows[0]
    assert overall["n"] == 8 and overall["correct"] == 6 and overall["invalid"] == 0
    depth0 = next(r for r in rows if r["axis"] == "depth" and r["value"] == "0")
    assert depth0["n"] == 4 and depth0["correct"] == 2


def test_invalid_choice_counts_wrong(tmp_path):
    root, items = make_root(tmp_path, n=4)
    task = Task.load("proofwriter-owa", root=root)
    append_rows(record_path("odd", task.slug, root=root), [
        {"id": "i0", "model": "m", "usage": None, "latency_ms": 1, "answers": {"Decision": {"choice": "maybe"}}},
        {"id": "i1", "model": "m", "usage": None, "latency_ms": 1, "answers": {}}])
    overall = scoring.score("odd", task, root=root)[0]
    assert overall["n"] == 2 and overall["correct"] == 0 and overall["invalid"] == 2


def test_replay_is_deterministic_and_report_renders(tmp_path):
    root, items = make_root(tmp_path)
    task = Task.load("proofwriter-owa", root=root)
    for name, wrong in (("a", {0}), ("b", {0, 1, 2, 4})):
        path = record_path(name, task.slug, root=root)
        asyncio.run(answering.run(Oracle(wrong=wrong), task, items, path))
    scoring.replay(task, root=root)
    first = {p.name: p.read_text() for p in (root / "studies").iterdir()}
    scoring.replay(task, root=root)
    assert first == {p.name: p.read_text() for p in (root / "studies").iterdir()}
    assert "proofwriter-owa-a-vs-b.jsonl" in first
    text = report.render(root=root)
    assert "| a | 8 |" in text and "a minus b" in text


def test_estimate_prefers_measured_usage(tmp_path):
    root, items = make_root(tmp_path)
    task = Task.load("proofwriter-owa", root=root)
    guess = answering.estimate(task, items, [])
    assert "estimated" in guess.basis and guess.requests == 8 and guess.usd > 0
    recorded = [{"id": i["id"], "usage": {"input_tokens": 100}} for i in items[:4]]
    measured = answering.estimate(task, items, recorded, {i["id"]: i["text"] for i in items})
    assert "measured" in measured.basis
