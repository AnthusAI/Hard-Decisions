"""Run the minimal-pair check (studies/gliner-minimal-pairs/items.json) in its three forms and keep every request
and response verbatim in studies/gliner-minimal-pairs/results.json. The key is read from .env; never stored.

    var/gliner-venv/bin/python tools/gliner_minimal_pairs.py
"""
import json, os, sys, warnings
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
warnings.simplefilter("ignore")
import httpx
from dotenv import load_dotenv
from hard_decisions.engines.gliner_decide import REPO, REVISION

def main():
    load_dotenv(ROOT / ".env")
    plan = json.loads((ROOT / "studies/gliner-minimal-pairs/items.json").read_text())
    from gliner2 import AutoExtractor
    m = AutoExtractor.from_pretrained(REPO, revision=REVISION); m.to("mps")
    client = httpx.Client(timeout=60, headers={"Authorization": "Bearer " + os.environ["FASTINO_API_KEY"]})
    rows = []
    for it in plan["items"]:
        msg = f"{it['text']}\n\n{it['question']}"
        card_req = {"text": it["text"], "tasks": {"answer": {"labels": ["yes", "no"], "prompt": it["question"]}}}
        card = m.classify_text(card_req["text"], card_req["tasks"], include_confidence=True)["answer"]
        local_req = {"text": msg, "tasks": {"answer": ["yes", "no"]}}
        local = m.classify_text(local_req["text"], local_req["tasks"], include_confidence=True)["answer"]
        hosted_req = {"model": "fastino/GLiNER-2.5-Decide", "messages": [{"role": "user", "content": msg}],
                      "schema": {"classifications": [{"task": "answer", "labels": ["yes", "no"], "multi_label": False}]},
                      "include_confidence": True}
        r = client.post("https://api.fastino.ai/v1/chat/completions", json=hosted_req); r.raise_for_status()
        j = r.json(); j.pop("id", None)
        hosted = json.loads(j["choices"][0]["message"]["content"])["answer"]
        rows.append({**it, "card": {"request": card_req, "response": card}, "local-message": {"request": local_req, "response": local},
                     "hosted": {"request": hosted_req, "response": j, "answer": hosted}})
    summary = {}
    for form in ("card", "hosted", "local-message"):
        get = (lambda r: r["hosted"]["answer"]["label"]) if form == "hosted" else (lambda r, f=form: r[f]["response"]["label"])
        acc = sum(get(r) == r["gold"] for r in rows) / len(rows)
        pairs = {}
        for r in rows: pairs.setdefault(r["pair"], []).append(get(r) == r["gold"])
        both = sum(all(v) for v in pairs.values()) / len(pairs)
        same = sum(len({get(r) for r in rows if r["pair"] == p}) == 1 for p in pairs) / len(pairs)
        summary[form] = {"accuracy": acc, "pairs_both_right": both, "pairs_same_answer_both_sides": same}
        print(f"{form:14} accuracy {100*acc:5.1f}%   pairs right on both sides {100*both:5.1f}%   pairs given the same answer both times {100*same:5.1f}%")
    (ROOT / "studies/gliner-minimal-pairs/results.json").write_text(json.dumps({"summary": summary, "model": f"{REPO}@{REVISION[:7]}", "rows": rows}, indent=1) + "\n")
    for r in rows[:2] + rows[10:12] + rows[16:18]:
        print(f"  {r['text']!r} | {r['question']} | gold {r['gold']} | card {r['card']['response']['label']} ({r['card']['response']['confidence']:.2f}) | hosted {r['hosted']['answer']['label']} ({r['hosted']['answer']['confidence']:.2f})")

if __name__ == "__main__":
    main()
