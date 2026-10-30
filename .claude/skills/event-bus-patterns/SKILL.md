---
name: event-bus-patterns
description: The project's signature backend pattern — DomainEvent + EventBusService.emit() routing to BullMQ (durable) or EventEmitter2 (ephemeral), with the transactional outbox guaranteeing at-least-once delivery for durable events. Activate FIRST when adding a new event class, emitting from a service, consuming with @OnDomainEvent, or debugging "the event didn't fire" / "the WS message arrived before the row existed" bugs. Covers DomainEvent base class, durability semantics, outbox poller (FOR UPDATE SKIP LOCKED), QueueName registry, per-MODULES_SET wiring (forFull vs forEmitter), idempotency via UUID v7 eventId, the actor + trace metadata envelope, and the "no emit inside $transaction without {tx}" rule (real fixed bug).
---

# EventBus + Transactional Outbox

The project routes domain events through `EventBusService.emit()` to one of two channels per event class:

- **Durable** → BullMQ queue. At-least-once delivery. Survives crashes via the transactional outbox.
- **Ephemeral** → `EventEmitter2` synchronous channel. Fire-and-forget. WS broadcasts, in-process listeners.

Some event classes dispatch to BOTH (the `ephemeralAlias` static).

This skill is the authoritative guide. New events MUST follow these conventions or downstream consumers / WS clients / audit logs / activity feeds break silently.

## 0. Quick reference

| API | Where | Used for |
|---|---|---|
| `EventBusService.emit(event, { tx? })` | `src/shared/event-bus/event-bus.service.ts` | Single entry point for all event publication |
| `extends DomainEvent<TPayload>` | `src/shared/event-bus/domain-event.ts` | Base class for every event |
| `static readonly durability = 'durable' \| 'ephemeral'` | DomainEvent subclass | Picks the channel |
| `static readonly queueName = QueueName.X` | DomainEvent subclass (durable only) | BullMQ queue |
| `static readonly ephemeralAlias = 'channel.name'` | DomainEvent subclass (optional) | ALSO fire on EventEmitter2 |
| `@OnDomainEvent(EventClass)` | `src/shared/event-bus/decorators/on-domain-event.decorator.ts` | Handler method decorator |
| `EventBusModule.forFull()` | `src/shared/event-bus/event-bus.module.ts` | Emit + poller + workers (monolith, background) |
| `EventBusModule.forEmitter()` | `src/shared/event-bus/event-bus.module.ts` | Emit-only (api, admin_backend, user_backend) |

## 1. The DomainEvent base class

```typescript
import { DomainEvent } from '@/shared/event-bus';
import { QueueName } from '@/shared/event-bus/queue-names';

export class HandClosedDomainEvent extends DomainEvent<HandClosedPayload> {
  // Required overrides
  readonly eventType = 'tournament.hand.closed';
  readonly aggregate = {
    type: 'TournamentHand',
    id: this.payload.handId,
    publicId: this.payload.handPublicId,
  };
  readonly payload: HandClosedPayload;

  // Routing metadata — static, read by EventBus.emit()
  static readonly durability = 'durable';
  static readonly queueName = QueueName.ACTIVITY;
  static readonly ephemeralAlias = 'hand.closed';  // also fires on EventEmitter2

  constructor(payload: HandClosedPayload) {
    super();
    this.payload = payload;
  }
}

export interface HandClosedPayload {
  handId: number;
  handPublicId: string;
  tableId: number;
  winnerSeats: number[];
  // …
}
```

**Auto-populated by the base class:**
- `eventId: string` — UUID v7. Consumers use this for idempotency (`SET NX EX` in Redis).
- `version: number` — schema version, default `1`. Bump when `payload` shape changes.
- `metadata: DomainEventMeta` — actor / trace / request envelope, filled by `EventBusService.emit()` from CLS at emit time. Don't write to it manually.

