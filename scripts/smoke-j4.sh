#!/usr/bin/env bash
# smoke-j4.sh — headless smoke test for J4 "Calibrate" exit criteria.
#
# Exit criteria tested:
#   1. Start a calibration job via REST — returns job_id and status "started".
#   2. GET the job — returns the same state (status "started").
#   3. Advance the job — transitions to "waiting_for_home".
#   4. Advance again  — transitions through "running_sweep" to "completed".
#   5. Completed job result contains expected keys (offset_rad, gain, range).
#   6. Brain restart mid-job: after advance #1, kill+restart Brain, assert job
#      is still readable with the pre-restart status.
#   7. Abort path: start a new job, abort it, assert subsequent advance returns
#      an HTTP error (4xx).
#
# Pre-requisites: sidecar running, brain running (or managed by overmind).
# The test borrows the J3 machine-creation sequence to get a valid machine_id.
#
# Usage: BRAIN_URL=http://localhost:8080 bash scripts/smoke-j4.sh

set -euo pipefail

BRAIN_URL="${BRAIN_URL:-http://localhost:8080}"
WAIT_TIMEOUT="${SMOKE_WAIT_SECS:-60}"
MACHINE_ID="smoke-j4-$(date +%s)"
JOINT_INDEX=0
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
  local path="$1"
  local body="$2"
  local journey_id
  journey_id=$(python3 -c "import uuid; print(uuid.uuid4())")
  local tmp_body http_status resp
  tmp_body=$(mktemp)
  http_status=$(curl -s -o "$tmp_body" -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "X-Journey-Id: $journey_id" \
    -d "$body" \
    "$BRAIN_URL$path" 2>/dev/null)
  resp=$(cat "$tmp_body")
  rm -f "$tmp_body"
  if [[ "$http_status" -ge 200 && "$http_status" -lt 300 ]] 2>/dev/null; then
    echo "$resp"
  else
    echo "{\"__error\":true,\"__status\":\"$http_status\",\"__body\":\"$(echo "$resp" | head -c 300 | tr '"' "'")\"}"
  fi
}

brain_post_expect_fail() {
  # Like brain_post but expects a 4xx — returns the HTTP status code
  local path="$1"
  local body="$2"
  curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$BRAIN_URL$path"
}

# ---------------------------------------------------------------------------
# Wait for Brain to be healthy
# ---------------------------------------------------------------------------
echo "[smoke-j4] Waiting for Brain at $BRAIN_URL ..."
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
until curl -sf "$BRAIN_URL/api/v1/templates" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "[smoke-j4] ERROR: Brain not ready after ${WAIT_TIMEOUT}s — aborting"
    exit 1
  fi
  sleep 1
done
echo "[smoke-j4] Brain ready."

# ---------------------------------------------------------------------------
# Preamble: onboard a 2-DOF machine (J3 sequence) so we have a valid machine
# ---------------------------------------------------------------------------
echo "[smoke-j4] Preamble: creating machine $MACHINE_ID"
brain_post "/api/v1/machine" "{
  \"machine_id\": \"$MACHINE_ID\",
  \"template_ref\": {
    \"source\": \"in-tree\",
    \"template_id\": \"two_dof_planar_arm\",
    \"version\": \"1.0.0\",
    \"content_hash\": \"in-tree\",
    \"ref\": \"in-tree\"
  },
  \"parameters\": {
    \"link0_length_m\": 0.4,
    \"link1_length_m\": 0.35,
    \"link_radius_m\": 0.03,
    \"joint0_limit_deg\": 180,
    \"joint1_limit_deg\": 150,
    \"link0_mass_kg\": 0.5,
    \"link1_mass_kg\": 0.3
  },
  \"actuator_bindings\": []
}" >/dev/null
brain_post "/api/v1/machine/$MACHINE_ID/bindings/0" '{"kind":"sim"}' >/dev/null
brain_post "/api/v1/machine/$MACHINE_ID/bindings/1" '{"kind":"sim"}' >/dev/null
echo "[smoke-j4] Machine ready."

# ---------------------------------------------------------------------------
# 1. Start calibration job
# ---------------------------------------------------------------------------
echo "[smoke-j4] 1. Start calibration job for joint $JOINT_INDEX"
cal_json=$(brain_post "/api/v1/machines/$MACHINE_ID/calibrations" \
  "{\"joint_index\": $JOINT_INDEX}")
