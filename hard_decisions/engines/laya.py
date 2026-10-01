"""Laya (Convai Innovations): the upstream package as released, PyTorch on MPS or CPU.

The package is imported lazily, so importing this module never requires it. The model is loaded
once and answers one request at a time; ``laya.load()`` picks the device (set ``LAYA_DEVICE`` to
override). Open weights, so a run costs nothing but time.
"""
from __future__ import annotations

import asyncio
import warnings
from typing import Any, Mapping

from hard_decisions.engines.base import EngineAnswer


def _load():
    try:
        import laya
    except ImportError as error:  # pragma: no cover
        raise ImportError("Running Laya needs the 'laya' package (pip install laya)") from error
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return laya, laya.load()


class LayaEngine:
    name = "laya"

    def __init__(self, loader=_load):
        self._loader = loader
        self._model = None
        self._version = "unknown"
        self._lock = asyncio.Lock()

    def _answer_sync(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        if self._model is None:
            module, self._model = self._loader()
            self._version = getattr(module, "__version__", "unknown")
        result = self._model.system_one(state=text, questions=dict(questions))
        return EngineAnswer(answers=dict(result["answers"]), model=f"laya-upstream:{self._version}",
                            usage=result.get("usage"))

    async def answer(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        async with self._lock:
            return await asyncio.to_thread(self._answer_sync, text, questions)
