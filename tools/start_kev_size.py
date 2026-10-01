"""Launch a pinned Kev checkpoint from Hard-Decisions' own HF cache, with the Biased-Decisions
settings (MLX bf16, prefix cache and date facts off, stored temperature) and a bounded MLX memory.
Usage: start_kev_size.py <repo@revision> <memory GiB>"""
import os, runpy, sys
from pathlib import Path
run, gib = sys.argv[1], int(sys.argv[2])
os.environ.update({'HF_HOME': str(Path(__file__).resolve().parent / 'hf-cache'), 'HF_HUB_OFFLINE': '1',
                   'KEV_BACKEND': 'mlx', 'KEV_DTYPE': 'bf16', 'KEV_PREFIX_CACHE': '0', 'KEV_DATE_FACTS': '0',
                   'KEV_MERGE': '1', 'KEV_LORA_SCALE': '1', 'TOKENIZERS_PARALLELISM': 'false', 'OMP_NUM_THREADS': '2'})
for name in ('KEV_API_KEY', 'KEV_TEMPERATURE'):
    os.environ.pop(name, None)
import mlx.core as mx
mx.set_memory_limit(gib * 1024**3); mx.set_cache_limit(256 * 1024**2); mx.set_wired_limit(gib * 1024**3)
sys.argv = ['kev.serve', '--run', run, '--port', '8009']
runpy.run_module('kev.serve', run_name='__main__')
