"""The protocol every engine adapter implements.

An engine answers one typed choice question about one text. It returns the answer body in the
record's own shape (``{"type", "choice", "confidence", "probabilities"}`` under the question name)
plus the model version and token usage, so a record row carries everything scoring and pricing need.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional, Protocol, runtime_checkable


@dataclass(frozen=True)
class EngineAnswer:
    answers: Dict[str, dict]
    model: Optional[str] = None
    usage: Optional[dict] = None


@runtime_checkable
class Engine(Protocol):
    name: str

    async def answer(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        ...