job_id=$(echo "$cal_json" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('job_id','MISSING'))" 2>/dev/null || echo "MISSING")
status=$(echo "$cal_json" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('status','MISSING'))" 2>/dev/null || echo "MISSING")

if [ "$job_id" != "MISSING" ] && [ "$status" = "started" ]; then
  pass "Job created: job_id=$job_id status=$status"
else
  fail "Failed to start calibration job — response: $cal_json"
  exit 1  # Cannot continue without a valid job_id
fi

# ---------------------------------------------------------------------------
# 2. GET the job — must return matching state
# ---------------------------------------------------------------------------
echo "[smoke-j4] 2. GET /calibrations/$job_id"
got_json=$(brain_get "/api/v1/calibrations/$job_id")
got_status=$(echo "$got_json" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('status','MISSING'))" 2>/dev/null || echo "MISSING")
got_id=$(echo "$got_json" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('job_id','MISSING'))" 2>/dev/null || echo "MISSING")

if [ "$got_id" = "$job_id" ] && [ "$got_status" = "started" ]; then
  pass "GET job returned correct state (status=$got_status)"
else
  fail "GET job returned unexpected state — response: $got_json"
fi

# ---------------------------------------------------------------------------
# 3. Advance #1 — should transition to waiting_for_home
# ---------------------------------------------------------------------------
echo "[smoke-j4] 3. Advance job (started → waiting_for_home)"
adv1=$(brain_post "/api/v1/calibrations/$job_id/advance" '{}')
adv1_status=$(echo "$adv1" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('status','MISSING'))" 2>/dev/null || echo "MISSING")

if [ "$adv1_status" = "waiting_for_home" ]; then
  pass "Advance #1 → waiting_for_home"
else
  fail "Advance #1 expected 'waiting_for_home', got '$adv1_status' — response: $adv1"
fi

# ---------------------------------------------------------------------------
# 6. Brain restart survival (kill after advance #1, before advance #2)
# ---------------------------------------------------------------------------
echo "[smoke-j4] 6. Brain restart survival"
old_brain_pid=$(pgrep -f "brain.main" 2>/dev/null | head -1 || true)
if [ -n "$old_brain_pid" ]; then
  echo "[smoke-j4]    Old Brain pid=$old_brain_pid"

  # Prefer overmind restart (keeps the process managed); fall back to manual.
  overmind_sock=""
  for candidate in ".overmind.sock" "$(dirname "$(pwd)")/.overmind.sock"; do
    [ -S "$candidate" ] && overmind_sock="$candidate" && break
  done

  if [ -n "$overmind_sock" ]; then
    echo "[smoke-j4]    Restarting Brain via overmind..."
    OVERMIND_SOCKET="$overmind_sock" overmind restart brain 2>/dev/null || true
  else
    echo "[smoke-j4]    Restarting Brain directly (kill + re-exec)..."
    kill "$old_brain_pid" 2>/dev/null || true
  fi

  # 1) Wait for the OLD pid to actually die (up to 30s — sim/grpc cleanup is slow).
  echo "[smoke-j4]    Waiting for old Brain pid=$old_brain_pid to exit..."
  die_deadline=$(( $(date +%s) + 30 ))
  while kill -0 "$old_brain_pid" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$die_deadline" ]; then
      echo "[smoke-j4]    WARNING: old Brain pid=$old_brain_pid still alive after 30s"
      break
    fi
    sleep 0.3
  done

  # 2) If we did a manual kill, re-exec the brain ourselves.
  if [ -z "$overmind_sock" ]; then
    ( cd "$(dirname "$0")/../brain" && python -m brain.main >/dev/null 2>&1 ) &
  fi

  # 3) Wait for a NEW pid to appear AND for /templates to answer 200.
  echo "[smoke-j4]    Waiting for new Brain (up to 60s)..."
  up_deadline=$(( $(date +%s) + 60 ))
  brain_back=0
  new_brain_pid=""
  while [ "$(date +%s)" -lt "$up_deadline" ]; do
    candidate_pid=$(pgrep -f "brain.main" 2>/dev/null | head -1 || true)
    if [ -n "$candidate_pid" ] && [ "$candidate_pid" != "$old_brain_pid" ]; then
      if curl -sf "$BRAIN_URL/api/v1/templates" >/dev/null 2>&1; then
        new_brain_pid="$candidate_pid"
        brain_back=1
        break
      fi
    fi
    sleep 0.5
  done

  if [ "$brain_back" -eq 1 ]; then
    echo "[smoke-j4]    New Brain pid=$new_brain_pid ready."
    after_restart=$(brain_get "/api/v1/calibrations/$job_id" 2>/dev/null || echo '{}')
    after_status=$(echo "$after_restart" | python3 -c \
      "import sys,json; print(json.load(sys.stdin).get('status','MISSING'))" 2>/dev/null || echo "MISSING")
    if [ "$after_status" = "waiting_for_home" ]; then
      pass "After Brain restart: job still readable with status=$after_status"
    else
      fail "After Brain restart: expected 'waiting_for_home', got '$after_status'"
    fi
  else
    fail "Brain did not come back within 60s after restart (last pid=$candidate_pid)"
  fi