**Required:**
- `eventType` — namespaced string (`'audit.entity_changed'`, `'tournament.hand.closed'`, `'notification.email.queued'`). The dotted prefix categorises the event for monitoring + Redis keys.
- `aggregate` — Prisma model name + internal id + optional publicId. Lets consumers route + de-dup per aggregate.
- `payload` — the typed body. Keep it serialisable (no class instances, no Maps / Sets without conversion).

## 2. Durability — pick the right channel

| Scenario | Durability | Why |
|---|---|---|
| Audit log entries, activity-feed writes, notifications, emails, third-party integrations | `'durable'` | At-least-once. Survives request server crash before the consumer ran. |
| WS broadcasts to connected clients, in-process listeners, optimistic UI hints | `'ephemeral'` | Fire-and-forget. No durability needed — if the WS server is down, the client wasn't listening anyway. |
| Both (e.g. a hand closed → audit log + WS push to spectators) | `'durable'` + `ephemeralAlias` | Durable channel guarantees the audit row; ephemeral side fires the WS instantly to listeners that ARE connected. |

**Durable events MUST declare `queueName`.** EventBus throws at runtime if a durable event has no queue:
```
Error: Durable event tournament.hand.closed has no queueName declared.
Add 'static readonly queueName = QueueName.X' to HandClosedDomainEvent.
```

## 3. The transactional outbox — the rule

Durable events that fire alongside a domain write MUST be emitted with `{ tx }` inside the `$transaction`:

```typescript
await this.prisma.$transaction(async (tx) => {
  // 1. Domain write
  const hand = await tx.tournamentHand.update({
    where: { id }, data: { status: 'closed' },
  });

  // 2. CORRECT — outbox row written in the SAME tx, atomic with the domain write
  await this.eventBus.emit(
    new HandClosedDomainEvent({ handId: hand.id, handPublicId: hand.publicId, /* ... */ }),
    { tx },
  );

  return hand;
});
// Transaction commits. OutboxPollerService picks up the row, dispatches to BullMQ.
// Consumer eventually runs.
```

**The poller (`OutboxPollerService`):**
- Polls every N seconds (configured via env).
- Locks rows with `SELECT ... FOR UPDATE SKIP LOCKED` so multiple workers don't race.
- Dispatches to BullMQ via `QueueRegistry.enqueue()`.
- Marks `processedAt`. Failed dispatches set `failedAt` + `lastErrorAt` for retry / replay.

**`OutboxReplayService`** exists for manual recovery of `failedAt` rows. Use sparingly — by-default the BullMQ retry config (5 attempts, exponential backoff 2000ms) handles transient failures.

## 4. THE RULE that caused the 2026-04 `HandsCloseService` bug

**Never emit an ephemeral event INSIDE `$transaction` without `{ tx }`.**

```typescript
// WRONG — fires BEFORE the transaction commits.
// WS clients receive "hand closed" but a subsequent SELECT for the hand
// returns the OLD status (or 404). Real fixed bug class.
await this.prisma.$transaction(async (tx) => {
  await tx.tournamentHand.update({ where: { id }, data: { status: 'closed' } });
  await this.eventBus.emit(new HandClosedDomainEvent({ /* ... */ }));   // no {tx}
});
```

`EventBusService.emit()` already handles this correctly **if you pass `{ tx }`**: for ephemeral events with `tx`, it defers the `EventEmitter2.emit()` to a `queueMicrotask` that runs after the caller's await chain — i.e. post-commit. Without `{ tx }`, the emitter fires synchronously inside the transaction.

**Rule of thumb:** if the emit is inside a `$transaction` callback, ALWAYS pass `{ tx }`. EventBus routes correctly for both durable + ephemeral when given the tx.

## 5. Emit without a transaction (no DB write)

If the event has no corresponding DB change — e.g. a healthcheck ping, a metrics event, a fan-out re-broadcast — emit without `{ tx }`:

```typescript
// Fire-and-forget. Durable goes straight to BullMQ; ephemeral to EventEmitter2.
await this.eventBus.emit(new ServerHeartbeatEvent({ instanceId, uptime }));
```

