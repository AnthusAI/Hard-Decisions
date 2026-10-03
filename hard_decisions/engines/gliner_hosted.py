"""GLiNER2.5-Decide through Fastino's hosted API (``POST /v1/chat/completions``), as Fastino serves it.

The same two request forms as the local engine (``gliner_decide.message``): ``full`` puts the question's
instructions and every option's meaning in the message after the problem; ``labels`` sends the problem alone. Both
send the options as the task's labels, single-label. The hosted API returns only the chosen label and its
confidence (``top_k`` does not apply to single-label tasks), so the record holds that one probability. The key comes
from ``FASTINO_API_KEY`` in the environment or the gitignored ``.env``; it is never passed as an argument.
"""
from __future__ import annotations

import json
import os
from typing import Any, Mapping

from hard_decisions.engines.base import EngineAnswer
from hard_decisions.engines.gliner_decide import message

URL = "https://api.fastino.ai/v1/chat/completions"
MODEL = "fastino/GLiNER-2.5-Decide"


def request_body(text: str, name: str, q: Mapping[str, Any], form: str) -> dict:
    return {"model": MODEL, "messages": [{"role": "user", "content": message(text, q, form)}],
            "schema": {"classifications": [{"task": name, "labels": list(q["criteria"]), "multi_label": False}]},
            "include_confidence": True}


def _default_client():
    import httpx
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    except ImportError:  # pragma: no cover
        pass
    if not os.environ.get("FASTINO_API_KEY"):
        raise SystemExit("hosted GLiNER2.5-Decide needs FASTINO_API_KEY in the environment or the gitignored .env")
    return httpx.AsyncClient(timeout=120, headers={"Authorization": "Bearer " + os.environ["FASTINO_API_KEY"]})


class GlinerHostedEngine:
    def __init__(self, form: str = "full", client_factory=_default_client):
        if form not in ("full", "labels"):
            raise ValueError(f"unknown form {form!r}")
        self.form = form
        self.name = "gliner-2.5-decide-hosted" if form == "full" else "gliner-2.5-decide-hosted-labels-only"
        self._client_factory = client_factory
        self._client = None

    async def answer(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        if self._client is None:
            self._client = self._client_factory()
        answers, usage, model = {}, {"input_tokens": 0, "output_tokens": 0}, MODEL
        for name, q in questions.items():
            for attempt in range(4):
                r = await self._client.post(URL, json=request_body(text, name, q, self.form))
                if r.status_code < 500 and r.status_code != 429:
                    break
            r.raise_for_status()
            j = r.json()
            model = j.get("model", MODEL)
            result = json.loads(j["choices"][0]["message"]["content"])[name]
            choice = result["label"] if result.get("label") in q["criteria"] else None
            answers[name] = {"type": "choice", "choice": choice, "confidence": result.get("confidence"),
                             "probabilities": {choice: result.get("confidence")} if choice else None,
                             **({} if choice else {"raw": result})}
            u = j.get("usage") or {}
            usage["input_tokens"] += u.get("prompt_tokens") or 0
            usage["output_tokens"] += u.get("completion_tokens") or 0
        return EngineAnswer(answers=answers, model=model, usage=usage)