else
  echo "[smoke-j4]    Cannot locate Brain PID — skipping restart test"
fi

# ---------------------------------------------------------------------------
# 4. Advance #2 — should transition through running_sweep to completed
# ---------------------------------------------------------------------------
echo "[smoke-j4] 4. Advance job (waiting_for_home → running_sweep → completed)"
adv2=$(brain_post "/api/v1/calibrations/$job_id/advance" '{}')
adv2_status=$(echo "$adv2" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('status','MISSING'))" 2>/dev/null || echo "MISSING")

# The stub advances running_sweep → completed asynchronously in one tick,
# so polling for completed is correct here.
if [ "$adv2_status" = "running_sweep" ] || [ "$adv2_status" = "completed" ]; then
  # If still running_sweep, poll briefly for completion
  if [ "$adv2_status" = "running_sweep" ]; then
    deadline3=$(( $(date +%s) + 10 ))
    while [ "$(date +%s)" -lt "$deadline3" ]; do
      adv2_status=$(brain_get "/api/v1/calibrations/$job_id" | python3 -c \
        "import sys,json; print(json.load(sys.stdin).get('status','MISSING'))" 2>/dev/null || echo "MISSING")
      [ "$adv2_status" = "completed" ] && break
      sleep 0.5
    done
  fi
  if [ "$adv2_status" = "completed" ]; then
    pass "Advance #2 → completed"
  else
    fail "Job did not reach 'completed' within 10s — last status: $adv2_status"
  fi
else
  fail "Advance #2 expected 'running_sweep' or 'completed', got '$adv2_status' — response: $adv2"
fi

# ---------------------------------------------------------------------------
# 5. Completed job has expected result keys
# ---------------------------------------------------------------------------
echo "[smoke-j4] 5. Check result payload"
final_json=$(brain_get "/api/v1/calibrations/$job_id")
has_keys=$(echo "$final_json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
r = d.get('result', {})
keys = {'offset_rad', 'gain', 'range'}
missing = keys - r.keys()
print('ok' if not missing else f'missing: {missing}')
" 2>/dev/null || echo "MISSING")
if [ "$has_keys" = "ok" ]; then
  pass "Result payload contains expected keys (offset_rad, gain, range)"
else
  fail "Result payload check failed: $has_keys — response: $final_json"
fi

# ---------------------------------------------------------------------------
# 7. Abort path — advance on aborted job must fail
# ---------------------------------------------------------------------------
echo "[smoke-j4] 7. Abort path"
abort_cal=$(brain_post "/api/v1/machines/$MACHINE_ID/calibrations" \
  "{\"joint_index\": 1}")
abort_job_id=$(echo "$abort_cal" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('job_id','MISSING'))" 2>/dev/null || echo "MISSING")

if [ "$abort_job_id" = "MISSING" ]; then
  fail "Could not start a second calibration job for abort test"
else
  # Abort it
  brain_post "/api/v1/calibrations/$abort_job_id/abort" '{}' >/dev/null

  # Subsequent advance must return a 4xx
  http_code=$(brain_post_expect_fail "/api/v1/calibrations/$abort_job_id/advance" '{}')
  if [[ "$http_code" =~ ^4 ]]; then
    pass "Abort path: advance after abort returned HTTP $http_code"
  else
    fail "Abort path: expected 4xx, got HTTP $http_code"
  fi

  # Confirm status is aborted
  aborted_status=$(brain_get "/api/v1/calibrations/$abort_job_id" | python3 -c \
    "import sys,json; print(json.load(sys.stdin).get('status','MISSING'))" 2>/dev/null || echo "MISSING")
  if [ "$aborted_status" = "aborted" ]; then
    pass "Aborted job status is 'aborted'"
  else
    fail "Aborted job status expected 'aborted', got '$aborted_status'"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════"
echo " J4 Smoke Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
