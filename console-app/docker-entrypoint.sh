#!/bin/sh
set -eu

/usr/local/bin/kubeara-write-env.sh
exec /docker-entrypoint.sh "$@"
