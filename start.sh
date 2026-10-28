#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
command -v node >/dev/null 2>&1 || { echo 'Node.js 24 LTSを先にインストールしてください。'; exit 1; }
exec node server/index.js
