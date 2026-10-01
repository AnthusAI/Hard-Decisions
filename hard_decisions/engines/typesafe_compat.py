"""Any server that implements TypeSafe's ``/v1/systemone`` contract (Kev, for one), reached through
``typesafe-sdk`` with an explicit ``base_url``.

The Jev key is deliberately never used here: the client is built with a placeholder key, so a local
server can never receive a hosted-service credential.
"""
from __future__ import annotations

from typing import Any, Dict, Mapping

from hard_decisions.engines.base import EngineAnswer


class TypesafeCompatibleEngine:
    def __init__(self, name: str, base_url: str, client_factory=None):
        self.name = name
        self._base_url = base_url
        self._client_factory = client_factory
        self._client = None

    def _build_client(self):
        if self._client_factory is not None:
            return self._client_factory()
        try:
            from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy
        except ImportError as error:  # pragma: no cover
            raise ImportError("needs typesafe-sdk: pip install 'hard-decisions[jev]'") from error
        return AsyncTypeSafeClient(base_url=self._base_url, api_key="local-not-a-secret",
                                   retry=RetryPolicy(max_retries=3, backoff_max=5.0), timeout=300.0)

    async def answer(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        if self._client is None:
            self._client = self._build_client()
        response = await self._client.system_one(state={"text": text}, questions=dict(questions))
        dump = lambda v: v.model_dump() if hasattr(v, "model_dump") else dict(v)  # noqa: E731
        usage = dump(response.usage) if getattr(response, "usage", None) else None
        answers: Dict[str, dict] = {n: dump(a) for n, a in (response.answers or {}).items()}
        return EngineAnswer(answers=answers, model=getattr(response, "model", None) or self.name, usage=usage)
