"""Regenerate RESULTS.md from ``studies/*.jsonl`` (never from a live engine)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

from hard_decisions.tasks import AXES, ROOT, Task, all_slugs


def _rows(path: Path) -> List[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _pct(x: float) -> str:
    return f"{100 * x:.1f}"


def _floor(value) -> str:
    return "-" if value is None else _pct(value)


def _n(ns: List[int]) -> str:
    """One count when every engine answered the same items, else each engine's count in column order."""
    return str(ns[0]) if len(set(ns)) == 1 else "/".join(str(n) for n in ns)


def _cell(row: dict) -> str:
    return f"{_pct(row['accuracy'])} [{_pct(row['ci_low'])}-{_pct(row['ci_high'])}]"


def _num(value, digits=3) -> str:
    return "-" if value is None else f"{value:.{digits}f}"


def _retest_section(task: Task, studies: Path) -> List[str]:
    path = studies / "retest" / f"{task.slug}.jsonl"
    if not path.exists():
        return []
    rows = _rows(path)
    overall = [r for r in rows if r["axis"] == "overall"]
    lines = ["### Test-retest repeatability (run 1 = scored record, run 2 = rerun in `timing/`)", "",
             "Agreement is the share of items with the same answer both times. AC1 is Gwet's chance-corrected "
             "agreement (95% bootstrap interval); Cohen's kappa is shown for comparison and understates agreement "
             "when an engine gives one answer to most items. Probability shift is the absolute change in run 1's "
             "chosen option's probability.", "",
             "| engine | n | agreement | AC1 | kappa | changed | accuracy run 1 / run 2 | prob shift mean / max |",
             "|---|---|---|---|---|---|---|---|"]
    for r in overall:
        lines.append(f"| {r['engine']} | {r['n']} | {_pct(r['agreement'])} | {r['ac1']:.3f} "
                     f"[{r['ac1_low']:.3f}-{r['ac1_high']:.3f}] | {r['kappa']:.3f} | {r['changed']} | "
                     f"{_pct(r['accuracy_run1'])} / {_pct(r['accuracy_run2'])} | "
                     f"{_num(r['prob_shift_mean'])} / {_num(r['prob_shift_max'])} |")
    depths = sorted({r["value"] for r in rows if r["axis"] == "depth"}, key=int)
    engines = [r["engine"] for r in overall]
    lines += ["", "Share of answers that changed, by proof depth:", "",
              "| depth | " + " | ".join(engines) + " |", "|---|" + "---|" * len(engines)]
    for d in depths:
        cells = []
        for e in engines:
            m = next((r for r in rows if r["engine"] == e and r["axis"] == "depth" and r["value"] == d), None)
            cells.append("-" if m is None else f"{_pct(m['change_rate'])} ({m['changed']})")
        lines.append(f"| {d} | " + " | ".join(cells) + " |")
    return lines + [""]


def _latency_section(task: Task, root: Path) -> List[str]:
    """Per-request wall time from the reruns in ``timing/``, all made one request at a time."""
    from hard_decisions.record import read_record
    lines = []
    for path in sorted((root / "timing").glob(f"*/{task.slug}.jsonl.gz")):
        values = sorted(r["latency_ms"] for r in read_record(path) if r.get("latency_ms") is not None)
        if not values:
            continue
        q = lambda p: values[int(p * (len(values) - 1))]  # noqa: E731
        lines.append(f"| {path.parent.name} | {len(values)} | {q(0.5):.0f} | {q(0.9):.0f} | {values[-1]:.0f} | "
                     f"{sum(values) / 60000:.1f} |")
    if not lines:
        return []
    return ["### Latency per decision (reruns in `timing/`, one request at a time)", "",
            "Wall time around each request as measured by the harness: network included for hosted engines; "
            "local engines on the machine named in each run's `.runs.jsonl` manifest.", "",
            "| engine | n | p50 ms | p90 ms | max ms | total minutes |", "|---|---|---|---|---|---|"] + lines + [""]


