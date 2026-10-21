#!/usr/bin/env bash
# Sourced by project-site.sh: creates the Python environment that runs Papyrus and Markus and exports its path.
# PAPYRUS_BIN overrides it (a developer's own Papyrus checkout or environment).

site_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
markus_environment="$site_root/.build/markus-venv"

if [ -n "${PAPYRUS_BIN:-}" ]; then
  papyrus_bin="$PAPYRUS_BIN"
  return 0 2>/dev/null || exit 0
fi

export PATH="$HOME/.local/bin:$PATH"
if [ ! -x "$markus_environment/bin/papyrus" ]; then
  if ! command -v uv >/dev/null 2>&1; then
    python3 -m pip install --quiet --user uv || curl -LsSf https://astral.sh/uv/install.sh | sh
  fi
  uv venv --python 3.12 "$markus_environment"
  uv pip install --quiet --python "$markus_environment/bin/python" -r "$site_root/web/requirements.txt"
fi
papyrus_bin="$markus_environment/bin/papyrus"
