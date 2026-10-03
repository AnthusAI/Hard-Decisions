"""Exactly what each model was sent and what came back, for one problem per task. Writes
studies/request-examples.json for the site; offline, no requests.

Each request is rebuilt with the harness's own code (the same functions the engines call), so it is the
request that was sent, field for field; keys and auth headers are left out. Each response is the saved answer
record for that problem from the scored run. The problems are fixed by a rule, not picked for their answers: per
task, the shortest templated (not paraphrased) problem at depth 0 and the shortest at depth 3.

    python tools/request_examples.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hard_decisions.engines.gliner_decide import REPO as GLINER_REPO, REVISION as GLINER_REV, message  # noqa: E402
from hard_decisions.engines.glide import BASE_URL as GLIDE_URL, MODEL as GLIDE_MODEL  # noqa: E402
from hard_decisions.engines.llm import answer_schema, render_prompt, spec_for  # noqa: E402
from hard_decisions.record import read_by_id, record_path  # noqa: E402
from hard_decisions.tasks import QUESTION_NAME, Task  # noqa: E402

KEV_URL = "http://127.0.0.1:8009"
DEPTHS = (0, 3)


def requests_for(text, q):
    wire = {QUESTION_NAME: q}
    system_one = lambda url, model: {"how": "HTTP", "method": "POST", "url": f"{url}/v1/systemone",  # noqa: E731
                                     "body": {"model": model, "state": {"text": text}, "questions": wire}}
    luna = spec_for("openai", "gpt-6-luna")
    options = list(q["criteria"])
    return {
        "jev": {**system_one("https://api.typesafe.ai", "jev-latest"),
                "note": "Through TypeSafe's typesafe-sdk; jev-latest is the SDK's default model name."},
        "glide": {**system_one(GLIDE_URL, GLIDE_MODEL),
                  "note": "Fastino serves GLiDE on the same System One format as Jev, so this is Jev's request with a different address and model name."},
        "glide-rerun-2026-10-03": {**system_one(GLIDE_URL, GLIDE_MODEL),
                  "note": "The same request as GLiDE's first run, sent again on October 3 at Fastino's request."},
        "openai-gpt-6-luna-effort-none": {
            "how": "HTTP", "method": "POST", "url": "https://api.openai.com/v1/chat/completions",
            "body": {"model": luna.model, "max_completion_tokens": luna.max_tokens, **luna.params,
                     "messages": [{"role": "user", "content": render_prompt(text, q)}],
                     "response_format": {"type": "json_schema", "json_schema": {"name": "decision", "strict": True,
                                                                                "schema": answer_schema(options)}}},
            "note": "GPT-6 Luna with reasoning off (reasoning_effort none, its lowest setting), as a direct classifier. One chat message carries the problem, the question and every option with its meaning; the strict JSON schema only allows one of the options as the answer."},
        **{k: {**system_one(KEV_URL, "kev-latest"),
               "note": f"Kev's own server running {k.replace('kev-', 'Kev-').replace('b', 'B')} on our laptop, answering Jev's System One format."}
           for k in ("kev-9b", "kev-4b", "kev-0.8b")},
        "laya": {"how": "Python", "call": "laya.load().system_one(state, questions)",
                 "body": {"state": text, "questions": wire},
                 "note": "The laya package on our laptop; it takes the same questions as Jev, with the problem as the state."},
        "gliner-2.5-decide": {"how": "Python", "call": f"AutoExtractor.from_pretrained(\"{GLINER_REPO}\").classify_text(text, tasks, include_confidence=True)",
                              "body": {"text": message(text, q, "full"), "tasks": {QUESTION_NAME: options}},
                              "note": "Fastino's hosted API for this model accepts a text and a list of answer labels, with no field for a question or for what each label means (the open-source package also accepts a short question as a prompt and a description per label; passed that way, our instructions made the model give the same answer to every problem). So the question and every option's meaning go into the text, after the problem, word for word as GPT-6 Luna received them, without Luna's line about replying in JSON. The labels are the three answers."},
        "gliner-2.5-decide-labels-only": {"how": "Python", "call": f"AutoExtractor.from_pretrained(\"{GLINER_REPO}\").classify_text(text, tasks, include_confidence=True)",
                                          "body": {"text": message(text, q, "labels"), "tasks": {QUESTION_NAME: options}},
                                          "note": "The same model, asked without the instructions: the text is only the problem (the facts and rules, then the statement), and the labels are the three answers. Nothing tells the model what true, false or unknown mean. This is the bare form Fastino's hosted API documents."},
    }


def main():
    out = {"selection": __doc__.split("\n\n")[1].replace("\n", " "), "tasks": {}}
    for slug in ("proofwriter-owa", "proofwriter-cwa"):
        task = Task.load(slug)
        q = task.wire_questions()[QUESTION_NAME]
        items = task.load_items()
        examples = []
        for depth in DEPTHS:
            pool = [i for i in items if i["metadata"]["depth"] == depth and not i["metadata"]["paraphrased"]]
            item = min(pool, key=lambda i: (len(i["text"]), i["id"]))
            reqs = requests_for(item["text"], q)
            engines = {}
            for engine, req in reqs.items():
                rows = read_by_id(record_path(engine, slug))
                row = rows.get(item["id"])
                if row is None:
                    continue
                engines[engine] = {"request": req, "response": {k: row.get(k) for k in ("model", "answers", "usage", "latency_ms")},
                                   "correct": (row.get("answers") or {}).get(QUESTION_NAME, {}).get("choice") == item["metadata"]["reference_label"]}
            examples.append({"id": item["id"], "depth": depth, "gold": item["metadata"]["reference_label"], "text": item["text"], "engines": engines})
        out["tasks"][slug] = examples
    path = ROOT / "studies" / "request-examples.json"
    path.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    for slug, exs in out["tasks"].items():
        for ex in exs:
            print(slug[-3:], "depth", ex["depth"], ex["id"], "gold", ex["gold"], {e: v["response"]["answers"][QUESTION_NAME]["choice"] for e, v in ex["engines"].items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
