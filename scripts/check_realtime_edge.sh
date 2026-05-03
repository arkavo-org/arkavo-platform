#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BACKEND_LOCATION="${BACKEND_LOCATION:-}"
if [[ -z "${BACKEND_LOCATION}" && -f "${ROOT_DIR}/editme.py" ]]; then
  BACKEND_LOCATION="$(python3 - <<'PY'
import importlib.util, pathlib
p = pathlib.Path('editme.py').resolve()
spec = importlib.util.spec_from_file_location('editme_runtime', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
print(getattr(m, 'BACKEND_LOCATION', '').strip())
PY
)"
fi

if [[ -z "${BACKEND_LOCATION}" ]]; then
  echo "ERROR: BACKEND_LOCATION not found. Set BACKEND_LOCATION env var or ensure editme.py exists."
  exit 1
fi

SIGNALING_DOMAIN="${SIGNALING_DOMAIN:-signaling.${BACKEND_LOCATION}}"
TURN_DOMAIN="${TURN_DOMAIN:-turn.${BACKEND_LOCATION}}"
PORTAL_ORIGIN="${PORTAL_ORIGIN:-https://portal.${BACKEND_LOCATION}}"

ok() { echo "[OK] $*"; }
warn() { echo "[WARN] $*"; }
fail() { echo "[FAIL] $*"; }

check_tcp_443() {
  local host="$1"
  if nc -zvw4 "$host" 443 >/dev/null 2>&1; then
    ok "tcp/443 reachable for ${host}"
  else
    fail "tcp/443 not reachable for ${host}"
    return 1
  fi
}

check_tls_sni() {
  local host="$1"
  if timeout 8 openssl s_client -connect "${host}:443" -servername "$host" </dev/null 2>/dev/null | rg -q "BEGIN CERTIFICATE"; then
    ok "TLS handshake works with SNI for ${host}:443"
  else
    fail "TLS handshake failed for ${host}:443"
    return 1
  fi
}

check_ws_upgrade() {
  local host="$1"
  local req
  req=$'GET / HTTP/1.1\r\n'
  req+="Host: ${host}"$'\r\n'
  req+=$'Upgrade: websocket\r\n'
  req+=$'Connection: Upgrade\r\n'
  req+=$'Sec-WebSocket-Version: 13\r\n'
  req+=$'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n'
  req+="Origin: ${PORTAL_ORIGIN}"$'\r\n\r\n'

  local first_line
  first_line="$(printf "%s" "$req" | timeout 8 openssl s_client -quiet -connect "${host}:443" -servername "$host" 2>/dev/null | head -n 1 || true)"

  if [[ "$first_line" == *"101"* ]]; then
    ok "WebSocket upgrade succeeded on ${host}:443"
    return 0
  fi

  warn "WebSocket upgrade did not return 101 on ${host}:443 (got: ${first_line:-<no response>})"
  return 1
}

echo "Checking realtime edge endpoints for ${BACKEND_LOCATION}"
check_tcp_443 "$SIGNALING_DOMAIN"
check_tcp_443 "$TURN_DOMAIN"
check_tls_sni "$SIGNALING_DOMAIN"
check_tls_sni "$TURN_DOMAIN"
check_ws_upgrade "$SIGNALING_DOMAIN" || true

echo "Done."
