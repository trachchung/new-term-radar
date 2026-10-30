#!/usr/bin/env tsx
/**
 * Hand-tracking golden trace. Plays fixed scenarios through the real local API and
 * records every HTTP response, every /tournament WS message, and final DB rows,
 * normalized (ids, timestamps, uuids stripped) so two runs of different code can be diffed.
 *
 * Usage: tsx hand-tracking-trace.ts <out.json>
 * Needs: local API on CONTROL_API_URL (default http://localhost:3000), DB on localhost:5432.
 * Writes only rows it creates (event name prefix "verify-backend trace"), soft-deleted at the end.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { io, Socket } from 'socket.io-client';

const BASE = process.env.CONTROL_API_URL ?? 'http://localhost:3000';
const API = `${BASE}/api/v1`;
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: hand-tracking-trace.ts <out.json>');
const SEED_USERS = join(__dirname, '../../../../backend/prisma/seed-scripts/data/users.json');

type Json = any;
const trace: { step: string; kind: string; data: Json }[] = [];
let token = '';
let sock: Socket;
let viewer: Socket;
const wsBuf: { event: string; data: Json }[] = [];
const viewerBuf: { event: string; data: Json }[] = [];

const ID_KEYS = /^(id|.*Id|.*_id|publicId|.*PublicId|createdAt|updatedAt|startedAt|endedAt|closedAt|deletedAt|.*At|.*DealtAt|timestamp|ts|seq_ts|requestId|traceId|clientHandId|slug|eventCode|name|fullName|nickname|displayName|playerName|createdBy|updatedBy|deletedBy|actorName|approverName|tenantName|eventName)$/;
const UUIDISH = /\b([a-z]{2,4}_[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/g;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;

function norm(v: Json): Json {
  if (Array.isArray(v)) {
    const out = v.map(norm);
    // Row order of unordered Prisma relations varies run to run; compare as multisets.
    if (out.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      out.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return out;
  }
  if (v && typeof v === 'object') {
    const o: Json = {};
    const keys = Object.keys(v).sort();
    // Maps keyed by int player ids: keep values, drop the fixture-specific keys.
    const intKeyed = keys.length > 0 && keys.every((k) => /^\d{5,}$/.test(k));
    if (intKeyed) return keys.map((k) => norm(v[k])).sort();
    for (const k of keys) {
      // Player creation assigns a random country (key omitted when null): pure fixture noise.
      if (k === 'countryCode' || k === 'country') continue;
      if (ID_KEYS.test(k)) {
        o[k] = '<x>';
        continue;
      }
      o[k] = norm(v[k]);
    }
    return o;
  }
  if (typeof v === 'string') return v.replace(UUIDISH, '<uid>').replace(ISO, '<ts>');
  // Fixture player/hand ids are large ints; chip amounts in the scenario stay under 100k.
  if (typeof v === 'number' && Number.isInteger(v) && v >= 100000) return '<int-id>';
  return v;
}

async function call(step: string, method: string, path: string, body?: Json, record = true): Promise<Json> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed: Json = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (record) trace.push({ step, kind: `http ${method} ${path.replace(UUIDISH, '<uid>')}`, data: { status: res.status, body: norm(parsed) } });
  if (res.status >= 400 && record !== false) {
    // failures are part of the trace; caller decides whether to continue
  }
  return { status: res.status, body: parsed };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function drainWs(step: string): Promise<void> {
  await sleep(700);
  const msgs = wsBuf.splice(0);
  // WS delivery order across emitters is not a contract; sort for a stable diff.
  const items = msgs.map((m) => ({ event: m.event, data: norm(m.data) }));
  items.sort((a, b) => (a.event + JSON.stringify(a.data)).localeCompare(b.event + JSON.stringify(b.data)));
  trace.push({ step, kind: 'ws /tournament', data: items });
  // Viewer table-state: only the per-seat street commits (chip pucks) are asserted here.
  const commits = viewerBuf.splice(0)
    .map((m) => m.data?.streetCommits ?? m.data?.patch?.streetCommits ?? m.data?.state?.streetCommits)
    .filter((c) => c !== undefined)
    .map((c) => JSON.stringify(norm(c)));
  trace.push({ step, kind: 'ws /event-viewer streetCommits', data: [...new Set(commits)].sort() });
}

async function state(step: string, hand: string) {
  await call(step, 'GET', `/tournament/hands/${hand}/state`);
}

async function main() {
  // TRACE_DATABASE_URL=none skips the DB snapshot (remote envs without DB access).
  const dbUrl = process.env.TRACE_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
  const db = dbUrl === 'none' ? null : new Client({ connectionString: dbUrl });
  await db?.connect();

  const admin = JSON.parse(readFileSync(SEED_USERS, 'utf8')).users.find((u: Json) => u.role === 'admin');
  const login = await fetch(`${API}/auth/email/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: admin.password }),
  }).then((r) => r.json());
  token = login.accessToken;
  if (!token) throw new Error(`login failed: ${JSON.stringify(login).slice(0, 200)}`);

  // ── fixture: event, level, table, 4 seated players ──
  // Event create falls back to tenant id 1, which not every env has; pass the tenant explicitly when known.
  const ev = await call('setup', 'POST', '/tournament/events', {
    name: 'verify-backend trace', startingChip: 10000,
    ...(process.env.TRACE_TENANT_PUBLIC_ID ? { tenantPublicId: process.env.TRACE_TENANT_PUBLIC_ID } : {}),
  }, false);
  const E = ev.body.publicId;
  if (!E) throw new Error(`event create: ${ev.status} ${JSON.stringify(ev.body)}`);
  const tenantId = Number(process.env.TRACE_TENANT_ID ?? 1);
  await call('setup', 'POST', `/tournament/events/${E}/levels`, { levelNumber: 1, smallBlind: 100, bigBlind: 200, ante: 0, durationMinutes: 20 }, false);
  const tbl = await call('setup', 'POST', `/tournament/events/${E}/tables`, { tenantId, tableNumber: 1, maxSeats: 9 }, false);
  const T = tbl.body.publicId;
  if (!T) throw new Error(`table create: ${tbl.status} ${JSON.stringify(tbl.body)}`);
  const stacks = [10000, 10000, 3000, 10000];
  const pid: Record<number, number> = {};
  for (let s = 1; s <= 4; s++) {
    const p = await call('setup', 'POST', `/tournament/events/${E}/players`, { mode: 'create', startingChips: stacks[s - 1], profile: { fullName: `verify-backend trace p${s}` } }, false);
    // Seats FK tournament_players.id, but the player DTO only exposes the global players.id.
    // Locally the two often coincide; on other envs they do not, so resolve it from the DB when we can.
    pid[s] = p.body.playerId;
    if (db) {
      const r = await db.query('select id from tournament_players where public_id=$1', [p.body.publicId]);
      pid[s] = r.rows[0].id;
    }
    const seat = await call('setup', 'POST', '/tournament/seats', { tablePublicId: T, seatNumber: s, playerId: pid[s], startingStack: stacks[s - 1] }, false);
    if (seat.status >= 400) throw new Error(`seat ${s}: ${JSON.stringify(seat.body)}`);
  }

  sock = io(`${BASE}/tournament`, { transports: ['websocket'], auth: { token } });
  sock.onAny((event, data) => wsBuf.push({ event, data }));
  await new Promise<void>((res, rej) => { sock.on('connect', () => res()); sock.on('connect_error', rej); });
  sock.emit('join-table', T);
  viewer = io(`${BASE}/event-viewer`, { transports: ['websocket'], auth: { token } });
  viewer.onAny((event, data) => viewerBuf.push({ event, data }));
  await new Promise<void>((res, rej) => { viewer.on('connect', () => res()); viewer.on('connect_error', rej); });
  viewer.emit('subscribe-table', T);
  await sleep(300);
  wsBuf.splice(0);
  viewerBuf.splice(0);

  const act = (step: string, hand: string, seat: number, street: string, actionType: string, extra: Json = {}) =>
    call(step, 'POST', `/tournament/hands/${hand}/actions`, { street, seatNumber: seat, playerId: pid[seat], actionType, ...extra });

  // ── Hand 1: full streets, check-down with a bet, board, hole cards, showdown close, correction ──
  let h = await call('h1 deal', 'POST', `/tournament/tables/${T}/hands`, { buttonSeat: 1, sbSeat: 2, bbSeat: 3, smallBlind: 100, bigBlind: 200, ante: 0, createdBy: 1 });
  const H1 = h.body.publicId;
  await drainWs('h1 deal');
  await state('h1 after deal', H1);
  await act('h1 utg call', H1, 4, 'preflop', 'call', { amount: 200 });
  await act('h1 btn call', H1, 1, 'preflop', 'call', { amount: 200 });
  await act('h1 sb call', H1, 2, 'preflop', 'call', { amount: 100 });
  await state('h1 bb option', H1);
  await act('h1 bb check', H1, 3, 'preflop', 'check');
  await drainWs('h1 preflop');
  await state('h1 after preflop', H1);
  await call('h1 flop', 'PUT', `/tournament/hands/${H1}/board`, { flop1: 'Ah', flop2: 'Kd', flop3: '7c' });
  await state('h1 flop state', H1);
  await act('h1 sb check', H1, 2, 'flop', 'check');
  await act('h1 bb bet', H1, 3, 'flop', 'bet', { amount: 400 });
  await state('h1 facing bet', H1);
  await act('h1 utg fold', H1, 4, 'flop', 'fold');
  await act('h1 btn raise', H1, 1, 'flop', 'raise', { amount: 1200, amountTo: 1200 });
  await state('h1 facing raise', H1);
  await act('h1 sb fold', H1, 2, 'flop', 'fold');
  await act('h1 bb call', H1, 3, 'flop', 'call', { amount: 800 });
  await sleep(700);
  {
    // Dead window after the closing call flips flop->turn: the viewer must still show the flop pucks.
    const last = [...viewerBuf].reverse().find((m) => (m.data?.streetCommits ?? m.data?.patch?.streetCommits) !== undefined);
    trace.push({ step: 'h1 dead window', kind: 'viewer last streetCommits', data: norm(last?.data?.streetCommits ?? last?.data?.patch?.streetCommits ?? null) });
  }
  await drainWs('h1 flop');
  await call('h1 turn', 'PUT', `/tournament/hands/${H1}/board`, { turn: '2s' });
  await act('h1 bb check t', H1, 3, 'turn', 'check');
  await act('h1 btn check t', H1, 1, 'turn', 'check');
  await call('h1 river', 'PUT', `/tournament/hands/${H1}/board`, { river: '9h' });
  await act('h1 bb check r', H1, 3, 'river', 'check');
  await act('h1 btn check r', H1, 1, 'river', 'check');
  await state('h1 before showdown', H1);
  await call('h1 hole 1', 'PUT', `/tournament/hands/${H1}/hole-cards`, { seatNumber: 1, cards: ['As', 'Qs'] });
  await call('h1 hole 3', 'PUT', `/tournament/hands/${H1}/hole-cards`, { seatNumber: 3, cards: ['Kh', 'Kc'] });
  await drainWs('h1 turn-river');
  await call('h1 close', 'POST', `/tournament/hands/${H1}/close`, { winners: [{ seat: 3, amountWon: 3200 }] });
  await drainWs('h1 close');
  await state('h1 after close', H1);
  await call('h1 replay', 'GET', `/tournament/hands/${H1}/replay`);
  await call('h1 correction', 'PUT', `/tournament/hands/${H1}/correction`, { reason: 'trace', winners: [{ seat: 1, amountWon: 3200 }] });
  await drainWs('h1 correction');
  await state('h1 after correction', H1);
  await call('h1 get', 'GET', `/tournament/hands/${H1}`);

  // ── Hand 2: undo / redo, short-stack all-in, side pot, auto-evaluate close ──
  h = await call('h2 deal', 'POST', `/tournament/tables/${T}/hands`, { buttonSeat: 2, sbSeat: 3, bbSeat: 4, smallBlind: 100, bigBlind: 200, ante: 0, createdBy: 1 });
  const H2 = h.body.publicId;
  await drainWs('h2 deal');
  await state('h2 after deal', H2);
  await act('h2 utg raise', H2, 1, 'preflop', 'raise', { amount: 600, amountTo: 600 });
  await state('h2 after raise', H2);
  await call('h2 undo', 'DELETE', `/tournament/hands/${H2}/actions/last`);
  await state('h2 after undo', H2);
  await call('h2 redo', 'POST', `/tournament/hands/${H2}/actions/redo`);
  await state('h2 after redo', H2);
  await act('h2 btn call', H2, 2, 'preflop', 'call', { amount: 600 });
  await act('h2 sb allin', H2, 3, 'preflop', 'all_in', { isAllIn: true });
  await state('h2 after allin', H2);
  await act('h2 bb fold', H2, 4, 'preflop', 'fold');
  await act('h2 utg call', H2, 1, 'preflop', 'call');
  await act('h2 btn call2', H2, 2, 'preflop', 'call');
  await state('h2 after preflop', H2);
  await drainWs('h2 preflop');
  await call('h2 flop', 'PUT', `/tournament/hands/${H2}/board`, { flop1: '2c', flop2: '7d', flop3: 'Tc' });
  await act('h2 utg check', H2, 1, 'flop', 'check');
  await act('h2 btn bet', H2, 2, 'flop', 'bet', { amount: 1000 });
  await act('h2 utg fold', H2, 1, 'flop', 'fold');
  await state('h2 flop done', H2);
  await call('h2 turn', 'PUT', `/tournament/hands/${H2}/board`, { turn: 'Js' });
  await call('h2 river', 'PUT', `/tournament/hands/${H2}/board`, { river: '3h' });
  await state('h2 runout', H2);
  await call('h2 showdown', 'PUT', `/tournament/hands/${H2}/showdown`, {
    players: [
      { playerId: pid[2], seatNumber: 2, holeCards: ['Ad', 'Ac'], cardsShown: true },
      { playerId: pid[3], seatNumber: 3, holeCards: ['Kd', 'Ks'], cardsShown: true },
    ],
  });
  await state('h2 after showdown', H2);
  await drainWs('h2 postflop');
  await call('h2 close', 'POST', `/tournament/hands/${H2}/close`, { winners: [], autoEvaluate: true, minChip: 100 });
  await drainWs('h2 close');
  await state('h2 after close', H2);
  await call('h2 replay', 'GET', `/tournament/hands/${H2}/replay`);

  // ── Hand 3: status change route + void (hard delete of latest hand) ──
  h = await call('h3 deal', 'POST', `/tournament/tables/${T}/hands`, { buttonSeat: 4, sbSeat: 1, bbSeat: 2, smallBlind: 100, bigBlind: 200, ante: 0, createdBy: 1 });
  const H3 = h.body.publicId;
  await drainWs('h3 deal');
  await act('h3 btn fold', H3, 4, 'preflop', 'fold');
  await act('h3 sb call', H3, 1, 'preflop', 'call');
  await act('h3 bb check', H3, 2, 'preflop', 'check');
  // The street advance is persisted write-behind (setImmediate); wait so the status call
  // races neither way. Without this, local runs saw the stale preflop row and returned 200.
  await sleep(1000);
  await call('h3 status flop', 'PUT', `/tournament/hands/${H3}/status`, { status: 'turn' });
  await drainWs('h3 status');
  await state('h3 after status', H3);
  await call('h3 current', 'GET', `/tournament/tables/${T}/hands/current`);
  await call('h3 lineup', 'GET', `/tournament/tables/${T}/hand-lineup`);
  await call('h3 void', 'DELETE', `/tournament/hands/${H3}`);
  await drainWs('h3 void');
  await call('h3 get after void', 'GET', `/tournament/hands/${H3}`);

  // ── final DB state ──
  const q = async (label: string, sql: string, params: Json[]) => {
    const r = await db.query(sql, params);
    trace.push({ step: 'db', kind: label, data: norm(r.rows) });
  };
  if (db) {
  const tid = (await db.query('select id from tournament_event_tables where public_id=$1', [T])).rows[0].id;
  await q('hands', `select hand_number, status, pot_total::text, button_seat, sb_seat, bb_seat, skip_sb, skip_button, small_blind::text, big_blind::text, ended_at is not null as ended, manual_overrides from tournament_hands where table_id=$1 order by hand_number`, [tid]);
  await q('actions', `select h.hand_number, a.sequence_no, a.street, a.seat_number, a.action_type, a.amount::text, a.amount_to::text, a.is_all_in, a.pot_after::text, a.stack_after::text, a.undone from hand_actions a join tournament_hands h on h.id=a.hand_id where h.table_id=$1 order by h.hand_number, a.sequence_no, a.undone`, [tid]);
  await q('snapshots', `select h.hand_number, s.seat_number, s.stack_before::text, s.stack_after::text, s.is_active, s.hole_cards, s.cards_shown, s.is_mucked, s.position from hand_player_snapshots s join tournament_hands h on h.id=s.hand_id where h.table_id=$1 order by h.hand_number, s.seat_number`, [tid]);
  await q('seat states', `select seat_number, status, current_stack::text, stack_delta_last_hand::text, peak_stack::text, finish_position from tournament_player_seat_states where table_id=$1 order by seat_number, status`, [tid]);
  await q('board', `select h.hand_number, b.flop_1, b.flop_2, b.flop_3, b.turn, b.river, b.flop_dealt_after_seq, b.turn_dealt_after_seq, b.river_dealt_after_seq from board_runouts b join tournament_hands h on h.id=b.hand_id where h.table_id=$1 order by h.hand_number`, [tid]);
  await q('settlements', `select h.hand_number, s.main_pot_amount::text, s.total_pot::text, s.override_reason, s.engine_verdict from hand_settlements s join tournament_hands h on h.id=s.hand_id where h.table_id=$1 order by h.hand_number`, [tid]);
  }

  sock.close();
  viewer.close();
  await call('cleanup', 'DELETE', `/tournament/events/${E}`, undefined, false);
  await db?.end();
  writeFileSync(OUT, JSON.stringify(trace, null, 2));
  const errors = trace.filter((t) => t.kind.startsWith('http') && t.data.status >= 400).map((t) => `${t.step} ${t.data.status} ${JSON.stringify(t.data.body).slice(0, 160)}`);
  console.log(JSON.stringify({ ok: true, steps: trace.length, httpErrors: errors }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
