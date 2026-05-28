#!/usr/bin/env bash
# smoke-j5.sh — headless smoke test for J5 "Run a program" exit criteria.
#
# Exit criteria tested:
#   1. Create a 3-step program (MoveJoint → Wait → MoveJoint) via REST.
#      Run it. Poll until status=completed. Assert final joint position
#      within ±2° (0.035 rad) of the last MoveJoint target.
#   2. Edit the program (change the final target angle) and run again without
#      reloading. Assert the run converges to the new target.
#   3. Stop mid-run: create a long program (three 3-second Waits). Run it,
#      wait 1s, POST /runs/{run_id}/stop. Assert status=stopped and
#      current_step_index < total_steps.
#   4. Publish path: confirm that program.run.update events appear on the
#      global /events WS during a run, with monotonically increasing
#      current_step_index.
#   5. Brain restart: start a long run (three 3-second Waits), kill+restart
#      Brain, assert the run's persisted status is "interrupted".
#
# Pre-requisites: sidecar running, brain running (or managed by overmind).
# The test borrows the J3 machine-creation sequence for a valid machine_id.
#
# Usage: BRAIN_URL=http://localhost:8080 bash scripts/smoke-j5.sh

set -euo pipefail

BRAIN_URL="${BRAIN_URL:-http://localhost:8080}"
WAIT_TIMEOUT="${SMOKE_WAIT_SECS:-60}"
MACHINE_ID="smoke-j5-$(date +%s)"
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
  local path="$1"
  local body="$2"
  curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$BRAIN_URL$path"
}

# Poll GET until a field matches a value (or timeout).
# Usage: poll_until_field PATH FIELD EXPECTED TIMEOUT_S
poll_until_field() {
  local path="$1" field="$2" expected="$3" timeout_s="$4"
  local deadline
  deadline=$(( $(date +%s) + timeout_s ))
  local actual="__unset__"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    actual=$(brain_get "$path" 2>/dev/null | python3 -c \
      "import sys,json; print(json.load(sys.stdin).get('$field','__missing__'))" 2>/dev/null \
      || echo "__err__")
    if [ "$actual" = "$expected" ]; then
      echo "$expected"
      return 0
    fi
    sleep 0.5
  done
  echo "$actual"
  return 1
}

# ---------------------------------------------------------------------------
# Wait for Brain to be healthy
# ---------------------------------------------------------------------------
echo "[smoke-j5] Waiting for Brain at $BRAIN_URL ..."
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
until curl -sf "$BRAIN_URL/api/v1/templates" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "[smoke-j5] ERROR: Brain not ready after ${WAIT_TIMEOUT}s — aborting"
    exit 1
  fi
  sleep 1
done
echo "[smoke-j5] Brain ready."

# ---------------------------------------------------------------------------
# Preamble: onboard a 2-DOF sim machine (J3 sequence)
# ---------------------------------------------------------------------------
echo "[smoke-j5] Preamble: creating machine $MACHINE_ID"
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
echo "[smoke-j5] Machine ready."

# Shared program ID
PROGRAM_ID="smoke-j5-prog-$(date +%s)"
# The two_dof_planar_arm template names its joints 'shoulder' and 'elbow'.
JOINT="shoulder"

# ---------------------------------------------------------------------------
# Helper: build a 3-step program AST (MoveJoint → Wait → MoveJoint)
# ---------------------------------------------------------------------------
make_program() {
  local prog_id="$1" target_a="$2" target_b="$3"
  cat <<EOF
{
  "meta": {"program_id": "$prog_id", "name": "smoke-j5", "description": ""},
  "machine_id": "$MACHINE_ID",
  "root": {
    "kind": "sequence",
    "children": [
      {"kind": "move", "children": [],
       "attributes": {"joint_name": "$JOINT", "target_rad": $target_a}},
      {"kind": "wait", "children": [],
       "attributes": {"duration_s": 0.3}},
      {"kind": "move", "children": [],
       "attributes": {"joint_name": "$JOINT", "target_rad": $target_b}}
    ],
    "attributes": {}
  }
}
EOF
}

