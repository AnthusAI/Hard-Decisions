"""``hd``: fetch | verify | build | list | answer | score | replay | report."""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
import urllib.request
import zipfile
from pathlib import Path
from typing import Dict, List, Optional

from hard_decisions import answering, proofwriter, report, sampling, scoring
from hard_decisions.record import append_manifest, engines_with_records, read_record, record_path
from hard_decisions.tasks import ROOT, Task, all_slugs

SEMANTICS_SLUG = {"OWA": "proofwriter-owa", "CWA": "proofwriter-cwa"}


def _archive(args) -> Path:
    return Path(args.archive) if args.archive else proofwriter.DEFAULT_ARCHIVE


def cmd_fetch(args) -> int:
    data = ROOT / ".data"
    target = _archive(args)
    if target.exists():
        print(f"already extracted: {target}")
        return 0
    if not args.confirm:
        print(f"would download {proofwriter.ARCHIVE_URL} (214 MB) into {data}; rerun with --confirm")
        return 0
    data.mkdir(exist_ok=True)
    zip_path = data / "proofwriter.zip"
    if not zip_path.exists():
        urllib.request.urlretrieve(proofwriter.ARCHIVE_URL, zip_path)
    digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    if digest != proofwriter.ARCHIVE_SHA256:
        print(f"checksum mismatch: {digest} != {proofwriter.ARCHIVE_SHA256}", file=sys.stderr)
        return 1
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(data)
    print(f"extracted {target}")
    return 0


def cmd_verify(args) -> int:
    """Recompute every gold label in the pool with the independent solver."""
    from hard_decisions.solver import solve_record_question
    checked = bad = 0
    for semantics in proofwriter.SEMANTICS:
        for config in proofwriter.CONFIGS:
            with open(proofwriter.config_path(_archive(args), semantics, config), encoding="utf-8") as handle:
                for line in handle:
                    record = json.loads(line)
                    for question in record["questions"].values():
                        checked += 1
                        if solve_record_question(semantics, record, question) != str(question["answer"]):
                            bad += 1
    print(f"{checked} questions checked, {bad} disagree with the solver")
    return 1 if bad else 0


def _weights(text: Optional[str]) -> Dict[int, float]:
    if not text:
        return {}
    return {int(k): float(v) for k, v in (pair.split("=") for pair in text.split(","))}


