#!/usr/bin/env bash
# Throwaway-table probe of hand-state outputs across deal, GET /state, PUT /status, and an action.
# Usage: hand-state-probe.sh <outdir>
set -uo pipefail
OUT=${1:?outdir}
mkdir -p "$OUT"
cd /home/rek/Projects/Nerd/fullring-monorepo/backend
C() { pnpm -s control "$@" 2>/dev/null; }
J() { python3 -c "import json,sys;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }
C login --role=admin >/dev/null

E=$(C call POST /api/v1/tournament/events --role=admin --data='{"name":"verify-backend hand-state probe","startingChip":10000}' | J "d['body']['publicId']")
echo "$E" > "$OUT/event.txt"
C call POST "/api/v1/tournament/events/$E/levels" --role=admin --data='{"levelNumber":1,"smallBlind":100,"bigBlind":200,"ante":0,"durationMinutes":20}' > "$OUT/level.json"
TENANT=$(C call GET "/api/v1/tournament/events/$E" --role=admin | J "d['body'].get('tenantId') or 1")
T=$(C call POST "/api/v1/tournament/events/$E/tables" --role=admin --data="{\"tenantId\":$TENANT,\"tableNumber\":1,\"maxSeats\":9}" | J "d['body']['publicId']")
echo "$T" > "$OUT/table.txt"
for s in 1 2 3; do
  PID=$(C call POST "/api/v1/tournament/events/$E/players" --role=admin --data="{\"mode\":\"create\",\"startingChips\":10000,\"profile\":{\"fullName\":\"verify-backend p$s\"}}" | J "d['body']['playerId']")
  C call POST /api/v1/tournament/seats --role=admin --data="{\"tablePublicId\":\"$T\",\"seatNumber\":$s,\"playerId\":$PID,\"startingStack\":10000}" > "$OUT/seat$s.json"
done
C call GET "/api/v1/tournament/tables/$T/deal-readiness" --role=admin > "$OUT/readiness.json"
C call POST "/api/v1/tournament/tables/$T/hands" --role=admin --data='{"buttonSeat":1,"sbSeat":2,"bbSeat":3,"smallBlind":100,"bigBlind":200,"ante":0,"createdBy":1}' > "$OUT/deal.json"
H=$(J "d['body']['publicId']" < "$OUT/deal.json")
echo "$H" > "$OUT/hand.txt"
C call GET "/api/v1/tournament/hands/$H/state" --role=admin > "$OUT/state-after-deal.json"
python3 - "$OUT" <<'PY'
import json,sys
o=sys.argv[1]
d=json.load(open(f"{o}/deal.json"))['body'].get('handState')
s=json.load(open(f"{o}/state-after-deal.json"))['body']
keys=['status','street','pot','nextSeat','outstandingBet','callAmount','minRaise','allowedActions','pendingSeats','closingSeat','canRedo']
print('deal.handState :', None if d is None else {k:d.get(k) for k in keys})
print('GET /state     :', {k:s.get(k) for k in keys})
PY
