#!/usr/bin/env bash
set -euo pipefail

# Safe, read-only preflight for a GeeLark MCP -> OpenAI Secure MCP Tunnel host.
# Requires local GeeLark CLI authentication, and an initialized tunnel profile.
PROFILE="geelark-stdio"
if [[ "${1:-}" == "--profile" ]]; then
  [[ -n "${2:-}" ]] || { printf 'ERROR: --profile needs a name\n' >&2; exit 64; }
  PROFILE="$2"
  shift 2
fi
if [[ "$#" -ne 0 ]]; then
  printf 'ERROR: unexpected arguments\n' >&2
  exit 64
fi
need() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'ERROR: required command missing: %s\n' "$1" >&2
    exit 69
  }
}
need npx
need tunnel-client
printf 'CHECK: GeeLark CLI auth status\n'
if ! npx -y geelark-cli@1.0.30 auth status >/dev/null; then
  printf 'ERROR: GeeLark authorization failed. Run "npx -y geelark-cli@1.0.30 config init" locally.\n' >&2
  exit 77
fi
printf 'PASS: local GeeLark auth configured\n'
printf 'CHECK: GeeLark phone API (read only)\n'
if ! npx -y geelark-cli@1.0.30 phone list --page 1 --page-size 1 >/dev/null; then
  printf 'ERROR: cloud-phone list failed; check GeeLark API permissions, plan, and network\n' >&2
  exit 75
fi
printf 'PASS: read-only GeeLark API reached\n'
printf 'CHECK: Secure MCP Tunnel health profile=%s\n' "$PROFILE"
if ! tunnel-client doctor --profile "$PROFILE" --explain; then
  printf 'ERROR: tunnel not configured or not healthy; inspect tunnel-client doctor output\n' >&2
  exit 78
fi
printf 'PASS: preflight completed. This does not prove ChatGPT plugin discovery.\n'
