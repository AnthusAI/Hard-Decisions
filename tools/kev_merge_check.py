"""Load a Kev checkpoint exactly as the pinned server does (same env and MLX limits as start_kev_size.py), then print
a SHA-256 over every backbone weight (name order) plus peak memory. Run once with the original runtime and once with
PYTHONPATH pointing at var/kev-patched to show the patched merge loads identical weights.
Usage: kev_merge_check.py <repo@revision> <memory GiB>"""
import hashlib, os, subprocess, sys, re
from pathlib import Path
run, gib = sys.argv[1], int(sys.argv[2])
os.environ.update({'HF_HOME': str(Path(__file__).resolve().parent / 'hf-cache'), 'HF_HUB_OFFLINE': '1',
                   'KEV_BACKEND': 'mlx', 'KEV_DTYPE': 'bf16', 'KEV_PREFIX_CACHE': '0', 'KEV_DATE_FACTS': '0',
                   'KEV_MERGE': '1', 'KEV_LORA_SCALE': '1', 'TOKENIZERS_PARALLELISM': 'false', 'OMP_NUM_THREADS': '2'})
for name in ('KEV_API_KEY', 'KEV_TEMPERATURE'):
    os.environ.pop(name, None)
import mlx.core as mx
from mlx.utils import tree_flatten
mx.set_memory_limit(gib * 1024**3); mx.set_cache_limit(256 * 1024**2); mx.set_wired_limit(gib * 1024**3)
import torch, kev
from dataclasses import replace
from kev.checkpoint import load, LoadOptions
opts = replace(LoadOptions.from_env(), dtype=torch.bfloat16, backend="mlx")
tok, m = load(run, "mps", opts)
# Peak memory as of the end of loading, before hashing adds its own transient copies.
fp = subprocess.run(["footprint", "-p", str(os.getpid())], capture_output=True, text=True).stdout
peak = re.search(r"phys_footprint_peak:\s*([\d.]+\s*[KMG]B)", fp)
mlx_peak = mx.get_peak_memory() / 1024**3
h = hashlib.sha256()
for name, value in sorted(tree_flatten(m.lm.parameters()), key=lambda kv: kv[0]):
    h.update(name.encode()); h.update(memoryview(mx.contiguous(value).astype(mx.float32)).tobytes() if value.dtype == mx.bfloat16 else memoryview(value).tobytes())
print(f"kev from {Path(kev.__file__).parent.parent}")
print(f"weights sha256 {h.hexdigest()}")
print(f"after load: mlx peak {mlx_peak:.2f} GiB; process footprint peak {peak.group(1) if peak else '?'}")
