"""Check our GLiNER2.5-Decide setup against Fastino's own benchmark (fastino/fast-decisions dev split, pinned 1a33070).
Exact match per decision, as the dataset card defines it. Fastino reports 60.2% on the held-out test split."""
import json, glob, os, warnings; warnings.simplefilter("ignore")
from gliner2 import AutoExtractor
m = AutoExtractor.from_pretrained("fastino/GLiNER2.5-Decide", revision="5a7adf72a23b4d311abae6ce050d7f0012bb3416"); m.to("mps")
D = os.environ.get("FAST_DECISIONS_DIR", "var/fast-decisions")  # fastino/fast-decisions@1a33070, dev split
tot = []; per = {}
for f in sorted(glob.glob(f"{D}/*.jsonl")):
    dom = os.path.basename(f)[:-6]; ok = []
    for line in open(f):
        r = json.loads(line)
        heads = r["output"]["classifications"]
        tasks = {h["task"]: ({"labels": h["labels"], "multi_label": True} if h.get("multi_label") else h["labels"]) for h in heads}
        out = m.classify_text(r["input"], tasks)
        for h in heads:
            pred = out.get(h["task"]); gold = set(h["true_label"])
            got = set(pred) if isinstance(pred, list) else {pred}
            ok.append(got == gold)
    per[dom] = sum(ok) / len(ok); tot += ok
    print(f"{dom:18} {100*per[dom]:5.1f}%  ({len(ok)} decisions)", flush=True)
print(f"MEAN OF DOMAINS {100*sum(per.values())/len(per):.1f}%   ALL DECISIONS {100*sum(tot)/len(tot):.1f}% ({len(tot)})")
