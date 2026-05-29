#!/bin/sh
set -eu

api_url="${VITE_API_URL:-}"
escaped_api_url="$(printf '%s' "$api_url" | sed 's/\\/\\\\/g; s/"/\\"/g')"

cat >/usr/share/nginx/html/env.js <<EOF
window.__KUBEARA_CONFIG__ = {
  VITE_API_URL: "${escaped_api_url}"
};
EOF
