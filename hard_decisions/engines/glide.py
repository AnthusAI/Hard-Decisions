"""GLiDE (Fastino's hosted decision model) through ``typesafe-sdk``.

Fastino serves GLiDE on the same ``/v1/systemone`` contract as Jev (``state`` plus named, typed
``questions`` in; ``answers`` and ``usage`` out), so the request is byte-for-byte the one Jev gets,
sent to Fastino's base URL with model ``fastino/GLiDE`` (docs.fastino.ai/inference/systemone, read
2026-10-02). The key comes from the environment (``FASTINO_API_KEY``, optionally loaded from a
gitignored ``.env``); it is never passed as an argument, so it cannot end up in a log line.
"""
from __future__ import annotations

import os
from typing import Any, Dict, Mapping

from hard_decisions.engines.base import EngineAnswer

BASE_URL = "https://api.fastino.ai"
MODEL = "fastino/GLiDE"
KEY_ENV = "FASTINO_API_KEY"


def _default_client():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:  # pragma: no cover
        pass
    if not os.environ.get(KEY_ENV):
        raise SystemExit(f"GLiDE needs {KEY_ENV} in the environment or the gitignored .env")
    try:
        from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy
    except ImportError as error:  # pragma: no cover
        raise ImportError("Calling GLiDE needs typesafe-sdk: pip install 'hard-decisions[jev]'") from error
    return AsyncTypeSafeClient(base_url=BASE_URL, api_key=os.environ[KEY_ENV],
                               retry=RetryPolicy(max_retries=6, backoff_max=30.0), timeout=300.0)


def _as_dict(value: Any) -> dict:
    return value.model_dump() if hasattr(value, "model_dump") else dict(value)


class GlideEngine:
    name = "glide"

    def __init__(self, client_factory=_default_client):
        self._client_factory = client_factory
        self._client = None

    async def answer(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        if self._client is None:
            self._client = self._client_factory()
        response = await self._client.system_one(state={"text": text}, questions=dict(questions), model=MODEL)
        usage = _as_dict(response.usage) if getattr(response, "usage", None) else None
        answers: Dict[str, dict] = {name: _as_dict(answer) for name, answer in (response.answers or {}).items()}
        return EngineAnswer(answers=answers, model=getattr(response, "model", None), usage=usage)
