"""Reading the ProofWriter archive (V2020.12.3) into benchmark items.

One benchmark item is one ProofWriter *question*: the theory (facts and rules) plus one statement.
Item metadata carries every parameter the results are broken down by. ``depth`` -- the proof depth
ProofWriter records for the question -- is the primary difficulty axis.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Sequence, Tuple

from hard_decisions.solver import parse_atom, solve_record_question

ARCHIVE_NAME = "proofwriter-dataset-V2020.12.3"
ARCHIVE_URL = "https://aristo-data-public.s3.amazonaws.com/proofwriter/proofwriter-dataset-V2020.12.3.zip"
ARCHIVE_SHA256 = "bbc5694901e8306d0bd659aa1ad53ccfd02c201864f4b320ffa3777827d1fc26"

SEMANTICS = ("OWA", "CWA")
CONFIGS = ("depth-0", "depth-1", "depth-2", "depth-3", "depth-5", "NatLang")
MAX_DEPTH = 5
LABELS = {"OWA": ("true", "false", "unknown"), "CWA": ("true", "false")}

# Fixed bin edges (inclusive lower bound of each bin) for the numeric secondary axes.
BINS = {
    "theory_words": (0, 50, 80, 110),
    "n_rules": (0, 3, 6, 8),
    "n_facts": (0, 4, 8, 13),
    "proof_size": (0, 2, 3, 5),
}

DEFAULT_ARCHIVE = Path(os.environ.get("HD_ARCHIVE", Path(__file__).resolve().parents[1] / ".data" / ARCHIVE_NAME))


def bin_label(axis: str, value: int) -> str:
    edges = BINS[axis]
    index = max(i for i, edge in enumerate(edges) if value >= edge)
    low = edges[index]
    if index + 1 < len(edges):
        high = edges[index + 1] - 1
        return f"{low}" if low == high else f"{low}-{high}"
    return f"{low}+"


@dataclass(frozen=True)
class Candidate:
    """A question in the pool, without its text: enough to stratify and rank it."""

    id: str
    semantics: str
    config: str
    line: int
    qid: str
    label: str
    depth: int
    metadata: Dict[str, object]

    @property
    def stratum(self) -> Tuple[str, int, str]:
        return (self.semantics, self.depth, self.label)


def theory_kind(theory_id: str) -> Tuple[str, str]:
    """(attribute|relation, negation|no-negation) from ProofWriter's theory-id prefix."""
    prefix = theory_id.split("-")[0].replace("NatLang", "")
    kind = "relation" if prefix.startswith("Rel") else "attribute"
    negation = "negation" if prefix.endswith("Neg") else "no-negation"
    return kind, negation


def _as_int(value) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def candidate_for(record: Dict, qid: str, question: Dict, semantics: str, config: str,
                  line: int) -> Optional[Candidate]:
    depth = _as_int(question.get("QDep"))
    if depth is None or depth > MAX_DEPTH:
        return None
    kind, negation = theory_kind(record["id"])
    words = len(record["theory"].split())
    proof_size = _as_int(question.get("QLen")) or 0
    label = str(question["answer"]).lower()
    metadata = {
        "split": "test",
        "semantics": semantics,
        "config": config,
        "reference_label": label,
        "depth": depth,
        "theory_max_depth": _as_int(record.get("maxD")),
        "theory_kind": kind,
        "theory_negation": negation,
        "statement_negated": parse_atom(question["representation"])[3] == "-",
        "strategy": question.get("strategy"),
        "paraphrased": config == "NatLang",
        "n_facts": _as_int(record["NFact"]),
        "n_rules": _as_int(record["NRule"]),
        "theory_words": words,
        "proof_size": proof_size,
        "facts_bin": bin_label("n_facts", _as_int(record["NFact"]) or 0),
        "rules_bin": bin_label("n_rules", _as_int(record["NRule"]) or 0),
        "words_bin": bin_label("theory_words", words),
        "proof_size_bin": bin_label("proof_size", proof_size),
    }
    return Candidate(id=f"{record['id']}-{qid}", semantics=semantics, config=config, line=line,
                     qid=qid, label=label, depth=depth, metadata=metadata)


def config_path(archive: Path, semantics: str, config: str) -> Path:
    return Path(archive) / semantics / config / "meta-test.jsonl"


def iter_pool(archive: Path, semantics: str, configs: Sequence[str] = CONFIGS) -> Iterator[Candidate]:
    for config in configs:
        with open(config_path(archive, semantics, config), encoding="utf-8") as handle:
            for line_number, line in enumerate(handle):
                record = json.loads(line)
                for qid, question in record["questions"].items():
                    candidate = candidate_for(record, qid, question, semantics, config, line_number)
                    if candidate is not None:
                        yield candidate


STATEMENT_RE = re.compile(r"\s+")


def render_text(record: Dict, question: Dict) -> str:
    """The text every engine sees: the theory, then the statement to judge."""
    return f"{record['theory'].strip()}\n\nStatement: {STATEMENT_RE.sub(' ', question['question']).strip()}"


def materialize(archive: Path, candidates: Sequence[Candidate]) -> List[Dict]:
    """Items (``{id, text, metadata}``) for ``candidates``, in the order given. Every label is
    recomputed with the independent solver; a disagreement raises ``LabelMismatch``."""
    wanted: Dict[Tuple[str, str], Dict[int, List[Candidate]]] = {}
    for candidate in candidates:
        wanted.setdefault((candidate.semantics, candidate.config), {}).setdefault(candidate.line, []).append(candidate)
    built: Dict[str, Dict] = {}
    for (semantics, config), lines in wanted.items():
        with open(config_path(archive, semantics, config), encoding="utf-8") as handle:
            for line_number, line in enumerate(handle):
                if line_number not in lines:
                    continue
                record = json.loads(line)
                for candidate in lines[line_number]:
                    question = record["questions"][candidate.qid]
                    solved = solve_record_question(semantics, record, question).lower()
                    if solved != candidate.label:
                        raise LabelMismatch(
                            f"{candidate.id}: published {candidate.label!r}, solver says {solved!r}")
                    built[candidate.id] = {"id": candidate.id, "text": render_text(record, question),
                                           "metadata": dict(candidate.metadata)}
    return [built[candidate.id] for candidate in candidates]


class LabelMismatch(RuntimeError):
    """A published ProofWriter label disagrees with the independent solver."""
