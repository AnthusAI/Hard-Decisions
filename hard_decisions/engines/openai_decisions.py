"""OpenAI's Decisions API (``POST /v1/decisions``, model ``gpt-6-luna``, generally available 2026-10-22).

The request is the System One question in OpenAI's own field names, with nothing added or dropped
(developers.openai.com/api/docs/guides/decisions, read 2026-11-16): the problem text is ``input``; the question is one
``choice`` question whose ``instructions`` are the question's instructions and whose ``choices`` are the options, each
with its description. OpenAI's answer carries the chosen value, a ``probabilities`` array and a separate ``confidence``;
the record stores them in the same shape as every other engine. The key comes from ``OPENAI_API_KEY`` in the
environment or the gitignored ``.env`` and is never passed as an argument, so it cannot end up in a log line.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, Mapping

from hard_decisions.engines.base import EngineAnswer

URL = "https://api.openai.com/v1/decisions"
MODEL = "gpt-6-luna"
KEY_ENV = "OPENAI_API_KEY"
RETRY_STATUS = (408, 409, 429, 500, 502, 503, 504)


def request_body(text: str, questions: Mapping[str, Mapping[str, Any]]) -> dict:
    return {"model": MODEL, "input": text,
            "questions": [{"type": "choice", "name": name, "instructions": q["instructions"],
                           "choices": [{"value": value, "description": description}
                                       for value, description in q["criteria"].items()]}
                          for name, q in questions.items()]}


def parse(body: Mapping[str, Any]) -> Dict[str, dict]:
    out = {}
    for answer in body["answers"]:
        probs = {p["value"]: p["probability"] for p in answer.get("probabilities") or []}
        out[answer["name"]] = {"type": "choice", "choice": answer["choice"], "confidence": answer.get("confidence"),
                               "probabilities": probs}
    return out


def _default_client():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:  # pragma: no cover
        pass
    if not os.environ.get(KEY_ENV):
        raise SystemExit(f"The Decisions API needs {KEY_ENV} in the environment or the gitignored .env")
    import httpx
    return httpx.AsyncClient(headers={"Authorization": f"Bearer {os.environ[KEY_ENV]}"}, timeout=120.0)


class OpenAIDecisionsEngine:
    name = "openai-decisions-gpt-6-luna"

    def __init__(self, client_factory=_default_client, retries: int = 6):
        self._client_factory = client_factory
        self._client = None
        self._retries = retries

    async def answer(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        if self._client is None:
            self._client = self._client_factory()
        body = request_body(text, questions)
        for attempt in range(self._retries + 1):
            response = await self._client.post(URL, json=body)
            if response.status_code not in RETRY_STATUS or attempt == self._retries:
                break
            await asyncio.sleep(min(30.0, 2.0 ** attempt))
        if response.status_code != 200:
            raise RuntimeError(f"Decisions API returned {response.status_code}: {response.text[:300]}")
        data = response.json()
        return EngineAnswer(answers=parse(data), model=data.get("model") or MODEL, usage=data.get("usage"))
