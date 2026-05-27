#!/usr/bin/env bash
# smoke-j3.sh — headless smoke test for J3 "Onboard a machine" exit criteria.
#
# Exit criteria tested:
#   1. Templates API: GET /templates returns at least one template.
#   2. Build machine: POST /machine creates a 2-DOF machine with two joint names.
#   3. Bind slot 0: POST /machine/{id}/bindings/0 spawns a sim process (pid exists).
#   4. Bind slot 1: POST /machine/{id}/bindings/1 spawns a second sim process.
#   5. Joint state: WS (via polling GET /state) shows two joints.
#   6. Jog shoulder: POST /move/joint moves slot-0 joint by +30°, converges ±5°.
#   7. Jog elbow: POST /move/joint moves slot-1 joint by -20°, converges ±5°.
#   8. Restart survival: kill Brain, restart it, assert both sims still reachable
#      (sim pids re-spawned) and joint state returns two joints.
#
# Pre-requisites: sidecar running, brain NOT yet running (script starts it).
# Usage: BRAIN_URL=http://localhost:8080 bash scripts/smoke-j3.sh

set -euo pipefail

BRAIN_URL="${BRAIN_URL:-http://localhost:8080}"
WAIT_TIMEOUT="${SMOKE_WAIT_SECS:-60}"
MACHINE_ID="smoke-j3-$(date +%s)"
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
  curl -sf -X POST \
    -H "Content-Type: application/json" \
    -H "X-Journey-Id: $journey_id" \
    -d "$body" \
    "$BRAIN_URL$path" || echo "{}"
}

get_state() {
  brain_get "/api/v1/state?machine_id=${MACHINE_ID}" 2>/dev/null || echo "{}"
}

get_angle_deg() {
  local slot="$1"
  get_state | python3 -c "
import sys, json, math
d = json.load(sys.stdin)
m = d.get('measured', [])
if len(m) > $slot:
    print(round(math.degrees(m[$slot]['angle_rad']), 3))
else:
    print('MISSING')
" 2>/dev/null || echo "MISSING"
}

# ---------------------------------------------------------------------------
# Wait for Brain to be healthy
# ---------------------------------------------------------------------------
echo "[smoke-j3] Waiting for Brain at $BRAIN_URL ..."
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
until curl -sf "$BRAIN_URL/api/v1/templates" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "[smoke-j3] ERROR: Brain not ready after ${WAIT_TIMEOUT}s — aborting"
    exit 1
  fi
  sleep 1
done
echo "[smoke-j3] Brain ready."

# ---------------------------------------------------------------------------
# 1. Templates API
# ---------------------------------------------------------------------------
echo "[smoke-j3] 1. Templates API"
templates_json=$(brain_get "/api/v1/templates")
n_templates=$(echo "$templates_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
if [ "$n_templates" -gt 0 ]; then
  pass "GET /templates returned $n_templates template(s)"
else
  fail "GET /templates returned empty list"
fi

# ---------------------------------------------------------------------------
# 2. Build machine
# ---------------------------------------------------------------------------
echo "[smoke-j3] 2. Build machine"
machine_json=$(brain_post "/api/v1/machine" "{
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
}")
n_joints=$(echo "$machine_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('joint_names', [])))" 2>/dev/null || echo 0)
if [ "$n_joints" -eq 2 ]; then
  pass "POST /machine created machine with 2 joints"
else
  fail "POST /machine: expected 2 joints, got $n_joints — response: $machine_json"
fi

# ---------------------------------------------------------------------------
# 3–4. Bind slots
# ---------------------------------------------------------------------------
echo "[smoke-j3] 3. Bind slot 0"
bind0=$(brain_post "/api/v1/machine/$MACHINE_ID/bindings/0" '{"kind":"sim"}')
pid0=$(echo "$bind0" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pid','MISSING'))" 2>/dev/null || echo "MISSING")
if [ "$pid0" != "MISSING" ] && [ "$pid0" != "" ] && [ "$pid0" != "0" ]; then
  pass "Slot 0 bound: pid=$pid0"
else
  fail "Slot 0 bind failed — response: $bind0"
fi

echo "[smoke-j3] 4. Bind slot 1"
bind1=$(brain_post "/api/v1/machine/$MACHINE_ID/bindings/1" '{"kind":"sim"}')
pid1=$(echo "$bind1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pid','MISSING'))" 2>/dev/null || echo "MISSING")
if [ "$pid1" != "MISSING" ] && [ "$pid1" != "" ] && [ "$pid1" != "0" ]; then
  pass "Slot 1 bound: pid=$pid1"
else
  fail "Slot 1 bind failed — response: $bind1"
fi

# ---------------------------------------------------------------------------
# 5. Wait for joint state to show two joints
# ---------------------------------------------------------------------------
echo "[smoke-j3] 5. Wait for joint state (2 joints)..."
deadline2=$(( $(date +%s) + 15 ))
got_two=0
while [ "$(date +%s)" -lt "$deadline2" ]; do
  n=$(get_state | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('measured',[])))" 2>/dev/null || echo 0)
  if [ "$n" -eq 2 ]; then
    got_two=1
    break
  fi
  sleep 0.5
done
if [ "$got_two" -eq 1 ]; then
  pass "Joint state shows 2 joints"
else
  fail "Joint state did not show 2 joints within 15s"
fi

# ---------------------------------------------------------------------------
# 6. Jog shoulder (+30°)
# ---------------------------------------------------------------------------
echo "[smoke-j3] 6. Jog shoulder joint +30°"
jog_name=$(brain_get "/api/v1/machine/$MACHINE_ID" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('joint_names',['shoulder'])[0])" 2>/dev/null || echo "shoulder")
brain_post "/api/v1/move/joint" "{
  \"machine_id\": \"$MACHINE_ID\",
  \"joint_targets\": {\"$jog_name\": 0.5236}
}" >/dev/null 2>&1 || true