def cmd_build(args) -> int:
    semantics = [s.strip().upper() for s in args.semantics.split(",")]
    depths = [int(d) for d in args.depths.split(",")]
    for sem in semantics:
        items, manifest = sampling.build(_archive(args), sem, args.n, args.seed, depths=depths,
                                         weights=_weights(args.weights))
        task = Task.load(SEMANTICS_SLUG[sem])
        task.items_path.write_text("".join(json.dumps(i, ensure_ascii=False) + "\n" for i in items), encoding="utf-8")
        manifest["archive_sha256"] = proofwriter.ARCHIVE_SHA256
        (task.dir / "build.json").write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        short = [s for s in manifest["strata"] if s["selected"] < args.n // max(1, len(manifest["strata"]))]
        print(f"{task.slug}: {len(items)} items, {len(manifest['strata'])} strata"
              + (f"; {len(short)} strata under an even share" if short else ""))
    return 0


def cmd_list(args) -> int:
    print(f"{'task':20} {'items':>6}  engines with a record")
    for slug in all_slugs():
        task = Task.load(slug)
        n = len(task.load_items()) if task.items_path.exists() else 0
        print(f"{slug:20} {n:>6}  {', '.join(engines_with_records(slug)) or '-'}")
    return 0


KEV_URL = os.environ.get("HD_KEV_URL", "http://127.0.0.1:8009")
LOCAL_ENGINES = ("laya", "gliner-2.5-decide", "gliner-2.5-decide-labels-only")


def _engine(name: str):
    if name == "jev":
        from hard_decisions.engines.jev import JevEngine
        return JevEngine()
    if name == "laya":
        from hard_decisions.engines.laya import LayaEngine
        return LayaEngine()
    if name == "glide":
        from hard_decisions.engines.glide import GlideEngine
        return GlideEngine()
    if name in ("gliner-2.5-decide-hosted", "gliner-2.5-decide-hosted-labels-only"):
        from hard_decisions.engines.gliner_hosted import GlinerHostedEngine
        return GlinerHostedEngine(form="full" if name == "gliner-2.5-decide-hosted" else "labels")
    if name in ("gliner-2.5-decide", "gliner-2.5-decide-labels-only"):
        from hard_decisions.engines.gliner_decide import GlinerDecideEngine
        return GlinerDecideEngine(form="full" if name == "gliner-2.5-decide" else "labels")
    if name.startswith("kev"):
        from hard_decisions.engines.typesafe_compat import TypesafeCompatibleEngine
        return TypesafeCompatibleEngine(name, KEV_URL)
    if ":" in name:
        from hard_decisions.engines.llm import ChatClassifierEngine, spec_for
        vendor, model = name.split(":", 1)
        return ChatClassifierEngine(spec_for(vendor, model))
    raise SystemExit(f"unknown engine {name!r}; available: jev, glide, laya, gliner-2.5-decide[-labels-only], kev-<size>, <vendor>:<model>")


def _machine() -> dict:
    import platform
    info = {"platform": platform.platform(), "python": platform.python_version()}
    if sys.platform == "darwin":
        import subprocess
        for key, name in (("model", "hw.model"), ("cpu", "machdep.cpu.brand_string"), ("memory_bytes", "hw.memsize")):
            out = subprocess.run(["sysctl", "-n", name], capture_output=True, text=True).stdout.strip()
            info[key] = int(out) if key == "memory_bytes" and out.isdigit() else out
    return info


def _footprint(pid: int) -> Optional[dict]:
    """Current and peak physical footprint of a process (macOS ``footprint``), in MB. Unlike RSS this
    counts GPU (Metal) memory, which is where MLX and MPS keep model weights on Apple silicon."""
    import re
    import subprocess
    if sys.platform != "darwin":
        return None
    out = subprocess.run(["footprint", "-p", str(pid)], capture_output=True, text=True).stdout
    found = {}
    for key in ("phys_footprint", "phys_footprint_peak"):
        m = re.search(rf"^\s*{key}:\s*([\d.]+)\s*(KB|MB|GB)", out, re.M)
        if m:
            found[f"{key}_mb"] = round(float(m.group(1)) * {"KB": 1 / 1024, "MB": 1, "GB": 1024}[m.group(2)], 1)
    return {"pid": pid, **found} if found else None


def _engine_memory(engine_name: str) -> Optional[dict]:
    """Memory of the process holding the model: the Kev server for Kev, this process for in-process
    engines (Laya). Hosted engines have none to measure. The peak covers the process's whole life,
    including loading, so a server should be started fresh for the model being measured."""
    import subprocess
    if engine_name.startswith("kev"):
        port = KEV_URL.rsplit(":", 1)[-1].strip("/")
        pids = subprocess.run(["lsof", "-t", f"-iTCP:{port}", "-sTCP:LISTEN"], capture_output=True,
                              text=True).stdout.split()
        return _footprint(int(pids[0])) if pids else None
    if engine_name in LOCAL_ENGINES:
        return _footprint(os.getpid())
    return None


def _machine_load() -> dict:
    """Load average and the busiest other processes, so a run made on a busy machine is visible in
    its manifest. Command names only, no arguments."""
    import subprocess
    out = subprocess.run(["ps", "-Ao", "pid=,pcpu=,comm="], capture_output=True, text=True).stdout
    busy = []
    for line in out.splitlines():
        parts = line.split(None, 2)
        if len(parts) == 3 and parts[1].replace(".", "", 1).isdigit() and int(parts[0]) != os.getpid():
            if float(parts[1]) >= 25:
                busy.append({"pcpu": float(parts[1]), "command": parts[2].rsplit("/", 1)[-1]})
    return {"loadavg": [round(x, 2) for x in os.getloadavg()],
            "busy_processes": sorted(busy, key=lambda b: -b["pcpu"])[:8]}


def _code_version() -> dict:
    import subprocess
    run = lambda *a: subprocess.run(["git", "-C", str(ROOT), *a], capture_output=True, text=True).stdout.strip()  # noqa: E731
    return {"commit": run("rev-parse", "HEAD"), "dirty": bool(run("status", "--porcelain", "--untracked-files=no"))}


def cmd_answer(args) -> int:
    task = Task.load(args.task)
    items = task.load_items()
    engine = _engine(args.engine)
    path = record_path(engine.name, task.slug, tree="timing" if args.timing else "answers")
    todo = answering.pending(items, path, args.limit)
    texts = {i["id"]: i["text"] for i in items}
    print(f"{engine.name} on {task.slug}: {len(todo)} items still to answer ({len(items) - len(todo)} done or skipped)")
    if args.engine in answering.SYSTEM_ONE_RATES:
        rate = answering.SYSTEM_ONE_RATES[args.engine]
        print(f"price: {answering.estimate(task, todo, read_record(path), texts, rate=rate)}")
    elif ":" in args.engine:
        price = answering.estimate_llm(engine.spec, task, todo, read_record(path), texts)
        print(f"price: {price if price else 'unknown: add ' + engine.spec.model + ' to hard_decisions/pricing.py'}")
        if price is None and args.confirm:
            print("refusing: a paid engine must be priced before it runs", file=sys.stderr)
            return 2
    else:
        print("price: $0 (open weights, runs locally)")
    if not args.confirm:
        print("dry run: nothing run. Rerun with --confirm --max-requests N.")
        return 0
    if args.max_requests is None or len(todo) > args.max_requests:
        print(f"refusing: --max-requests must be given and at least {len(todo)}", file=sys.stderr)
        return 2
    started_at, load_at_start = answering.utc_now(), _machine_load()
    stats = asyncio.run(answering.run(engine, task, todo, path, concurrency=args.concurrency))
    append_manifest(path, {"engine": engine.name, "task": task.slug, "tree": path.parts[-3],
                           "started_at": started_at, "finished_at": answering.utc_now(),
                           "requested": len(todo), "answered": stats["answered"], "failed": stats["failed"],
                           "concurrency": args.concurrency, "machine": _machine(), "code": _code_version(),
                           "kev_url": KEV_URL if args.engine.startswith("kev") else None,
                           "memory": _engine_memory(engine.name),
                           "load": {"start": load_at_start, "end": _machine_load()}})
    print(f"answered {stats['answered']}, failed {stats['failed']} (rerun to retry failures)")
    return 0 if not stats["failed"] else 1


def cmd_score(args) -> int:
    task = Task.load(args.task)
    rows = scoring.score(args.engine, task)
    if not rows:
        print("no record rows to score")
        return 1
    path = scoring.study_path(task.slug, args.engine)
    scoring.write_rows(path, rows)
    overall = rows[0]
    print(f"{args.engine} on {task.slug}: {overall['correct']}/{overall['n']} = {100 * overall['accuracy']:.1f}%  -> {path}")
    return 0


def cmd_replay(args) -> int:
    from hard_decisions import agreement
    for slug in all_slugs():
        task = Task.load(slug)
        for path in scoring.replay(task):
            print(f"wrote {path.relative_to(ROOT)}")
        path = agreement.replay(task)
        if path:
            print(f"wrote {path.relative_to(ROOT)}")
    return 0


def cmd_report(args) -> int:
    print(f"wrote {report.write().relative_to(ROOT)}")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="hd")
    parser.add_argument("--archive", help="extracted ProofWriter archive (default .data/ or $HD_ARCHIVE)")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("fetch", help="download and checksum the pinned ProofWriter archive")
    p.add_argument("--confirm", action="store_true")
    p.set_defaults(func=cmd_fetch)
    sub.add_parser("verify", help="recompute every gold label in the pool").set_defaults(func=cmd_verify)
    p = sub.add_parser("build", help="sample items: n per semantics, difficulty-diverse, nested by seed")
    p.add_argument("--n", type=int, required=True, help="items per semantics task")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--semantics", default="OWA,CWA")
    p.add_argument("--depths", default="0,1,2,3,4,5")
    p.add_argument("--weights", help="depth=weight,... e.g. 4=2,5=2 to tilt toward hard depths")
    p.set_defaults(func=cmd_build)
    sub.add_parser("list").set_defaults(func=cmd_list)
    p = sub.add_parser("answer", help="price (default) or run an engine on a task")
    p.add_argument("engine")
    p.add_argument("task")
    p.add_argument("--limit", type=int)
    p.add_argument("--confirm", action="store_true")
    p.add_argument("--max-requests", type=int)
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--timing", action="store_true",
                   help="write to timing/ (a rerun for latency only; never scored) instead of answers/")
    p.set_defaults(func=cmd_answer)
    p = sub.add_parser("score")
    p.add_argument("engine")
    p.add_argument("task")
    p.set_defaults(func=cmd_score)
    sub.add_parser("replay", help="rescore every record offline").set_defaults(func=cmd_replay)
    sub.add_parser("report", help="regenerate RESULTS.md").set_defaults(func=cmd_report)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
