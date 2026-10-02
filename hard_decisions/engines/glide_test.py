from types import SimpleNamespace

from hard_decisions.engines import glide

QUESTION = {"Decision": {"type": "choice", "instructions": "Is the statement true, false, or unknown?",
                         "criteria": {"true": "It follows.", "false": "Its negation follows.",
                                      "unknown": "Neither follows."}}}


class FakeSystemOne:
    def __init__(self):
        self.calls = []

    async def system_one(self, **kwargs):
        self.calls.append(kwargs)
        answer = {"type": "choice", "choice": "unknown", "confidence": 0.8,
                  "probabilities": {"true": 0.05, "false": 0.05, "unknown": 0.9}}
        return SimpleNamespace(model="glide", answers={"Decision": answer},
                               usage=SimpleNamespace(model_dump=lambda: {"input_tokens": 300, "output_tokens": 1}))


async def test_glide_sends_jevs_request_to_fastino_model():
    fake = FakeSystemOne()
    eng = glide.GlideEngine(client_factory=lambda: fake)
    result = await eng.answer("Bob is big.\n\nStatement: Bob is red.", QUESTION)
    assert eng.name == "glide"
    assert fake.calls == [{"state": {"text": "Bob is big.\n\nStatement: Bob is red."}, "questions": QUESTION,
                           "model": "fastino/GLiDE"}]
    assert result.model == "glide" and result.usage == {"input_tokens": 300, "output_tokens": 1}
    assert result.answers["Decision"]["choice"] == "unknown"


def test_missing_key_refuses_without_echoing(monkeypatch):
    monkeypatch.delenv(glide.KEY_ENV, raising=False)
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: False)
    try:
        glide._default_client()
    except SystemExit as stop:
        assert glide.KEY_ENV in str(stop)
    else:
        raise AssertionError("expected a refusal")
