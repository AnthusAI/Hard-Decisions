#!/usr/bin/env bash
# Runs Papyrus over the staged static directory. Usage: project-site.sh CONTENT_DIR STATIC_DIR OUT_DIR
# The production origin comes from web/projection.json (site.productionUrl); set PAPYRUS_SITE_PUBLIC_URL to build for
# another origin, which Papyrus then treats as a non-production site (noindex, its own canonical URLs).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/markus-environment.sh"
"$papyrus_bin" ops content project --all --from-dir "$1" --static-dir "$2" --out "$3"
