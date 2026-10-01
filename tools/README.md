# Kev on a 32 GB Mac

`start_kev_size.py` launches a pinned Kev checkpoint with the Biased-Decisions settings (MLX, bfloat16, prefix
cache and date facts off, stored temperature) and bounded MLX memory. It is copied to `var/` and run from the
Kev runtime's virtualenv (Kev server commit `c9c1f855505336ac32092a5f68305d397f7fcc3e`).

## The merge patch (`kev-merge-one-at-a-time.patch`), used for Kev-9B

Kev's MLX loader folds the LoRA adapter into the base weights by computing every merged matrix before loading any,
so for a moment it holds about two copies of the model: Kev-4B peaked at 17 GB, and Kev-9B would need about 35-40 GB,
more than this machine has. The patch merges and loads one matrix at a time, with the same fp32 CPU arithmetic and
the same single rounding to bfloat16. Only the order of work changes. Applied to a copy of the runtime in
`var/kev-patched/` and put first on `PYTHONPATH`; the Biased-Decisions runtime is untouched.

Verified on Kev-4B (2026-10-01, `kev_merge_check.py`):

| | original runtime | patched |
|---|---|---|
| SHA-256 over every backbone weight | `cba3e4fc75695ba19514077463e5deb0f69dc8b80a3d9621bae01dff5e74132a` | identical |
| peak memory while loading (MLX / process) | 16.11 GiB / 17 GB | 8.17 GiB / 9.2 GB |
| answers and probabilities on 100 items vs the scored records | - | 100/100 identical |

Kev-0.8B and Kev-4B were scored with the original runtime; Kev-9B with the patched one.