For durable events this skips the outbox (you lose the atomic-with-DB guarantee, but there's no DB write to be atomic with). The BullMQ at-least-once retry config still applies.

## 6. Consuming events — `@OnDomainEvent`

```typescript
import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '@/shared/event-bus/decorators/on-domain-event.decorator';
import { HandClosedDomainEvent } from '../events/hand-closed.event';

@Injectable()
export class HandClosedActivityConsumer {
  constructor(private readonly activityService: ActivityService) {}

  @OnDomainEvent(HandClosedDomainEvent)
  async onHandClosed(event: HandClosedDomainEvent): Promise<void> {
    // Idempotency — check eventId in Redis SET NX EX before doing work
    const isFirstSeen = await this.redis.set(
      `idem:hand-closed:${event.eventId}`,
      '1',
      'EX', 3600, 'NX',
    );
    if (!isFirstSeen) return;

    await this.activityService.recordHandClosed(event.payload);
  }
}
```

**Idempotency is the consumer's responsibility.** BullMQ at-least-once + outbox retry means the same `eventId` can arrive twice. Use Redis `SET NX EX` keyed on `eventId` (project convention: `idem:<eventType>:<eventId>` with TTL ≥ longest processing window).

**Read actor / trace context from `event.metadata`:**
```typescript
this.logger.log(`hand closed by actor=${event.metadata.actorId} req=${event.metadata.requestId}`);
```
The consumer runs in a worker process — there's no incoming HTTP request — so all context comes from the envelope.

## 7. Per-`MODULES_SET` wiring

```typescript
// src/utils/modules-set.ts
const eventBusFull = EventBusModule.forFull();          // emit + outbox poller + BullMQ workers
const eventBusEmitter = EventBusModule.forEmitter();    // emit-only (no poller, no workers)
```

| `MODULES_SET` | Wires | Why |
|---|---|---|
| `monolith` | `forFull()` | Single process — handles HTTP + polls outbox + runs workers |
| `background` | `forFull()` | Dedicated worker process — no HTTP, just outbox + workers |
| `api` / `admin_backend` / `user_backend` | `forEmitter()` | Request servers emit but DON'T poll outbox — keeps request latency clean |

**TODO documented in CLAUDE.md + the EventBusModule itself:** introduce `MODULES_SET=worker` so dedicated workers can split off from `background`. Until then, `monolith` runs everything in one process.

If you write a service that runs ONLY in `background` (e.g. a Prisma cleanup cron), check the modules-set wiring before assuming the EventBus consumer pool is available.

## 8. Adding a new domain event — workflow

1. **Define the event class** in `src/api/<feature>/events/<event-name>.event.ts`:
   ```typescript
   export class TournamentRegisteredEvent extends DomainEvent<TournamentRegisteredPayload> {
     readonly eventType = 'tournament.registered';
     readonly aggregate = { type: 'Tournament', id: this.payload.tournamentId, publicId: this.payload.tournamentPublicId };
     readonly payload: TournamentRegisteredPayload;
     static readonly durability = 'durable';
     static readonly queueName = QueueName.ACTIVITY;
     constructor(payload: TournamentRegisteredPayload) { super(); this.payload = payload; }
   }
   ```
2. **Emit from the service** in the same `$transaction` as the domain write:
   ```typescript
   await this.prisma.$transaction(async (tx) => {
     const tournament = await tx.tournament.create({ data: dto });
     await this.eventBus.emit(new TournamentRegisteredEvent({ tournamentId: tournament.id, tournamentPublicId: tournament.publicId, /* ... */ }), { tx });
     return tournament;
   });
   ```
3. **Add a consumer** (if you need one) with `@OnDomainEvent(TournamentRegisteredEvent)`. Register in the relevant feature module's `providers`.
4. **Write tests:**
   - Service spec: assert `outbox.create` called with the right event payload + the same tx (see `nestjs-tdd` skill).
   - Consumer spec: instantiate the consumer, invoke the handler directly, assert side effects + idempotency.
5. **If new queue is needed** (rare — re-use existing `AUDIT` / `ACTIVITY` / `NOTIFICATION` / `EMAIL` / `TRACKER_UPLOAD` first):
   - Add the name to `QueueName` in `src/shared/event-bus/queue-names.ts`
   - Register the queue in `QueueRegistry.queueDefinitions`
   - Set `static readonly queueName = QueueName.NEW_NAME` on the event
6. **Schema bump?** If `payload` shape changes, bump `version` on the event class. Update consumers to handle the old + new shapes during the migration window.

## 9. Outbox table — schema (for context)

`prisma/schema/event-bus.prisma`:
```prisma
model Outbox {
  id             BigInt @id @default(autoincrement())
  publicId       String @unique @default(uuid()) @map("public_id") @db.VarChar(40)
  eventId        String @unique @map("event_id") @db.VarChar(40)   // UUID v7 from DomainEvent
  aggregateType  String @map("aggregate_type") @db.VarChar(100)
  aggregateId    BigInt @map("aggregate_id")
  aggregatePubId String? @map("aggregate_pub_id") @db.VarChar(40)
  eventType      String @map("event_type") @db.VarChar(128)
  payload        Json
  queueName      String @map("queue_name") @db.VarChar(64)
  metadata       Json
  attemptCount   Int @default(0) @map("attempt_count")
  lastErrorAt    DateTime? @map("last_error_at") @db.Timestamptz(6)
  lastError      String?   @map("last_error")
  processedAt    DateTime? @map("processed_at") @db.Timestamptz(6)
  failedAt       DateTime? @map("failed_at") @db.Timestamptz(6)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  // …
  @@map("outbox")
}
```

`eventId @unique` enforces de-dup at the outbox level too — if your `emit()` is somehow called twice with the same DomainEvent instance, the second insert hits a unique-violation and the same row is dispatched once.

## 10. Testing patterns (cross-link)

See [`nestjs-tdd` skill, Section 7](../nestjs-tdd/SKILL.md) for the assertion patterns:

```typescript
// Service spec — assert outbox write inside $transaction
expect(mockPrisma.outbox.create).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({
      eventType: 'tournament.hand.closed',
      queueName: 'activity-events',
    }),
  }),
);

// Ephemeral assertion
expect(mockEventEmitter.emit).toHaveBeenCalledWith(
  'hand.closed',
  expect.objectContaining({ eventType: 'tournament.hand.closed' }),
);
```

**Critical assertion:** for the 2026-04 bug class, write a test that BREAKS if the WS emit happens inside the transaction:

```typescript
it('emits hand.closed AFTER the transaction commits', async () => {
  const emitOrder: string[] = [];
  mockPrisma.$transaction.mockImplementation(async (cb) => {
    emitOrder.push('tx-start');
    const result = await cb(mockPrisma);
    emitOrder.push('tx-commit');
    return result;
  });
  mockEventEmitter.emit.mockImplementation(() => emitOrder.push('emit'));

  await service.closeHand(payload);

  expect(emitOrder).toEqual(['tx-start', 'tx-commit', 'emit']);  // emit AFTER commit
});
```

## 11. BullMQ retry config (defaults)

```typescript
// queue-names.ts
export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 1000,
  removeOnFail: 500,
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
};
```

Retries: 5 attempts, exponential backoff starting at 2s. After 5 failures, the job is moved to the BullMQ failed set + the outbox row gets `failedAt` set. Use `OutboxReplayService` to re-dispatch manually (with a logged reason).

For events with stricter / looser retry needs, override per-queue in `QueueRegistry.queueDefinitions`.

## 12. Anti-patterns

- **Emitting an ephemeral event inside `$transaction` without `{ tx }`** — fires before commit. WS clients race the row visibility. **Real fixed bug.**
- **Emitting a durable event inside `$transaction` without `{ tx }`** — bypasses the outbox, goes straight to BullMQ. If the transaction rolls back, the event was already enqueued. Atomic guarantee lost.
- **Using `EventEmitter2` directly** in domain code — bypasses the metadata envelope (actor, trace, requestId) and the outbox routing. Always go through `EventBusService.emit()`.
- **Calling `outbox.create` manually** — bypasses the metadata envelope + the `eventId` UUID v7 generation. Use `eventBus.emit({ tx })`.
- **Forgetting `static readonly durability` / `queueName`** — runtime error or silent ephemeral-only delivery. The defaults (durability='durable', queueName=undefined) WILL throw on first emit.
- **Mutable `payload`** — events are serialised + persisted in the outbox + re-read by workers. Mutating after emit is a bug.
- **Non-serialisable payload** (class instances, `Date` without ISO conversion, `BigInt`, Maps, Sets) — Outbox `Json` column rejects or silently corrupts.
- **Consumer without idempotency** — duplicate processing on retries. Use `SET NX EX` on `eventId`.
- **Bumping `payload` shape without bumping `version`** — old consumers crash on new payloads.

## 13. When stuck

| Problem | Fix |
|---|---|
| `Durable event X has no queueName declared` at runtime | Add `static readonly queueName = QueueName.Y` to the event class |
| WS message fires before the row is visible | You forgot `{ tx }` in the emit. Add it. |
| Event fires twice | Consumer missing idempotency. Add `SET NX EX` on `eventId`. |
| Event never fires (no error) | Check MODULES_SET: `api` / `admin_backend` / `user_backend` use `forEmitter()` (no poller). If you need workers running here, set MODULES_SET=monolith or run a `background` worker process. |
| Outbox row stuck `processedAt=null` | Poller down? Check `OutboxPollerService` logs. Verify forFull() is wired for the running MODULES_SET. |
| Outbox row `failedAt` set | Inspect `lastError`. Fix consumer. Replay via `OutboxReplayService.replay(publicId)`. |
| Consumer needs the actor of the original request | Read `event.metadata.actorId` — the envelope carries it. There's no `request['user']` in worker processes. |

## 14. Cross-references

- **`db-design` skill** — `Outbox` model schema + the publicId / audit conventions every event-emitting service follows
- **`nestjs-tdd` skill** — assertion patterns for outbox writes + ephemeral emits + the "emit after commit" regression test
- **`backend/src/shared/event-bus/`** — source of truth (`event-bus.service.ts`, `domain-event.ts`, `queue-names.ts`, `outbox/`)
- **CLAUDE.md** — § Hybrid IDs + actor tracking + EventBus (2026-04) — high-level overview

## 15. Pre-flight checklist (event-emitting work)

- [ ] New event class extends `DomainEvent<TPayload>` with `eventType`, `aggregate`, `payload`
- [ ] Static `durability` declared explicitly (don't rely on default for clarity)
- [ ] Static `queueName` declared if durable
- [ ] Static `ephemeralAlias` declared if dual-dispatch
- [ ] Service emits via `eventBus.emit(event, { tx })` inside `$transaction` (or without `tx` for no-DB events)
- [ ] Consumer has idempotency check (`SET NX EX` on `eventId`)
- [ ] Consumer reads context from `event.metadata`, not `request['user']`
- [ ] Service spec asserts the right channel (outbox.create for durable, emitter.emit for ephemeral)
- [ ] If WS / external IO is triggered, regression spec verifies "fires AFTER commit"
- [ ] If new queue needed: registered in `QueueName` + `QueueRegistry.queueDefinitions`
- [ ] If payload shape changes: `version` bumped on event class + consumer handles both shapes

## 16. When generic skills conflict

If a generic "NestJS event" tutorial recommends `EventEmitter2` directly or pushes `@nestjs/cqrs` patterns, this skill wins. The project's EventBus is a thin facade with explicit durability semantics + outbox guarantees. Stay inside it.
