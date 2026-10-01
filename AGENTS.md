# Agent instructions: Hard-Decisions

An accuracy benchmark for decision models and LLM classifiers on ProofWriter. It follows the conventions of
Biased-Decisions (the sibling harness this was modelled on).

- **Preregistered:** commit predictions (`docs/preregistration.md`) before any engine answers an item, and score
  against them word for word.
- **Replayable:** `hd replay` must reproduce `studies/*.jsonl` byte for byte from the committed `answers/`
  records, offline and without a key.
- **Spend:** hosted engines cost money. `hd answer` is a dry run unless `--confirm --max-requests N` is given;
  price it first, and run a vendor only with the user's approval of that spend.
- **Secrets:** keys come from the environment or a gitignored `.env`. Never read, print or `source` a `.env`.
- **Engines are versioned:** record the model id per row; a version change is a new engine.
- **Samples are nested:** `hd build` with the same seed and a larger `--n` only adds items, so existing answers
  stay valid. Changing the seed, depths or weights creates a new sample and invalidates the records.
- Conventional Commits; work on a branch.
