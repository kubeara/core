#!/bin/sh

set -eu

api_url="${VITE_API_URL:-}"
service_port="${SERVICE_PORT_KUBEARA:-}"

if [ -z "${api_url}" ] && [ -z "${service_port}" ]; then
  echo "kubeara-console: WARNING: Neither VITE_API_URL nor SERVICE_PORT_KUBEARA is set" >&2
  echo "kubeara-console: WARNING: The frontend must never fall back to its own port for API calls" >&2
fi

escaped_api_url="$(printf '%s' "$api_url" | sed 's/\\/\\\\/g; s/"/\\"/g')"
escaped_service_port="$(printf '%s' "$service_port" | sed 's/\\/\\\\/g; s/"/\\"/g')"

cat >/usr/share/nginx/html/env.js <<EOF
(function () {
  var configured = "${escaped_api_url}";
  var servicePort = "${escaped_service_port}";
  var pageHost = window.location.hostname;
  var pageProtocol = window.location.protocol;
  var loopback = { localhost: 1, "127.0.0.1": 1, "[::1]": 1, "::1": 1 };

  try {
    if (
      configured === "/" ||
      configured === "same-origin" ||
      configured === "same-origin/"
    ) {
      if (!servicePort) {
        throw new Error("SERVICE_PORT_KUBEARA is required for same-origin API configuration");
      }

      configured =
        pageProtocol + "//" + pageHost + ":" + servicePort + "/api";
    } else {
      var url = new URL(configured, window.location.origin);

      if (
        loopback[url.hostname] &&
        loopback[pageHost] &&
        url.hostname !== pageHost
      ) {
        url.hostname = pageHost;
        configured = url.origin + url.pathname;
      }

      configured = configured.replace(/\/$/, "");
    }
  } catch (e) {
    console.error("kubeara-console: Failed to configure API URL", e);
  }

  window.__KUBEARA_CONFIG__ = {
    VITE_API_URL: configured
  };
})();
EOF