def task_section(task: Task, studies: Path) -> List[str]:
    engines: Dict[str, List[dict]] = {}
    for path in sorted(studies.glob(f"{task.slug}-*.jsonl")):
        name = path.stem[len(task.slug) + 1:]
        if "-vs-" in name:
            continue
        engines[name] = _rows(path)
    lines = [f"## {task.slug}", ""]
    if not engines:
        return lines + ["No engine has been answered on this task yet.", ""]
    first = next(iter(engines.values()))
    overall = {e: next(r for r in rows if r["axis"] == "overall") for e, rows in engines.items()}
    lines += [f"Options: {', '.join(task.options)}. Accuracy is a percentage with a 95% bootstrap interval "
              f"in brackets. `best constant` is the accuracy of always giving the single most common answer "
              f"on the same items (`-` when a slice holds one gold label, where it is trivially 100%); `chance` is 1 divided by the number of options.", ""]
    lines += ["| engine | n | accuracy | macro-F1 | invalid | best constant | chance |", "|---|---|---|---|---|---|---|"]
    for e, r in overall.items():
        lines.append(f"| {e} | {r['n']} | {_cell(r)} | {r['macro_f1']:.3f} | {r['invalid']} | "
                     f"{_floor(r['best_constant'])} | {_pct(r['chance'])} |")
    lines.append("")
    recall_head = " | ".join(f"recall {o}" for o in task.options)
    lines += [f"| engine | {recall_head} |", "|---|" + "---|" * len(task.options)]
    for e, r in overall.items():
        lines.append(f"| {e} | " + " | ".join(
            "-" if r["recall"].get(o) is None else _pct(r["recall"][o]) for o in task.options) + " |")
    lines.append("")
    for axis, heading in AXES:
        values = [r["value"] for r in first if r["axis"] == axis]
        if not values or (len(values) == 1 and axis not in ("depth",)):
            continue
        lines += [f"### By {heading}", "", "| value | n | " + " | ".join(engines) + " | best constant |",
                  "|---|---|" + "---|" * (len(engines) + 1)]
        for value in values:
            cells, ns, floor = [], [], None
            for e, rows in engines.items():
                match = next((r for r in rows if r["axis"] == axis and r["value"] == value), None)
                cells.append(_cell(match) if match else "-")
                ns.append(match["n"] if match else 0)
                if match and floor is None:
                    floor = match["best_constant"]
            lines.append(f"| {value} | {_n(ns)} | " + " | ".join(cells) + f" | {_floor(floor)} |")
        lines.append("")
    lines += _retest_section(task, studies)
    lines += _latency_section(task, studies.parent)
    pairs = sorted(p for p in studies.glob(f"{task.slug}-*-vs-*.jsonl"))
    if pairs:
        lines += ["### Paired differences (same items; accuracy difference in points)", "",
                  "| comparison | slice | n | difference | 95% interval |", "|---|---|---|---|---|"]
        for path in pairs:
            for r in _rows(path):
                lines.append(f"| {r['engine_a']} minus {r['engine_b']} | {r['axis']}={r['value']} | {r['n']} | "
                             f"{100 * r['diff']:+.1f} | {100 * r['ci_low']:+.1f} to {100 * r['ci_high']:+.1f} |")
        lines.append("")
    return lines


def render(*, root: Path = ROOT) -> str:
    lines = ["# Results", "",
             "Generated by `hd report` from `studies/*.jsonl`; do not edit by hand. Each task is a sample "
             "of the ProofWriter test set built by `hd build` (see `tasks/*/build.json` for its parameters "
             "and strata).", ""]
    for slug in all_slugs(root):
        lines += task_section(Task.load(slug, root=root), Path(root) / "studies")
    return "\n".join(lines).rstrip() + "\n"


def write(*, root: Path = ROOT) -> Path:
    path = Path(root) / "RESULTS.md"
    path.write_text(render(root=root), encoding="utf-8")
    return path
