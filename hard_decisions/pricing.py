"""Published list prices, USD per million tokens (input, output), for every paid engine.

A paid engine with no entry here cannot be priced, and ``hd answer`` refuses to run it until one is
added with its source. Output tokens include any reasoning tokens the vendor bills.
"""
from __future__ import annotations

from typing import Dict, Optional, Tuple

# Anthropic first-party API list prices, Claude API reference (models table cached 2026-09-25).
PRICES: Dict[str, Tuple[float, float]] = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-4-5": (1.00, 5.00),
    # OpenAI model page (developers.openai.com/api/docs/models/gpt-6-luna), read 2026-10-01.
    "gpt-6-luna": (0.10, 0.50),
}


def per_token(model: str) -> Optional[Tuple[float, float]]:
    price = PRICES.get(model)
    return None if price is None else (price[0] / 1e6, price[1] / 1e6)
