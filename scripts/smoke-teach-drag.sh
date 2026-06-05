#!/usr/bin/env bash
# smoke-teach-drag.sh — end-to-end smoke test for RFD-13 teach (drag mode)
#
# Requires: curl, jq
# Target machine: arm-1780467698718 (3-axis gantry: x_base, y_carriage, z_spindle)
# Usage: ./scripts/smoke-teach-drag.sh [BRAIN_BASE_URL]
#
# Exit 0 = pass, non-zero = fail.

set -euo pipefail

BRAIN="${1:-http://localhost:8000}"
API="${BRAIN}/api/v1"
MACHINE_ID="arm-1780467698718"
PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
info()  { printf '\033[36m  %s\033[0m\n' "$*"; }

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    green "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

# ── 1. Login ──────────────────────────────────────────────────────────────────
info "Logging in as admin…"
LOGIN=$(curl -sf -X POST "${API}/users/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}')
TOKEN=$(echo "$LOGIN" | jq -r '.access_token')
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { red "Login failed"; exit 1; }
AUTH="Authorization: Bearer ${TOKEN}"
info "Token acquired"

# ── 2. Start teach session ────────────────────────────────────────────────────
info "Starting drag teach session on ${MACHINE_ID}…"
SESSION=$(curl -sf -X POST "${API}/machines/${MACHINE_ID}/teach" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"mode":"drag"}')
SESSION_ID=$(echo "$SESSION" | jq -r '.session_id')
STATUS=$(echo "$SESSION" | jq -r '.status')
check "session created (status=armed)" "$([ "$STATUS" = "armed" ] && echo true || echo false)"
info "session_id: ${SESSION_ID}"

# ── 3. Begin recording ────────────────────────────────────────────────────────
info "Transitioning to recording…"
REC=$(curl -sf -X POST "${API}/teach/sessions/${SESSION_ID}/record" \
  -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
STATUS=$(echo "$REC" | jq -r '.status')
check "session now recording" "$([ "$STATUS" = "recording" ] && echo true || echo false)"

# ── 4. Jog + capture three waypoints ─────────────────────────────────────────
JOINTS=("x_base" "y_carriage" "z_spindle")
TARGETS=("0.1" "0.05" "0.2")

for i in 0 1 2; do
  JOINT="${JOINTS[$i]}"
  TARGET="${TARGETS[$i]}"
  info "Jog ${JOINT} → ${TARGET} m…"
  curl -sf -X POST "${API}/move/joint" \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"machine_id\":\"${MACHINE_ID}\",\"joint_targets\":{\"${JOINT}\":${TARGET}}}" > /dev/null

  # Brief settle time (sim responds instantly but give WS time to propagate)
  sleep 0.3

  info "Capturing waypoint $((i+1))…"
  CAP=$(curl -sf -X POST "${API}/teach/sessions/${SESSION_ID}/capture" \
    -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
  WP_COUNT=$(echo "$CAP" | jq '.waypoints | length')
  check "waypoint count = $((i+1))" "$([ "$WP_COUNT" = "$((i+1))" ] && echo true || echo false)"
done

# ── 5. Verify waypoint count ──────────────────────────────────────────────────
SESSION_STATE=$(curl -sf "${API}/machines/${MACHINE_ID}/teach" -H "$AUTH")
TOTAL=$(echo "$SESSION_STATE" | jq '.waypoints | length')
check "total waypoints = 3" "$([ "$TOTAL" = "3" ] && echo true || echo false)"

# ── 6. Save as program ────────────────────────────────────────────────────────
info "Saving session as program 'smoke-teach-1'…"
SAVE=$(curl -sf -X POST "${API}/teach/sessions/${SESSION_ID}/save" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"smoke-teach-1"}')
PROGRAM_ID=$(echo "$SAVE" | jq -r '.program_id')
check "program_id returned" "$([ -n "$PROGRAM_ID" ] && [ "$PROGRAM_ID" != "null" ] && echo true || echo false)"
info "program_id: ${PROGRAM_ID}"

# ── 7. Run the saved program ──────────────────────────────────────────────────
info "Starting program run…"
RUN=$(curl -sf -X POST "${API}/programs/${PROGRAM_ID}/runs" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"machine_id\":\"${MACHINE_ID}\"}")
RUN_ID=$(echo "$RUN" | jq -r '.run_id')
check "run_id returned" "$([ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ] && echo true || echo false)"
info "run_id: ${RUN_ID}"

# Poll until terminal state (max 30 s)
MAX=60
ELAPSED=0
RUN_STATUS="running"
while [ "$RUN_STATUS" = "running" ] && [ $ELAPSED -lt $MAX ]; do
  sleep 0.5
  ELAPSED=$((ELAPSED + 1))
  POLL=$(curl -sf "${API}/programs/${PROGRAM_ID}/runs/${RUN_ID}" -H "$AUTH")
  RUN_STATUS=$(echo "$POLL" | jq -r '.status')
done
check "run reached terminal state" "$([ "$RUN_STATUS" = "completed" ] || [ "$RUN_STATUS" = "succeeded" ] && echo true || echo false)"
info "run status: ${RUN_STATUS}"

# ── 8. Verify final pose ──────────────────────────────────────────────────────
info "Checking final joint positions…"
FINAL_STATE=$(curl -sf "${API}/state?machine_id=${MACHINE_ID}" -H "$AUTH")
LAST_WP=$(echo "$SESSION_STATE" | jq '.waypoints[-1].joint_positions')

# For each gantry joint check within ±2 mm (0.002 m)
for JOINT in "${JOINTS[@]}"; do
  FINAL_POS=$(echo "$FINAL_STATE" | jq --arg j "$JOINT" '
    .measured[] | select(.joint_name == $j) | .position')
  WP_POS=$(echo "$LAST_WP" | jq --arg j "$JOINT" '.[$j]')
  if [ -z "$FINAL_POS" ] || [ "$FINAL_POS" = "null" ] || [ -z "$WP_POS" ] || [ "$WP_POS" = "null" ]; then
    info "  Skipping $JOINT (state unavailable)"
    continue
  fi
  WITHIN=$(python3 -c "import sys; print('true' if abs($FINAL_POS - $WP_POS) < 0.002 else 'false')")
  check "${JOINT} within 2 mm of last waypoint" "$WITHIN"
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────"
printf "  Results: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n" "$PASS" "$FAIL"
echo "────────────────────────────────────────"
[ "$FAIL" -eq 0 ] || exit 1
