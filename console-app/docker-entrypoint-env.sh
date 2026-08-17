#!/bin/sh
set -eu

api_url="${VITE_API_URL:-http://localhost:3000/api}"
escaped_api_url="$(printf '%s' "$api_url" | sed 's/\\/\\\\/g; s/"/\\"/g')"

# Align loopback API host to the page host in the browser (localhost vs 127.0.0.1 are
# different sites — cookies set on one are not sent to the other on XHR).
cat >/usr/share/nginx/html/env.js <<EOF
(function () {
  var configured = "${escaped_api_url}";
  var pageHost = window.location.hostname;
  var loopback = { localhost: 1, "127.0.0.1": 1, "[::1]": 1, "::1": 1 };
  try {
    var url = new URL(configured, window.location.origin);
    if (
      loopback[url.hostname] &&
      loopback[pageHost] &&
      url.hostname !== pageHost
    ) {
      url.hostname = pageHost;
      configured = url.origin + url.pathname;
    }
  } catch (e) {}
  configured = configured.replace(/\\/\$/, "");
  window.__KUBEARA_CONFIG__ = { VITE_API_URL: configured };
})();
EOF
