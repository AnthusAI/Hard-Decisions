# GLiNER2.5-Decide request form, chosen on ProofWriter's dev split (written before any dev run)

The benchmark sample is drawn from ProofWriter's test split. This study uses only `meta-dev.jsonl` from the same
configs, so nothing here touches benchmark items.

**Dev set:** for each task (OWA, CWA), 50 questions at each depth 0-5 (300 per task), drawn with a fixed seed from
the dev split of the configs the benchmark samples, text rendered exactly as benchmark items (`render_text`), gold
label from the dataset.

**Every eligible form carries all the information the other engines get** (the item's theory and statement, the
question's instructions, every option with its description), placed in the shape the model card documents for a
question over a passage: the passage as text, the specific question as the task `prompt`, options as described
labels.

| Form | Text | Prompt | Labels |
|---|---|---|---|
| A | theory, then instructions | `Statement: <statement>` | options with descriptions |
| B | instructions, then theory | `Statement: <statement>` | options with descriptions |
| C | theory | `Statement: <statement>`, then instructions | options with descriptions |
| D | theory, `Statement: <statement>`, instructions (the benchmark's full message) | `Statement: <statement>` | options with descriptions |

Diagnostics, reported but not eligible because they drop information: **X** = theory as text, `Statement:
<statement>` as prompt, bare labels; and the two forms already run on the benchmark (full message with bare labels;
item text with bare labels).

**Selection rule:** the eligible form with the highest dev accuracy averaged over the two tasks. If none beats the
best constant answer by 5 points on either task, the benchmark entry stays the full-information form already run,
and that is reported. The chosen form is then preregistered (Amendment 8c) and run once on the benchmark; it is not
changed after that.
