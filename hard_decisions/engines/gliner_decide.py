"""GLiNER2.5-Decide (Fastino): the open 340M-parameter checkpoint, run locally through ``gliner2``.

The package is imported lazily and needs its local-inference extra (``pip install 'gliner2[local]'``);
it lives in its own environment, ``var/gliner-venv``. The model is loaded once, pinned to a Hub
revision, and answers one request at a time on Apple's GPU (MPS) when available (set
``GLINER_DEVICE`` to override). Open weights, so a run costs nothing but time.

Two request forms, both in the shape Fastino's hosted API accepts for this model (``/v1/chat/completions``:
the message text, plus ``classifications`` with a task name and its labels; the API rejects a ``prompt``):

- ``full`` (engine ``gliner-2.5-decide``): the message is the item text, then the question's instructions and
  every option with its description, word for word as GPT-6 Luna received them, without Luna's line about
  replying in JSON (this model answers by label). Task: the question's name; labels: the options. The model gets
  everything every other engine gets.
- ``labels`` (engine ``gliner-2.5-decide-labels-only``): the item text alone, which ends with the statement, with
  the same task and labels: the bare documented form.

A first run that passed the instructions as the package's ``prompt`` and the descriptions as described labels
collapsed to one answer per task and was withdrawn (preregistration, Amendment 8a). This local checkpoint gives
the hosted model's answers (21 of 21 identical, confidence within 0.01).
``classify_text`` returns only the winning label and its probability; a read-only forward hook on the
model's classifier layer captures the same logits the package softmaxes, so the record holds the
probability of every option. Every answer is checked to reproduce the package's own label and
confidence; a mismatch is an error, never a guess.
"""
from __future__ import annotations

import asyncio
import os
import warnings
from typing import Any, Mapping

from hard_decisions.engines.base import EngineAnswer

REPO = "fastino/GLiNER2.5-Decide"
REVISION = "5a7adf72a23b4d311abae6ce050d7f0012bb3416"   # Hub main as of 2026-10-02


def _load():
    try:
        import gliner2
        import torch
        from gliner2 import AutoExtractor
    except ImportError as error:  # pragma: no cover
        raise ImportError("GLiNER2.5-Decide needs gliner2 with its local extra: pip install 'gliner2[local]'") from error
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = AutoExtractor.from_pretrained(REPO, revision=REVISION)
    device = os.environ.get("GLINER_DEVICE") or ("mps" if torch.backends.mps.is_available() else "cpu")
    model.to(device)
    model.eval()
    return model, torch, f"{REPO}@{REVISION[:7]} gliner2-{gliner2.__version__} {device}"


def message(text: str, question: Mapping[str, Any], form: str) -> str:
    if form == "labels":
        return text
    options = "\n".join(f"- {name}: {description}" for name, description in question["criteria"].items())
    return f"{text}\n\n{question['instructions']}\n\nOptions:\n{options}"


class GlinerDecideEngine:
    def __init__(self, loader=_load, form: str = "full"):
        if form not in ("full", "labels"):
            raise ValueError(f"unknown form {form!r}")
        self.form = form
        self.name = "gliner-2.5-decide" if form == "full" else "gliner-2.5-decide-labels-only"
        self._loader = loader
        self._model = None
        self._torch = None
        self._label = None
        self._captured = []
        self._lock = asyncio.Lock()

    def _ensure(self):
        if self._model is None:
            self._model, self._torch, self._label = self._loader()
            self._model.classifier.register_forward_hook(
                lambda _module, _inputs, output: self._captured.append(output.detach().squeeze(-1).float().cpu()))

    def _answer_sync(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        self._ensure()
        answers = {}
        for name, q in questions.items():
            options = list(q["criteria"])
            tasks = {name: options}
            self._captured.clear()
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                result = self._model.classify_text(message(text, q, self.form), tasks, include_confidence=True)[name]
            if len(self._captured) != 1 or len(self._captured[0]) != len(options):
                raise RuntimeError(f"expected one classifier pass over {len(options)} options, got {len(self._captured)}")
            probs = dict(zip(options, self._torch.softmax(self._captured[0], -1).tolist()))
            best = max(probs, key=probs.get)
            if best != result["label"] or abs(probs[best] - result["confidence"]) > 1e-5:
                raise RuntimeError("captured probabilities do not reproduce the package's answer")
            answers[name] = {"type": "choice", "choice": result["label"], "confidence": result["confidence"],
                             "probabilities": probs}
        return EngineAnswer(answers=answers, model=self._label, usage=None)

    async def answer(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        async with self._lock:
            return await asyncio.to_thread(self._answer_sync, text, questions)