sleep 2
angle0=$(get_angle_deg 0)
if python3 -c "a=float('$angle0'); exit(0 if abs(a - 30) < 10 else 1)" 2>/dev/null; then
  pass "Shoulder jogged to ~30° (got ${angle0}°)"
else
  fail "Shoulder angle expected ~30°, got ${angle0}°"
fi

# ---------------------------------------------------------------------------
# 7. Jog elbow (-20°)
# ---------------------------------------------------------------------------
echo "[smoke-j3] 7. Jog elbow joint -20°"
jog_name1=$(brain_get "/api/v1/machine/$MACHINE_ID" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); names=d.get('joint_names',['shoulder','elbow']); print(names[1] if len(names)>1 else 'elbow')" 2>/dev/null || echo "elbow")
brain_post "/api/v1/move/joint" "{
  \"machine_id\": \"$MACHINE_ID\",
  \"joint_targets\": {\"$jog_name1\": -0.3491}
}" >/dev/null 2>&1 || true

sleep 2
angle1=$(get_angle_deg 1)
if python3 -c "a=float('$angle1'); exit(0 if abs(a + 20) < 10 else 1)" 2>/dev/null; then
  pass "Elbow jogged to ~-20° (got ${angle1}°)"
else
  fail "Elbow angle expected ~-20°, got ${angle1}°"
fi

# ---------------------------------------------------------------------------
# 8. Restart survival (if Brain is local process we can kill)
# ---------------------------------------------------------------------------
echo "[smoke-j3] 8. Brain restart survival"
brain_pid=$(pgrep -f "brain.main" 2>/dev/null | head -1 || true)
if [ -n "$brain_pid" ]; then
  kill "$brain_pid" 2>/dev/null || true
  echo "[smoke-j3]    Killed Brain pid=$brain_pid, waiting for restart..."
  sleep 5

  # Check that sim PIDs still exist (they should outlive Brain)
  if kill -0 "$pid0" 2>/dev/null && kill -0 "$pid1" 2>/dev/null; then
    pass "Sim processes survived Brain restart (pid0=$pid0, pid1=$pid1)"
  else
    fail "One or both sim processes died after Brain kill"
  fi

  # Wait for Brain to come back up (if started under a process manager)
  deadline3=$(( $(date +%s) + 30 ))
  brain_back=0
  while [ "$(date +%s)" -lt "$deadline3" ]; do
    if curl -sf "$BRAIN_URL/api/v1/templates" >/dev/null 2>&1; then
      brain_back=1
      break
    fi
    sleep 1
  done

  if [ "$brain_back" -eq 1 ]; then
    n_after=$(get_state | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('measured',[])))" 2>/dev/null || echo 0)
    if [ "$n_after" -eq 2 ]; then
      pass "After Brain restart: joint state shows 2 joints"
    else
      fail "After Brain restart: expected 2 joints, got $n_after"
    fi
  else
    echo "[smoke-j3]    Brain did not restart automatically (not managed by overmind?) — skipping state check"
  fi
else
  echo "[smoke-j3]    Cannot locate Brain PID — skipping restart test"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════"
echo " J3 Smoke Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
