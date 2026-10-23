#!/usr/bin/env bash
# LUCKY · 现场抽奖系统 一键启动
set -e
cd "$(dirname "$0")"

PORT="${PORT:-7788}"

echo "正在启动 LUCKY 现场抽奖系统…"
node server.js &
SERVER_PID=$!

sleep 1.2
if command -v open >/dev/null 2>&1; then
  open "http://localhost:${PORT}/host"
fi

trap 'kill $SERVER_PID 2>/dev/null' INT TERM
wait $SERVER_PID
