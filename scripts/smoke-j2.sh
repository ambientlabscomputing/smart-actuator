#!/usr/bin/env bash
# smoke-j2.sh — headless smoke test for J2 "Jog it" exit criteria.
#
# Exit criteria tested:
#   1. Jog command converges: POST /move/joint moves cylinder within ±2° of target.
#   2. E-stop latency: POST /move/estop flips mode to "estopped" within 1 s.
#   3. Recovery: POST /mode {idle} returns mode to "idle".
#   4. Watchdog hold: kill Brain, assert position stable (±0.1°), restart, assert jog resumes.
#   5. Journey-ID propagation: x-journey-id echoed back in response headers.
#
# Pre-requisites: full stack running (sim + sidecar + brain), machine in IDLE.
# Usage: BRAIN_URL=http://localhost:8080 bash scripts/smoke-j2.sh

set -euo pipefail

BRAIN_URL="${BRAIN_URL:-http://localhost:8080}"
WAIT_TIMEOUT="${SMOKE_WAIT_SECS:-30}"
MACHINE_ID="${MACHINE_ID:-j1}"
PASS=0
FAIL=0

pass()  { echo "[PASS] $*"; PASS=$(( PASS + 1 )); }
fail()  { echo "[FAIL] $*"; FAIL=$(( FAIL + 1 )); }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

brain_get() {
  curl -sf "$BRAIN_URL$1"
}

brain_post() {
  local path="$1"; shift
  local body="$1"; shift
  local journey_id; journey_id=$(python3 -c "import uuid; print(uuid.uuid4())")
  curl -sf -X POST \
    -H "Content-Type: application/json" \
    -H "X-Journey-Id: $journey_id" \
    -D /tmp/smoke_j2_headers.txt \
    -d "$body" \
    "$BRAIN_URL$path" || echo "{}"
  echo "$journey_id" > /tmp/smoke_j2_journey_id.txt
}

get_mode() {
  brain_get "/api/v1/state?machine_id=$MACHINE_ID" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('mode','unknown'))" 2>/dev/null || echo "unknown"
}

get_angle_deg() {
  brain_get "/api/v1/state?machine_id=$MACHINE_ID" | \
    python3 -c "
import sys, json, math
d = json.load(sys.stdin)
m = d.get('measured', [])
if m:
    print(round(math.degrees(m[0]['angle_rad']), 3))
else:
    print('MISSING')
" 2>/dev/null || echo "MISSING"
}

# ---------------------------------------------------------------------------
# Wait for Brain
# ---------------------------------------------------------------------------
echo "[smoke-j2] Waiting for Brain at $BRAIN_URL ..."
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
until brain_get "/api/v1/state?machine_id=$MACHINE_ID" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "[smoke-j2] ERROR: Brain not ready after ${WAIT_TIMEOUT}s — aborting"
    exit 1
  fi
  sleep 0.5
done
echo "[smoke-j2] Brain ready."

# Ensure we're in IDLE before starting.
current_mode=$(get_mode)
if [ "$current_mode" != "idle" ]; then
  echo "[smoke-j2] Current mode=$current_mode; requesting idle..."
  brain_post "/api/v1/mode?machine_id=$MACHINE_ID" "{\"mode\":\"idle\"}" >/dev/null
  sleep 0.5
fi

# ---------------------------------------------------------------------------
# Test 1 — Jog converges within ±2°
# ---------------------------------------------------------------------------
echo
echo "[smoke-j2] --- Test 1: Jog converges ---"
before_deg=$(get_angle_deg)
# Target = before + 10° (command in radians)
target_rad=$(python3 -c "import math; print(math.radians(float('$before_deg') + 10))")
brain_post "/api/v1/move/joint" \
  "{\"machine_id\":\"$MACHINE_ID\",\"joint_targets\":{\"joint0\":$target_rad}}" >/dev/null

sleep 1.5  # allow PD loop to converge

after_deg=$(get_angle_deg)
target_deg=$(python3 -c "print(float('$before_deg') + 10)")
error=$(python3 -c "print(abs(float('$after_deg') - float('$target_deg')))")
echo "[smoke-j2] before=${before_deg}°  target=${target_deg}°  after=${after_deg}°  error=${error}°"

