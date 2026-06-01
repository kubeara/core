#!/usr/bin/env bash
# Entry point for: curl -fsSL https://get.kubeara.dev | sh
# Delegates to the control panel deploy installer.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/apps/control-panel-app/deploy/install.sh" "$@"
