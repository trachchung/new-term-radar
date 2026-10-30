#!/usr/bin/env bash
# Drive a hand to the BB-option spot (UTG call, SB call) and compare deal/GET/status/voice-equivalent reads.
# Usage: hand-state-bb-option.sh <outdir>   (expects hand-state-probe.sh to have run into <outdir>)
set -uo pipefail
OUT=${1:?outdir}
cd /home/rek/Projects/Nerd/fullring-monorepo/backend
C() { pnpm -s control "$@" 2>/dev/null; }
H=$(cat "$OUT/hand.txt")
KEYS="['status','street','pot','nextSeat','outstandingBet','callAmount','minRaise','allowedActions','pendingSeats','closingSeat']"
show() { python3 -c "import json,sys;d=json.load(open(sys.argv[1]));b=d.get('body') or {};b=b.get('handState',b) if isinstance(b,dict) else b;print(sys.argv[2], d.get('status'), {k:(b or {}).get(k) for k in $KEYS})" "$1" "$2"; }
pid() { python3 -c "import json;print(json.load(open('$OUT/seat$1.json'))['body']['playerId'])"; }
C call POST "/api/v1/tournament/hands/$H/actions" --role=admin --data="{\"street\":\"preflop\",\"seatNumber\":1,\"playerId\":$(pid 1),\"actionType\":\"call\",\"amount\":200}" > "$OUT/act1.json"
show "$OUT/act1.json" "after UTG call (action resp)"
C call POST "/api/v1/tournament/hands/$H/actions" --role=admin --data="{\"street\":\"preflop\",\"seatNumber\":2,\"playerId\":$(pid 2),\"actionType\":\"call\",\"amount\":100}" > "$OUT/act2.json"
show "$OUT/act2.json" "after SB call  (action resp)"
C call GET "/api/v1/tournament/hands/$H/state" --role=admin > "$OUT/state-bb-option.json"
show "$OUT/state-bb-option.json" "GET /state at BB option  "
