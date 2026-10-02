from types import SimpleNamespace

import pytest
import torch

from hard_decisions.engines import gliner_decide

QUESTION = {"Decision": {"type": "choice", "instructions": "Is the statement true, false, or unknown?",
                         "criteria": {"true": "It follows.", "false": "Its negation follows.", "unknown": "Neither follows."}}}


class FakeModel:
    def __init__(self, logits, label=None):
        self.calls, self._logits, self._label = [], torch.tensor(logits), label
        self._hooks = []
        self.classifier = SimpleNamespace(register_forward_hook=self._hooks.append)

    def classify_text(self, text, tasks, include_confidence):
        self.calls.append((text, tasks))
        for hook in self._hooks:
            hook(None, None, self._logits.unsqueeze(-1))
        probs = torch.softmax(self._logits, -1)
        best = int(torch.argmax(probs))
        return {"Decision": {"label": self._label or list(QUESTION["Decision"]["criteria"])[best], "confidence": float(probs[best])}}


def engine(model):
    return gliner_decide.GlinerDecideEngine(loader=lambda: (model, torch, "fake"))


async def test_request_is_the_hosted_form_task_and_labels_and_records_all_probabilities():
    model = FakeModel([0.1, 0.2, 2.0])
    result = await engine(model).answer("Bob is big.\n\nStatement: Bob is red.", QUESTION)
    text, tasks = model.calls[0]
    assert tasks == {"Decision": ["true", "false", "unknown"]}
    a = result.answers["Decision"]
    assert a["choice"] == "unknown" and set(a["probabilities"]) == {"true", "false", "unknown"}
    assert abs(sum(a["probabilities"].values()) - 1) < 1e-6 and result.usage is None


async def test_a_capture_that_disagrees_with_the_package_is_an_error():
    with pytest.raises(RuntimeError):
        await engine(FakeModel([0.1, 0.2, 2.0], label="true")).answer("x", QUESTION)
