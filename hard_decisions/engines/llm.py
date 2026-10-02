"""Hosted LLMs as classifiers: one request per item, the same text and typed question Jev gets.

The prompt is the item text followed by the question's instructions and each option with its
description, rendered from the same wire question every engine receives. The reply is constrained to
a JSON object ``{"answer": <option>}`` with a structured-output schema where the vendor supports it,
and parsed strictly either way: anything that is not exactly one of the options is recorded as an
invalid answer (``choice: null``), never retried into a valid one.

Each model runs at its lowest reasoning setting, so the arm is a direct-answer classifier. The
setting is part of the engine name, so changing it makes a new engine. Claude goes through the
``anthropic`` SDK; OpenAI models through the ``openai`` SDK. Keys come from the environment or a gitignored ``.env`` and are never
passed as arguments or logged. SDKs are imported lazily.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, Mapping, Optional, Sequence, Tuple

from hard_decisions.engines.base import EngineAnswer

ANSWER_KEY = "answer"


@dataclass(frozen=True)
class ModelSpec:
    """How one model is called. ``params`` go into every request unchanged."""
    vendor: str
    model: str
    setting: str
    params: Dict[str, Any] = field(default_factory=dict)
    structured: bool = True
    max_tokens: int = 1024

    @property
    def engine_name(self) -> str:
        return f"{self.vendor}-{self.model}-{self.setting}"


# Claude: Opus 5.5 always thinks and rejects temperature, so its floor is effort "low"; Sonnet 5.5's
# lowest setting is thinking "between_tools" (it also rejects a non-default temperature); Haiku 4.5
# runs without thinking at temperature 0. No refusal fallback: a fallback would answer with a
# different model under this engine's name, so a refusal is recorded as an invalid answer instead.
CLAUDE: Dict[str, ModelSpec] = {
    "claude-opus-5-5": ModelSpec("anthropic", "claude-opus-5-5", "effort-low",
                                 {"output_config": {"effort": "low"}}, max_tokens=4096),
    "claude-sonnet-5-5": ModelSpec("anthropic", "claude-sonnet-5-5", "no-thinking",
                                   {"thinking": {"type": "between_tools"}}),
    "claude-haiku-4-5": ModelSpec("anthropic", "claude-haiku-4-5", "t0", {"temperature": 0}),
}


# OpenAI: GPT-6 Luna's lowest reasoning setting is "none" (OpenAI model page, 2026-10-01).
OPENAI: Dict[str, ModelSpec] = {
    "gpt-6-luna": ModelSpec("openai", "gpt-6-luna", "effort-none", {"reasoning_effort": "none"}),
}

SPECS: Dict[str, Dict[str, ModelSpec]] = {"anthropic": CLAUDE, "openai": OPENAI}


def spec_for(vendor: str, model: str) -> ModelSpec:
    """Only models with settings written down here can run; nothing is guessed."""
    if vendor not in SPECS:
        raise SystemExit(f"unknown vendor {vendor!r}; available: {', '.join(SPECS)}")
    if model not in SPECS[vendor]:
        raise SystemExit(f"no request settings for {vendor}:{model}; known: {', '.join(SPECS[vendor])}")
    return SPECS[vendor][model]


def render_prompt(text: str, question: Mapping[str, Any]) -> str:
    options = "\n".join(f"- {name}: {description}" for name, description in question["criteria"].items())
    names = ", ".join(question["criteria"])
    return (f"{text}\n\n{question['instructions']}\n\nOptions:\n{options}\n\n"
            f"Reply with a JSON object {{\"{ANSWER_KEY}\": <option>}} where <option> is exactly one of: {names}.")


def answer_schema(options: Sequence[str]) -> dict:
    return {"type": "object", "properties": {ANSWER_KEY: {"type": "string", "enum": list(options)}},
            "required": [ANSWER_KEY], "additionalProperties": False}


def parse_choice(reply: Optional[str], options: Sequence[str]) -> Optional[str]:
    """The chosen option, or None unless the reply is a JSON object naming exactly one option.
    A Markdown code fence around the object is tolerated; nothing else is."""
    if not reply:
        return None
    body = reply.strip()
    if body.startswith("```"):
        body = body.strip("`").removeprefix("json").strip()
    try:
        value = json.loads(body)
    except ValueError:
        return None
    choice = value.get(ANSWER_KEY) if isinstance(value, dict) else None
    return choice if isinstance(choice, str) and choice in options else None


def _single_question(questions: Mapping[str, Mapping[str, Any]]) -> Tuple[str, Mapping[str, Any]]:
    if len(questions) != 1:
        raise ValueError("the LLM engine answers exactly one question per request")
    return next(iter(questions.items()))


class ChatClassifierEngine:
    def __init__(self, spec: ModelSpec, client_factory=None):
        self.spec = spec
        self.name = spec.engine_name
        self._client_factory = client_factory
        self._client = None

    def __repr__(self) -> str:
        return f"ChatClassifierEngine({self.name})"

    def _build_client(self):
        if self._client_factory is not None:
            return self._client_factory()
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:  # pragma: no cover
            pass
        if self.spec.vendor == "anthropic":
            try:
                from anthropic import AsyncAnthropic
            except ImportError as error:  # pragma: no cover
                raise ImportError("Claude engines need: pip install 'hard-decisions[llm]'") from error
            return AsyncAnthropic(max_retries=6)
        try:
            from openai import AsyncOpenAI
        except ImportError as error:  # pragma: no cover
            raise ImportError("OpenAI engines need: pip install 'hard-decisions[llm]'") from error
        return AsyncOpenAI(max_retries=6)

    async def answer(self, text: str, questions: Mapping[str, Mapping[str, Any]]) -> EngineAnswer:
        if self._client is None:
            self._client = self._build_client()
        name, question = _single_question(questions)
        options = list(question["criteria"])
        prompt = render_prompt(text, question)
        if self.spec.vendor == "anthropic":
            reply, model, usage = await self._claude(prompt, options)
        else:
            reply, model, usage = await self._openai(prompt, options)
        choice = parse_choice(reply, options)
        return EngineAnswer(answers={name: {"type": "choice", "choice": choice, "raw": None if choice else reply}},
                            model=model or self.spec.model, usage=usage)

    async def _claude(self, prompt: str, options: Sequence[str]):
        params = dict(self.spec.params)
        output_config = dict(params.pop("output_config", {}))
        if self.spec.structured:
            output_config["format"] = {"type": "json_schema", "schema": answer_schema(options)}
        if output_config:
            params["output_config"] = output_config
        response = await self._client.messages.create(
            model=self.spec.model, max_tokens=self.spec.max_tokens,
            messages=[{"role": "user", "content": prompt}], **params)
        reply = None if response.stop_reason == "refusal" else next(
            (block.text for block in response.content if block.type == "text"), None)
        usage = {"input_tokens": response.usage.input_tokens, "output_tokens": response.usage.output_tokens,
                 "stop_reason": response.stop_reason}
        return reply, response.model, usage

    async def _openai(self, prompt: str, options: Sequence[str]):
        params = dict(self.spec.params)
        if self.spec.structured:
            params["response_format"] = {"type": "json_schema", "json_schema": {
                "name": "decision", "strict": True, "schema": answer_schema(options)}}
        response = await self._client.chat.completions.create(
            model=self.spec.model, max_completion_tokens=self.spec.max_tokens,
            messages=[{"role": "user", "content": prompt}], **params)
        choice = response.choices[0]
        reply = choice.message.content
        usage = {"input_tokens": response.usage.prompt_tokens, "output_tokens": response.usage.completion_tokens,
                 "stop_reason": choice.finish_reason} if response.usage else None
        return reply, response.model, usage
