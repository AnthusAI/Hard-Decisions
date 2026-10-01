"""A task: one semantics' items, its single choice question and its ordered options."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import yaml

ROOT = Path(__file__).resolve().parents[1]
QUESTION_NAME = "Decision"

# Axes every result is broken down by, in report order: (metadata key, heading).
AXES: Tuple[Tuple[str, str], ...] = (
    ("depth", "proof depth (difficulty)"),
    ("reference_label", "gold label"),
    ("theory_kind", "theory kind"),
    ("theory_negation", "negation in theory"),
    ("statement_negated", "negated statement"),
    ("strategy", "question strategy"),
    ("paraphrased", "paraphrased rules"),
    ("theory_max_depth", "theory max depth"),
    ("words_bin", "theory length (words)"),
    ("rules_bin", "rules in theory"),
    ("facts_bin", "facts in theory"),
    ("proof_size_bin", "proof size"),
)


@dataclass(frozen=True)
class Task:
    slug: str
    semantics: str
    question: str
    options: Tuple[str, ...]
    descriptions: Dict[str, str]
    root: Path = ROOT

    @classmethod
    def load(cls, slug: str, *, root: Path = ROOT) -> "Task":
        data = yaml.safe_load((Path(root) / "tasks" / slug / "question.yaml").read_text(encoding="utf-8"))
        options = tuple(data["options"])
        return cls(slug=slug, semantics=data["semantics"], question=data["question"], options=options,
                   descriptions={o: data["descriptions"][o] for o in options}, root=Path(root))

    @property
    def dir(self) -> Path:
        return self.root / "tasks" / self.slug

    @property
    def items_path(self) -> Path:
        return self.dir / "items.jsonl"

    def criteria(self) -> Dict[str, str]:
        """The wire ``criteria``: each option, in order, mapped to its description."""
        return {option: self.descriptions[option] for option in self.options}

    def wire_questions(self) -> Dict[str, dict]:
        return {QUESTION_NAME: {"type": "choice", "instructions": self.question,
                                "criteria": self.criteria()}}

    def load_items(self) -> List[dict]:
        with open(self.items_path, encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]


def all_slugs(root: Path = ROOT) -> List[str]:
    return sorted(p.name for p in (Path(root) / "tasks").glob("proofwriter-*") if (p / "question.yaml").exists())
