from types import SimpleNamespace

import pytest

from hard_decisions.engines import llm

QUESTION = {"Decision": {"type": "choice", "instructions": "Is the statement true, false, or unknown?",
                         "criteria": {"true": "It follows.", "false": "Its negation follows.",
                                      "unknown": "Neither follows."}}}


class FakeOpenAI:
    def __init__(self, reply, finish="stop"):
        self.calls = []
        self._reply, self._finish = reply, finish
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            model="gpt-6-luna-2026-09-22",
            choices=[SimpleNamespace(message=SimpleNamespace(content=self._reply), finish_reason=self._finish)],
            usage=SimpleNamespace(prompt_tokens=321, completion_tokens=7))


def engine(reply, **kw):
    fake = FakeOpenAI(reply, **kw)
    return llm.ChatClassifierEngine(llm.spec_for("openai", "gpt-6-luna"), client_factory=lambda: fake), fake


async def test_luna_request_shape_and_answer():
    eng, fake = engine('{"answer": "unknown"}')
    result = await eng.answer("Bob is big.\n\nStatement: Bob is red.", QUESTION)
    call = fake.calls[0]
    assert eng.name == "openai-gpt-6-luna-effort-none"
    assert call["model"] == "gpt-6-luna" and call["reasoning_effort"] == "none"
    assert call["response_format"]["json_schema"]["schema"]["properties"]["answer"]["enum"] == ["true", "false", "unknown"]
    prompt = call["messages"][0]["content"]
    assert prompt.startswith("Bob is big.\n\nStatement: Bob is red.") and "- unknown: Neither follows." in prompt
    assert result.answers["Decision"] == {"type": "choice", "choice": "unknown", "raw": None}
    assert result.model == "gpt-6-luna-2026-09-22"
    assert result.usage == {"input_tokens": 321, "output_tokens": 7, "stop_reason": "stop"}


@pytest.mark.parametrize("reply", ["unknown", '{"answer": "maybe"}', '{"answer": "true", }', "", None, '["true"]'])
async def test_anything_but_one_option_is_invalid_and_kept_raw(reply):
    eng, _ = engine(reply)
    answer = (await eng.answer("x", QUESTION)).answers["Decision"]
    assert answer["choice"] is None and answer["raw"] == reply


def test_fenced_json_is_accepted():
    assert llm.parse_choice('```json\n{"answer": "false"}\n```', ["true", "false"]) == "false"


def test_unknown_models_are_refused_not_guessed():
    with pytest.raises(SystemExit):
        llm.spec_for("openai", "gpt-6-sol")
    with pytest.raises(SystemExit):
        llm.spec_for("gemini", "anything")


def test_repr_carries_no_secret(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real-123")
    eng, _ = engine("{}")
    assert "sk-test" not in repr(eng) and "sk-test" not in str(vars(eng))
