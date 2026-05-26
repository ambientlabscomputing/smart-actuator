#!/usr/bin/env bash
# smoke-j1.sh — headless smoke test for J1 exit criterion 4.
#
# Starts the full stack, waits for the Brain to be ready, samples
# /api/v1/state?machine_id=j1 twice (1 s apart), asserts that
# joints[0].angle_rad changed between the two samples.
#
# Exit codes: 0 = pass, 1 = fail.

set -euo pipefail

BRAIN_URL="${BRAIN_URL:-http://localhost:8080}"
WAIT_TIMEOUT="${SMOKE_WAIT_SECS:-30}"

echo "[smoke-j1] Waiting for Brain to become ready at $BRAIN_URL ..."
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
until curl -sf "$BRAIN_URL/api/v1/state?machine_id=j1" >/dev/null 2>&1 || \
      [ "$(date +%s)" -ge "$deadline" ]; do
  sleep 0.5
done

echo "[smoke-j1] Sampling state ..."
sample1=$(curl -sf "$BRAIN_URL/api/v1/state?machine_id=j1" || echo '{"measured":[]}')
sleep 1.2
sample2=$(curl -sf "$BRAIN_URL/api/v1/state?machine_id=j1" || echo '{"measured":[]}')

pos1=$(echo "$sample1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['measured'][0]['angle_rad'] if d['measured'] else 'MISSING')" 2>/dev/null || echo "MISSING")
pos2=$(echo "$sample2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['measured'][0]['angle_rad'] if d['measured'] else 'MISSING')" 2>/dev/null || echo "MISSING")

echo "[smoke-j1] joint0 pos1=$pos1  pos2=$pos2"

if [ "$pos1" = "MISSING" ] || [ "$pos2" = "MISSING" ]; then
  echo "[smoke-j1] FAIL: no joint state in response"
  exit 1
fi

if [ "$pos1" = "$pos2" ]; then
  echo "[smoke-j1] FAIL: joint0 position did not change between samples (stuck at $pos1)"
  exit 1
fi

echo "[smoke-j1] PASS: joint0 is moving ($pos1 → $pos2)"
exit 0
