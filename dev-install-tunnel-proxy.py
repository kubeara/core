#!/usr/bin/env python3
"""
Dev helper: serve install.sh (and other repo files) while proxying /api/* to Nest.

Use this instead of `python3 -m http.server 8000` when testing remote installs
against a local control-panel on :3000 through a single ngrok tunnel:

  # Terminal A — Nest on :3000
  # Terminal B
  python3 scripts/dev-install-tunnel-proxy.py
  # Terminal C
  ngrok http 8000

Remote:
  export KUBEARA_TRACKING_URL=https://<ngrok-host>/api/public/installations/events
  curl -fsSL https://<ngrok-host>/install.sh | bash

Tracking POSTs to /api/public/installations/events are forwarded to Nest.
"""

from __future__ import annotations

import argparse
import http.server
import os
import socketserver#!/usr/bin/env python3
"""
Dev helper: serve install.sh (and other repo files) while proxying /api/* to Nest.

Use this instead of `python3 -m http.server 8000` when testing remote installs
against a local control-panel on :3000 through a single ngrok tunnel:

  # Terminal A — Nest on :3000
  # Terminal B
  python3 scripts/dev-install-tunnel-proxy.py
  # Terminal C
  ngrok http 8000

Remote:
  export KUBEARA_TRACKING_URL=https://<ngrok-host>/api/public/installations/events
  curl -fsSL https://<ngrok-host>/install.sh | bash

Tracking POSTs to /api/public/installations/events are forwarded to Nest.
"""

from __future__ import annotations

import argparse
import http.server
import os
import socketserver
import sys
import urllib.error
import urllib.request

DEFAULT_PORT = 8000
DEFAULT_API_ORIGIN = "http://127.0.0.1:3000"
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}


class DualPurposeHandler(http.server.SimpleHTTPRequestHandler):
    api_origin: str = DEFAULT_API_ORIGIN

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        super().do_GET()

    def do_HEAD(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        super().do_HEAD()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        self.send_error(501, "Unsupported method ('POST')")

    def do_PUT(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        self.send_error(501, "Unsupported method ('PUT')")

    def do_PATCH(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        self.send_error(501, "Unsupported method ('PATCH')")

    def do_DELETE(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        self.send_error(501, "Unsupported method ('DELETE')")

    def _proxy_to_api(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length > 0 else None
        target = f"{self.api_origin.rstrip('/')}{self.path}"

        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in HOP_BY_HOP
        }
        headers.setdefault("ngrok-skip-browser-warning", "true")

        request = urllib.request.Request(
            target,
            data=body,
            headers=headers,
            method=self.command,
        )

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read()
                self.send_response(response.status)
                for key, value in response.headers.items():
                    if key.lower() in HOP_BY_HOP:
                        continue
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(payload)
        except urllib.error.HTTPError as error:
            payload = error.read()
            self.send_response(error.code)
            for key, value in error.headers.items():
                if key.lower() in HOP_BY_HOP:
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
        except Exception as error:  # noqa: BLE001
            message = f"Proxy to Nest failed: {error}\n".encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(message)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        sys.stderr.write(
            "%s - - [%s] %s\n"
            % (self.address_string(), self.log_date_time_string(), format % args)
        )


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument(
        "--api-origin",
        default=os.environ.get("KUBEARA_DEV_API_ORIGIN", DEFAULT_API_ORIGIN),
        help="Nest origin to proxy /api/* to (default: http://127.0.0.1:3000)",
    )
    parser.add_argument(
        "--root",
        default=os.environ.get(
            "KUBEARA_DEV_STATIC_ROOT",
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
        ),
        help="Directory to serve statically (default: repo root)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    os.chdir(args.root)

    handler = DualPurposeHandler
    handler.api_origin = args.api_origin

    with ReusableTCPServer(("0.0.0.0", args.port), handler) as httpd:
        print(
            f"Serving {args.root} on :{args.port}; proxying /api/* -> {args.api_origin}",
            flush=True,
        )
        print(
            "Keep ngrok pointed at this port. Stop plain `python3 -m http.server`.",
            flush=True,
        )
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


import sys
import urllib.error
import urllib.request

DEFAULT_PORT = 8000
DEFAULT_API_ORIGIN = "http://127.0.0.1:3000"
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}


class DualPurposeHandler(http.server.SimpleHTTPRequestHandler):
    api_origin: str = DEFAULT_API_ORIGIN

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        super().do_GET()

    def do_HEAD(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        super().do_HEAD()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        self.send_error(501, "Unsupported method ('POST')")

    def do_PUT(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        self.send_error(501, "Unsupported method ('PUT')")

    def do_PATCH(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        self.send_error(501, "Unsupported method ('PATCH')")

    def do_DELETE(self) -> None:  # noqa: N802
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_to_api()
            return
        self.send_error(501, "Unsupported method ('DELETE')")

    def _proxy_to_api(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length > 0 else None
        target = f"{self.api_origin.rstrip('/')}{self.path}"

        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in HOP_BY_HOP
        }
        headers.setdefault("ngrok-skip-browser-warning", "true")

        request = urllib.request.Request(
            target,
            data=body,
            headers=headers,
            method=self.command,
        )

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read()
                self.send_response(response.status)
                for key, value in response.headers.items():
                    if key.lower() in HOP_BY_HOP:
                        continue
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(payload)
        except urllib.error.HTTPError as error:
            payload = error.read()
            self.send_response(error.code)
            for key, value in error.headers.items():
                if key.lower() in HOP_BY_HOP:
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
        except Exception as error:  # noqa: BLE001
            message = f"Proxy to Nest failed: {error}\n".encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(message)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        sys.stderr.write(
            "%s - - [%s] %s\n"
            % (self.address_string(), self.log_date_time_string(), format % args)
        )


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument(
        "--api-origin",
        default=os.environ.get("KUBEARA_DEV_API_ORIGIN", DEFAULT_API_ORIGIN),
        help="Nest origin to proxy /api/* to (default: http://127.0.0.1:3000)",
    )
    parser.add_argument(
        "--root",
        default=os.environ.get(
            "KUBEARA_DEV_STATIC_ROOT",
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
        ),
        help="Directory to serve statically (default: repo root)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    os.chdir(args.root)

    handler = DualPurposeHandler
    handler.api_origin = args.api_origin

    with ReusableTCPServer(("0.0.0.0", args.port), handler) as httpd:
        print(
            f"Serving {args.root} on :{args.port}; proxying /api/* -> {args.api_origin}",
            flush=True,
        )
        print(
            "Keep ngrok pointed at this port. Stop plain `python3 -m http.server`.",
            flush=True,
        )
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