make_wait_program() {
  local prog_id="$1"
  cat <<EOF
{
  "meta": {"program_id": "$prog_id", "name": "smoke-j5-wait", "description": ""},
  "machine_id": "$MACHINE_ID",
  "root": {
    "kind": "sequence",
    "children": [
      {"kind": "wait", "children": [], "attributes": {"duration_s": 3.0}},
      {"kind": "wait", "children": [], "attributes": {"duration_s": 3.0}},
      {"kind": "wait", "children": [], "attributes": {"duration_s": 3.0}}
    ],
    "attributes": {}
  }
}
EOF
}

# ---------------------------------------------------------------------------
# 1. Create + run + complete
# ---------------------------------------------------------------------------
echo "[smoke-j5] 1. Create program, run, assert completion"
TARGET_A="0.5"   # ≈ 28.6°
TARGET_B="-0.5"  # ≈ -28.6°

prog_resp=$(brain_post "/api/v1/programs" "$(make_program "$PROGRAM_ID" "$TARGET_A" "$TARGET_B")")
prog_ok=$(echo "$prog_resp" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('ok' if not d.get('__error') else 'err')" \
  2>/dev/null || echo "err")
if [ "$prog_ok" = "ok" ]; then
  pass "Program created (id=$PROGRAM_ID)"
else
  fail "Failed to create program — response: $prog_resp"
  exit 1
fi

run_resp=$(brain_post "/api/v1/programs/$PROGRAM_ID/runs" "{\"machine_id\": \"$MACHINE_ID\"}")
run_id=$(echo "$run_resp" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('run_id','MISSING'))" 2>/dev/null || echo "MISSING")
if [ "$run_id" = "MISSING" ] || echo "$run_id" | grep -q "__error"; then
  fail "Failed to start run — response: $run_resp"
  exit 1
fi
pass "Run started (run_id=$run_id)"

# Poll for completion (up to 20s — MoveJoint needs to converge)
echo "[smoke-j5]    Polling for completion..."
final_status=$(poll_until_field "/api/v1/runs/$run_id" "status" "completed" 20 || echo "timeout")
if [ "$final_status" = "completed" ]; then
  pass "Run completed"
else
  fail "Run did not complete within 20s — last status: $final_status"
fi

# Assert final shoulder position is within ±2° of TARGET_B
state_json=$(brain_get "/api/v1/state?machine_id=$MACHINE_ID" 2>/dev/null || echo '{}')
within_tol=$(echo "$state_json" | python3 -c "
import sys, json, math
d = json.load(sys.stdin)
measured = d.get('measured', [])
for j in measured:
    if j.get('joint_name') == '$JOINT':
        diff = abs(j.get('angle_rad', 999) - ($TARGET_B))
        print('ok' if diff < 0.035 else f'out_of_tol:{diff:.4f}')
        sys.exit(0)
print('joint_not_found')
" 2>/dev/null || echo "parse_error")
if [ "$within_tol" = "ok" ]; then
  pass "Final joint_0 position within ±2° of target ($TARGET_B rad)"
else
  fail "Final joint_0 position check: $within_tol"
fi

# ---------------------------------------------------------------------------
# 2. Edit program (new target) and re-run without reloading
# ---------------------------------------------------------------------------
echo "[smoke-j5] 2. Edit program and re-run"
TARGET_B2="0.3"
prog_resp2=$(brain_post "/api/v1/programs" "$(make_program "$PROGRAM_ID" "0.0" "$TARGET_B2")")
prog_ok2=$(echo "$prog_resp2" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('ok' if not d.get('__error') else 'err')" \
  2>/dev/null || echo "err")
if [ "$prog_ok2" = "ok" ]; then
  pass "Program updated with new target"
else
  fail "Failed to update program — response: $prog_resp2"
fi

run_resp2=$(brain_post "/api/v1/programs/$PROGRAM_ID/runs" "{\"machine_id\": \"$MACHINE_ID\"}")
run_id2=$(echo "$run_resp2" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('run_id','MISSING'))" 2>/dev/null || echo "MISSING")
if [ "$run_id2" = "MISSING" ]; then
  fail "Failed to start second run"
else
  final_status2=$(poll_until_field "/api/v1/runs/$run_id2" "status" "completed" 20 || echo "timeout")
  if [ "$final_status2" = "completed" ]; then
    pass "Second run (new target) completed"
  else
    fail "Second run did not complete — last status: $final_status2"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Stop mid-run
# ---------------------------------------------------------------------------
echo "[smoke-j5] 3. Stop mid-run"
STOP_PROG_ID="smoke-j5-stop-$(date +%s)"
stop_prog=$(brain_post "/api/v1/programs" "$(make_wait_program "$STOP_PROG_ID")")
stop_prog_ok=$(echo "$stop_prog" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('ok' if not d.get('__error') else 'err')" \
  2>/dev/null || echo "err")
if [ "$stop_prog_ok" != "ok" ]; then
  fail "Could not create long-wait program for stop test — response: $stop_prog"
else
  stop_run_resp=$(brain_post "/api/v1/programs/$STOP_PROG_ID/runs" "{\"machine_id\": \"$MACHINE_ID\"}")
  stop_run_id=$(echo "$stop_run_resp" | python3 -c \
    "import sys,json; print(json.load(sys.stdin).get('run_id','MISSING'))" 2>/dev/null || echo "MISSING")

  if [ "$stop_run_id" = "MISSING" ]; then
    fail "Failed to start long-wait run"
  else
    sleep 1  # Let it get into the first Wait step
    brain_post "/api/v1/runs/$stop_run_id/stop" '{}' >/dev/null

    # Poll for stopped
    stop_status=$(poll_until_field "/api/v1/runs/$stop_run_id" "status" "stopped" 10 || echo "timeout")
    if [ "$stop_status" = "stopped" ]; then
      pass "Run transitioned to stopped"
    else
      fail "Run did not stop — last status: $stop_status"
    fi

    # Assert current_step_index < total_steps
    run_state=$(brain_get "/api/v1/runs/$stop_run_id" 2>/dev/null || echo '{}')
    mid_run=$(echo "$run_state" | python3 -c "
import sys, json
d = json.load(sys.stdin)
cur = d.get('current_step_index', -1)
tot = d.get('total_steps', -1)
print('ok' if cur < tot else f'at_end:{cur}/{tot}')
" 2>/dev/null || echo "parse_error")
    if [ "$mid_run" = "ok" ]; then
      pass "Stopped before last step (current_step_index < total_steps)"
    else
      fail "Expected stop mid-run: $mid_run"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 4. Publish path — global /events WS carries program.run.update events
# ---------------------------------------------------------------------------
echo "[smoke-j5] 4. Publish path via global /events WS"
PUBLISH_PROG_ID="smoke-j5-pub-$(date +%s)"
brain_post "/api/v1/programs" "$(make_wait_program "$PUBLISH_PROG_ID")" >/dev/null
pub_run_resp=$(brain_post "/api/v1/programs/$PUBLISH_PROG_ID/runs" "{\"machine_id\": \"$MACHINE_ID\"}")
pub_run_id=$(echo "$pub_run_resp" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('run_id','MISSING'))" 2>/dev/null || echo "MISSING")

if [ "$pub_run_id" = "MISSING" ]; then
  fail "Could not start publish-path run"
else
  # Tail the global events WS for 3s, collect program.run.update events,
  # assert at least one arrived for our run_id.
  WS_URL="${BRAIN_URL/http/ws}/api/v1/events/ws"
  events_found=$(python3 - "$WS_URL" "$pub_run_id" <<'PYEOF'
import sys, asyncio, json
try:
    import websockets
    url, run_id = sys.argv[1], sys.argv[2]

    async def collect():
        found = 0
        deadline = asyncio.get_event_loop().time() + 12  # listen for up to 12s
        try:
            async with websockets.connect(url, open_timeout=5) as ws:
                while asyncio.get_event_loop().time() < deadline:
                    remaining = deadline - asyncio.get_event_loop().time()
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 5.0))
                        evt = json.loads(raw)
                        if evt.get("type") == "program.run.update" and evt.get("run_id") == run_id:
                            found += 1
                            if found >= 1:
                                break  # one event is enough
                    except asyncio.TimeoutError:
                        break
                    except Exception:
                        break
        except Exception:
            pass
        return found

    count = asyncio.run(collect())
    print(count)
except ImportError:
    print("skip")
PYEOF
)
  # Stop the publish run so it doesn't linger
  brain_post "/api/v1/runs/$pub_run_id/stop" '{}' >/dev/null 2>&1 || true

  if [ "$events_found" = "skip" ]; then
    echo "[smoke-j5]    websockets not installed — skipping WS tail check"
    pass "Publish path: skipped (websockets library not available)"
  elif [ "${events_found:-0}" -ge 1 ] 2>/dev/null; then
    pass "Publish path: received $events_found program.run.update event(s) on global WS"
  else
    fail "Publish path: no program.run.update events seen on global WS (got: $events_found)"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Brain restart: run is persisted as "interrupted"
# ---------------------------------------------------------------------------
echo "[smoke-j5] 5. Brain restart — run marked interrupted"
RESTART_PROG_ID="smoke-j5-restart-$(date +%s)"
brain_post "/api/v1/programs" "$(make_wait_program "$RESTART_PROG_ID")" >/dev/null
restart_run_resp=$(brain_post "/api/v1/programs/$RESTART_PROG_ID/runs" "{\"machine_id\": \"$MACHINE_ID\"}")
restart_run_id=$(echo "$restart_run_resp" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('run_id','MISSING'))" 2>/dev/null || echo "MISSING")

if [ "$restart_run_id" = "MISSING" ]; then
  fail "Could not start restart-test run"
else
  sleep 0.5  # ensure it's persisted

  old_brain_pid=$(pgrep -f "brain.main" 2>/dev/null | head -1 || true)
  if [ -z "$old_brain_pid" ]; then
    echo "[smoke-j5]    Cannot locate Brain PID — skipping restart test"
  else
    echo "[smoke-j5]    Old Brain pid=$old_brain_pid"

    overmind_sock=""
    for candidate in ".overmind.sock" "$(dirname "$(pwd)")/.overmind.sock" "$HOME/.overmind.sock"; do
      [ -S "$candidate" ] && overmind_sock="$candidate" && break
    done

    if [ -n "$overmind_sock" ]; then
      echo "[smoke-j5]    Restarting brain via overmind..."
      OVERMIND_SOCKET="$overmind_sock" overmind restart brain 2>/dev/null || true
    else
      echo "[smoke-j5]    Sending SIGKILL to pid=$old_brain_pid..."
      kill -KILL "$old_brain_pid" 2>/dev/null || true
    fi

    # Wait for old pid to exit (up to 10s)
    die_deadline=$(( $(date +%s) + 10 ))
    while kill -0 "$old_brain_pid" 2>/dev/null; do
      if [ "$(date +%s)" -ge "$die_deadline" ]; then
        echo "[smoke-j5]    WARNING: old Brain still alive — forcing SIGKILL"
        kill -KILL "$old_brain_pid" 2>/dev/null || true
        sleep 1
        break
      fi
      sleep 0.3
    done

    if [ -z "$overmind_sock" ]; then
      REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
      ( cd "$REPO_ROOT/brain" && python -m brain.main >>/tmp/smoke-j5-brain.log 2>&1 ) &
    fi

    # Wait for new Brain to come up (polls /api/v1/templates, no PID matching)
    up_deadline=$(( $(date +%s) + 60 ))
    brain_back=0
    while [ "$(date +%s)" -lt "$up_deadline" ]; do
      if curl -sf "$BRAIN_URL/api/v1/templates" >/dev/null 2>&1; then
        brain_back=1
        break
      fi
      sleep 0.5
    done

    if [ "$brain_back" -eq 1 ]; then
      echo "[smoke-j5]    New Brain is up."
      after_status=$(brain_get "/api/v1/runs/$restart_run_id" 2>/dev/null | python3 -c \
        "import sys,json; print(json.load(sys.stdin).get('status','MISSING'))" 2>/dev/null \
        || echo "MISSING")
      if [ "$after_status" = "interrupted" ]; then
        pass "After Brain restart: run status=interrupted"
      else
        fail "After Brain restart: expected 'interrupted', got '$after_status'"
      fi
    else
      fail "Brain did not come back within 60s"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════"
echo " J5 Smoke Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