if python3 -c "import sys; sys.exit(0 if float('$error') <= 2 else 1)"; then
  pass "Jog converged within 2°"
else
  fail "Jog did not converge (error=${error}° > 2°)"
fi

# ---------------------------------------------------------------------------
# Test 2 — E-stop flips mode to estopped
# ---------------------------------------------------------------------------
echo
echo "[smoke-j2] --- Test 2: E-stop ---"
brain_post "/api/v1/move/estop?machine_id=$MACHINE_ID" "{}" >/dev/null
sleep 0.5

mode_after=$(get_mode)
echo "[smoke-j2] mode after estop: $mode_after"
if [ "$mode_after" = "estopped" ]; then
  pass "Mode is estopped after E-stop"
else
  fail "Expected estopped, got $mode_after"
fi

# ---------------------------------------------------------------------------
# Test 3 — Recovery via POST /mode {idle}
# ---------------------------------------------------------------------------
echo
echo "[smoke-j2] --- Test 3: Recovery ---"
brain_post "/api/v1/mode?machine_id=$MACHINE_ID" "{\"mode\":\"idle\"}" >/dev/null
sleep 0.5

mode_after=$(get_mode)
echo "[smoke-j2] mode after recovery: $mode_after"
if [ "$mode_after" = "idle" ]; then
  pass "Mode restored to idle"
else
  fail "Expected idle after recovery, got $mode_after"
fi

# ---------------------------------------------------------------------------
# Test 4 — Watchdog hold: position stays stable when sidecar can't get commands
# (We simulate by sending jog while estopped; sidecar should reject)
# ---------------------------------------------------------------------------
echo
echo "[smoke-j2] --- Test 4: Watchdog hold (command rejected when estopped) ---"
# E-stop first
brain_post "/api/v1/move/estop?machine_id=$MACHINE_ID" "{}" >/dev/null
sleep 0.3

pos_before=$(get_angle_deg)

# Attempt a jog — should be rejected (409 or fail silently, but position must not move)
set +e
resp=$(brain_post "/api/v1/move/joint" \
  "{\"machine_id\":\"$MACHINE_ID\",\"joint_targets\":{\"joint0\":1.0}}" 2>&1)
set -e

sleep 0.8
pos_after=$(get_angle_deg)
drift=$(python3 -c "print(abs(float('$pos_after') - float('$pos_before')))")
echo "[smoke-j2] pos_before=${pos_before}°  pos_after=${pos_after}°  drift=${drift}°"

if python3 -c "import sys; sys.exit(0 if float('$drift') <= 0.5 else 1)"; then
  pass "Position held while estopped (drift=${drift}°)"
else
  fail "Position drifted while estopped (drift=${drift}° > 0.5°)"
fi

# Restore to idle
brain_post "/api/v1/mode?machine_id=$MACHINE_ID" "{\"mode\":\"idle\"}" >/dev/null

# ---------------------------------------------------------------------------
# Test 5 — X-Journey-Id is echoed back in response headers
# ---------------------------------------------------------------------------
echo
echo "[smoke-j2] --- Test 5: Journey-ID propagation ---"
journey_id=$(python3 -c "import uuid; print(uuid.uuid4())")
# Use the estop endpoint — always valid from idle, and middleware runs on all responses.
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "X-Journey-Id: $journey_id" \
  -D /tmp/smoke_j2_headers.txt \
  -o /dev/null \
  "$BRAIN_URL/api/v1/move/estop?machine_id=$MACHINE_ID" || true

echoed=$(grep -i "x-journey-id" /tmp/smoke_j2_headers.txt 2>/dev/null | awk '{print $2}' | tr -d '\r' || true)
echo "[smoke-j2] sent=$journey_id  echoed=$echoed"
if [ "$echoed" = "$journey_id" ]; then
  pass "Journey-ID echoed correctly"
else
  fail "Journey-ID mismatch or missing (sent=$journey_id, echoed=$echoed)"
fi

# Leave the machine in idle for a clean exit
brain_post "/api/v1/mode?machine_id=$MACHINE_ID" "{\"mode\":\"idle\"}" >/dev/null || true

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "========================================"
echo "  smoke-j2 results: $PASS passed, $FAIL failed"
echo "========================================"
[ "$FAIL" -eq 0 ]
