"""Jev (TypeSafe's hosted decision model) through ``typesafe-sdk``.

One request per item carries the text and the question. The key comes from the environment
(``TYPESAFE_API_KEY``, optionally loaded from a gitignored ``.env``); it is never passed as an
argument, so it cannot end up in a log line. The SDK is imported lazily, so importing this module
never requires it.
"""
from __future__ import annotations

from typing import Any, Dict, Mapping

from hard_decisions.engines.base import EngineAnswer


def _default_client():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:  # pragma: no cover
        pass
    try:
        from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy
    except ImportError as error:  # pragma: no cover
        raise ImportError("Calling Jev needs typesafe-sdk: pip install 'hard-decisions[jev]'") from error
    return AsyncTypeSafeClient(retry=RetryPolicy(max_retries=6, backoff_max=30.0))


def _as_dict(value: Any) -> dict:
    return value.model_dump() if hasattr(value, "model_dump") else dict(value)


class JevEngine:
    name = "jev"

    def __init__(self, client_factory=_default_client):
        self._client_factory = client_factory
        self._client = None

    async def answer(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        if self._client is None:
            self._client = self._client_factory()
        response = await self._client.system_one(state={"text": text}, questions=dict(questions))
        usage = _as_dict(response.usage) if getattr(response, "usage", None) else None
        answers: Dict[str, dict] = {name: _as_dict(answer) for name, answer in (response.answers or {}).items()}
        return EngineAnswer(answers=answers, model=getattr(response, "model", None), usage=usage)
