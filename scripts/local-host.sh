#!/usr/bin/env bash
# A separate local release deployment, intended for Tailscale HTTPS termination.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
label="studio.cardboard.drawing-board"
domain="gui/$(id -u)"
case "${1:-status}" in
  prepare)
    mkdir -p .local
    if [ ! -f .local/host.env ]; then
      tailscale status --json | python3 -c '
import json, secrets, shlex, sys
from pathlib import Path
state=json.load(sys.stdin)
if state.get("BackendState") != "Running": raise SystemExit("Tailscale must be running.")
host=state["Self"]["DNSName"].rstrip(".")
if not host: raise SystemExit("This node needs a Tailscale DNS name.")
root=Path.cwd()
values={"BIND_ADDR":"127.0.0.1:3100", "APP_ORIGIN":f"https://{host}:10000", "DATABASE_PATH":str(root/".local/drawing-board.sqlite"), "ACCOUNT_REGISTRATION_CODE":secrets.token_urlsafe(32), "RUST_LOG":"info"}
with (root/".local/host.env").open("x") as f:
    for key,value in values.items(): f.write(f"export {key}={shlex.quote(value)}\n")
print("Created .local/host.env with a private enrollment code.")
'
    fi
    python3 - <<'PY'
from pathlib import Path
import plistlib
root=Path.cwd()
job={"Label":"studio.cardboard.drawing-board", "ProgramArguments":["/bin/bash",str(root/"scripts/local-host.sh"),"serve"], "WorkingDirectory":str(root), "RunAtLoad":True, "KeepAlive":True, "ThrottleInterval":10, "StandardOutPath":str(root/".local/server.log"), "StandardErrorPath":str(root/".local/server-error.log")}
with (root/".local/drawing-board.plist").open("wb") as f: plistlib.dump(job,f)
print("Prepared .local/drawing-board.plist. Run the release build before start.")
PY
    ;;
  serve)
    # Never inherit development/preview authentication into a public host.
    unset DEV_AUTH PREVIEW_AUTH PREVIEW_ACCESS_CODE RENDER IS_PULL_REQUEST PORT
    source .local/host.env
    exec ./target/release/server
    ;;
  start)
    test -x target/release/server
    test -f dist/lab/lab.js
    test -f .local/host.env
    # Fails if already loaded; never replaces another service or process.
    launchctl bootstrap "$domain" "$PWD/.local/drawing-board.plist"
    launchctl kickstart "$domain/$label"
    ;;
  stop)
    launchctl bootout "$domain/$label"
    ;;
  admin-invite)
    source .local/host.env
    exec ./target/release/server bootstrap-admin
    ;;
  status)
    launchctl print "$domain/$label"
    ;;
  *)
    echo "Usage: $0 {prepare|start|stop|status|serve|admin-invite}" >&2
    exit 2
    ;;
esac
