---
name: nestjs-backend-tdd
description: Use when writing or refactoring backend tests in this NestJS project — service/controller/guard unit specs, e2e specs, or fixing backend bugs that need a regression test. Triggers on `*.spec.ts`, `*.e2e-spec.ts`.
---

# NestJS Backend TDD

Test-first discipline + the project's actual testing idioms. Every new service, controller, guard, interceptor, pipe, or bug-fix landing in `backend/` should ship with a spec that **failed before the implementation existed**.

**Core principle:** If you didn't watch the test fail, you don't know what it tests.

**Violating the letter of the rules is violating the spirit of the rules.**

**REQUIRED BACKGROUND:** Use `superpowers:test-driven-development` for the discipline foundation (RED → GREEN → REFACTOR, rationalization counters, Iron Law). This skill applies that discipline to this codebase's specific stack.

## When to Use

**Required (write the failing spec first):**

- New `*.service.ts`, `*.controller.ts`, guard, interceptor, pipe, filter
- Bug fix in any backend file — write the regression spec that **reproduces** the bug, then fix
- Refactoring with behavior surface changes
- New `EventBus` / Outbox emitters or BullMQ workers
- New custom `class-validator` decorator

**Allowed without TDD (note the choice in the PR / commit body):**

- NestJS boilerplate: bare `*.module.ts`, DTO-only files (validation is tested via the controller spec), generated Prisma client
- Throwaway prototype branches that won't merge
- Config files (`*.config.ts`)
- Migrations (verified via `prisma migrate` + e2e, not unit)

If you catch yourself thinking "skip TDD just this once" for anything in the **Required** list — that's the rationalization. Stop.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote a service method before its spec? Delete the method. Open the `*.spec.ts` first. Then re-implement.

**No exceptions:**

- Don't keep the deleted code "as reference" in a comment
- Don't `git stash` and re-apply after writing the test (you'll rationalize "I already had this working")
- Delete means delete

## RED → GREEN → REFACTOR (project commands)

```bash
# RED — run only the new spec, watch it fail
pnpm test -- src/api/<feature>/<feature>.service.spec.ts

# GREEN — same command, watch it pass
pnpm test -- src/api/<feature>/<feature>.service.spec.ts

# REFACTOR — full unit suite, no regressions
pnpm test

# E2E (separate config)
pnpm test:e2e -- test/<feature>.e2e-spec.ts

# Coverage
pnpm test:cov
```

**Verify RED is mandatory.** "Test errors with `Cannot find name 'X'`" is not a valid RED — that's a typo. The spec must fail because the _behavior_ is missing (`Expected 409, got 200`, `Expected mockFn called, got 0 calls`).

## Test layout

```
backend/
├── src/**/<name>.spec.ts          # Unit specs, co-located with source. Discovered by jest.config.json
├── test/*.e2e-spec.ts             # E2E specs. Discovered by test/jest-e2e.json
├── jest.config.json               # Unit: ts-jest, rootDir=src, moduleNameMapper for @/* aliases
├── test/jest-e2e.json             # E2E: rootDir=.., testRegex=.e2e-spec.ts$
└── setup-jest.mjs                 # Seeds NODE_ENV=test, AUTH_JWT_SECRET, DATABASE_*, etc.
```

**Path aliases work in tests** — import as `@/api/users/user.service`, never relative `../../../`.

## Project mocking idioms (READ THIS — these are the _actual_ conventions in 60 existing specs)

### 1. Typed mock dependencies — `Partial<Record<keyof X, jest.Mock>>`

Idiom of choice (no `any`, full IDE rename safety):

```typescript
let authService: Partial<Record<keyof AuthService, jest.Mock>>;

beforeAll(async () => {
  authService = { verifyAccessToken: jest.fn() };

  const module = await Test.createTestingModule({
    providers: [
      AuthGuard,
      { provide: AuthService, useValue: authService },
      { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
    ],
  }).compile();
});
```

`beforeAll` (not `beforeEach`) for the `TestingModule` build — it's expensive. Reset state via `jest.clearAllMocks()` in a `beforeEach`.

### 2. Prisma mocking — inline object, only the methods you call

The codebase does **not** use `jest-mock-extended` / `mockDeep`. It mocks just the slice it touches:

```typescript
const prismaServiceValue = {
  user: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((cb) => cb(prismaServiceValue)),
};
// providers: [{ provide: PrismaService, useValue: prismaServiceValue }]
```

Project ESLint sets `no-explicit-any: off` — `let prismaServiceValue: any;` is accepted; `Partial<Record<keyof PrismaService, ...>>` is fine if you prefer it. Pick one and stay consistent within a file.

### 3. `AuthGuard` is global — overriding it in tests

`AuthModule` registers `AuthGuard` via `APP_GUARD`, so it runs before every controller in e2e. Two patterns:

```typescript
// Unit-testing the guard itself: instantiate via TestingModule, mock Reflector + AuthService
// (see src/guards/auth.guard.spec.ts)

// E2E: bypass auth entirely
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideGuard(AuthGuard)
  .useValue({ canActivate: () => true })
  .compile();
```

To exercise role checks, instead override `AuthService.verifyAccessToken` to return a synthetic JWT payload — keeps the real guard logic in the loop.

### 4. CLS / `RequestContextService` — wrap with `cls.run()`

The audit / EventBus / actor-tracking flow reads from `nestjs-cls`. A spec that calls a service which reads `RequestContextService.getUserId()` must run inside a CLS context:

```typescript
import { ClsModule, ClsService } from "nestjs-cls";

beforeEach(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ClsModule.forRoot({ global: true })],
    providers: [RequestContextService, MyServiceUnderTest],
  }).compile();

  cls = moduleRef.get(ClsService);
  rcs = moduleRef.get(RequestContextService);
});

it("writes audit log with the actor id", async () => {
  await cls.run(async () => {
    rcs.setActor({
      userId: 42,
      role: "admin",
      permissions: [],
      sessionId: undefined,
    });
    await service.doThing();
    // audit assertion
  });
});
```

Without `cls.run`, `rcs.getUserId()` returns `SYSTEM_ACTOR_ID` (the no-context fallback).

### 5. DTO validation — `plainToInstance` + `validate`

Test DTO validators directly, not through the controller:

```typescript
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

it("rejects an empty username", async () => {
  const dto = plainToInstance(CreateUserReqDto, {
    username: "",
    email: "a@b.c",
    password: "pw",
  });
  const errors = await validate(dto);
  expect(errors[0].constraints).toEqual({
    minLength: "username must be longer than or equal to 1 characters",
  });
});
```

### 6. `publicId` in fixtures

Hybrid-ID models have `id: number` (FK joins) AND `publicId: string` (`usr_…`, `hnd_…`, etc., generated by the publicId Prisma extension on real writes). In specs, hand-build both:

```typescript
const userFixture = { id: 1, publicId: "usr_test01", email: "a@b.c" };
mockPrisma.user.findFirst.mockResolvedValue(userFixture);
```

Services / repos query by `publicId` (per project convention), so assert calls accordingly:

```typescript
expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
  expect.objectContaining({ where: { publicId: "usr_test01" } }),
);
```

### 7. EventBus / Outbox — assert the right channel

Durable events go through the outbox table inside a `$transaction`. Ephemeral events go through `EventEmitter2`. Two assertion shapes:

```typescript
// Durable: outbox row written inside the transaction
expect(mockPrisma.outbox.create).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({ eventType: "TournamentHandClosed" }),
  }),
);

// Ephemeral: emitter called with the right event class
expect(mockEventEmitter.emit).toHaveBeenCalledWith(
  "hand.advanced",
  expect.objectContaining({ handPublicId: "hnd_test01" }),
);
```

Common bug guard: a `WS broadcast emitted inside $transaction` is a real fixed bug class in `HandsCloseService` (2026-04). When testing services that mix domain writes + WS, **assert the emitter was called _after_ `$transaction` resolves** — write the failing test first, fix second.

### 7b. EventBus durability — assert the right channel

**`EventBusService.emit()` is the single entry point** for all event publication. Don't reach for `EventEmitter2` directly in domain code — and don't assert against it for tests unless the event class declares `durability='ephemeral'`. See the `event-bus-patterns` skill for the full pattern.

```typescript
// Durable event — assert outbox.create called inside the caller's transaction
it('emits HandClosed via outbox inside the transaction', async () => {
  mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

  await service.closeHand(payload);

  expect(mockPrisma.outbox.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        eventType: 'tournament.hand.closed',
        queueName: 'activity-events',
        payload: expect.objectContaining({ handPublicId: 'hnd_test01' }),
      }),
    }),
  );
});

// Ephemeral event — assert the EventEmitter2 channel
it('fires hand.advanced on the ephemeral channel', async () => {
  await service.advanceHand(payload);

  expect(mockEventEmitter.emit).toHaveBeenCalledWith(
    'hand.advanced',
    expect.objectContaining({ eventType: 'tournament.hand.advanced' }),
  );
});

// Dual-dispatch event (durable + ephemeralAlias) — assert BOTH
expect(mockPrisma.outbox.create).toHaveBeenCalled();
expect(mockEventEmitter.emit).toHaveBeenCalledWith('hand.closed', expect.any(Object));
```

### 7c. THE regression test — "emit AFTER commit"

The 2026-04 `HandsCloseService` bug was: WS broadcast fired BEFORE the transaction committed → spectators got "hand closed" but a subsequent SELECT returned the old row. **Every service that emits an event inside a `$transaction` should have this regression test:**

```typescript
it('fires the WS broadcast AFTER the transaction commits', async () => {
  const callOrder: string[] = [];
  mockPrisma.$transaction.mockImplementation(async (cb) => {
    callOrder.push('tx-start');
    const result = await cb(mockPrisma);
    callOrder.push('tx-commit');
    return result;
  });
  mockEventEmitter.emit.mockImplementation(() => callOrder.push('ws-emit'));

  await service.closeHand(payload);

  // emit MUST come after tx-commit, not between tx-start and tx-commit
  expect(callOrder).toEqual(['tx-start', 'tx-commit', 'ws-emit']);
});
```

This catches both: a missing `{ tx }` in `eventBus.emit()` AND a direct `EventEmitter2.emit()` call slipped into a transaction callback.

### 7d. Consumer specs — `@OnDomainEvent` handlers

```typescript
@Injectable()
class HandClosedActivityConsumer {
  constructor(private readonly redis: Redis, private readonly activityService: ActivityService) {}

  @OnDomainEvent(HandClosedDomainEvent)
  async onHandClosed(event: HandClosedDomainEvent) {
    const fresh = await this.redis.set(`idem:hand-closed:${event.eventId}`, '1', 'EX', 3600, 'NX');
    if (!fresh) return;
    await this.activityService.recordHandClosed(event.payload);
  }
}

it('skips duplicate events (idempotency)', async () => {
  mockRedis.set.mockResolvedValue(null); // SET NX returns null on existing key

  await consumer.onHandClosed(event);

  expect(mockActivityService.recordHandClosed).not.toHaveBeenCalled();
});

it('records the activity on first emit', async () => {
  mockRedis.set.mockResolvedValue('OK');

  await consumer.onHandClosed(event);

  expect(mockActivityService.recordHandClosed).toHaveBeenCalledWith(event.payload);
});
```

### 8. BullMQ — mock the queue, assert the payload

```typescript
const queueMock = { add: jest.fn() };

providers: [
  { provide: getQueueToken("outbox"), useValue: queueMock },
  MyService,
];

it("enqueues a retry job with backoff", async () => {
  await service.scheduleRetry({ id: 1 });
  expect(queueMock.add).toHaveBeenCalledWith(
    "retry",
    expect.objectContaining({ id: 1 }),
    expect.objectContaining({
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    }),
  );
});
```

### 9. Composite decorators — what the controller spec actually tests

The project doesn't use raw `@ApiProperty` + `@IsString` + `@MinLength` in DTOs / controllers. It uses composite decorators (see CLAUDE.md § Key Patterns):

| Composite | Wraps | Test by |
|---|---|---|
| `@ApiAuth({ summary, type, roles? })` | `@UseGuards(AuthGuard)` + `@Roles(...)` + `@ApiResponse` + `@ApiBearerAuth` | E2E: call without bearer → 401; with wrong role → 403; with right role → 200 |
| `@ApiPublic({ summary, type })` | `@Public()` (skips AuthGuard) + `@ApiResponse` | E2E: call without bearer → 200 |
| `@CurrentUser('id')` | Extracts `request['user'].id` (or whole payload if no arg) | Unit-test the controller: assert the service was called with the extracted value |
| `@StringField({ minLength: 1, maxLength: 50 })` | `@Expose()` + `@IsString()` + `@MinLength()` + `@MaxLength()` + `@ApiProperty()` | Unit-test the DTO via `plainToInstance` + `validate` (see Section 5) |
| `@NumberField({ int: true, min: 0 })` | Same shape, numeric variants | Same — `plainToInstance` + `validate` |
| `@StringFieldOptional()` / `@NumberFieldOptional()` / `@EmailField()` / `@PasswordField()` / `@DateField()` / `@EnumField()` / `@ClassFieldOptional(() => Type)` | Variations | Same |

**Don't test the composite mechanics** (Reflect-metadata wiring is Nest's responsibility). Test the OBSERVABLE BEHAVIOUR via the validator + the e2e contract.

```typescript
// DTO unit spec — assert constraint key, not English text
it('rejects username shorter than 1 char', async () => {
  const dto = plainToInstance(CreateUserReqDto, { username: '', email: 'a@b.c' });
  const errors = await validate(dto);
  expect(errors[0].constraints).toEqual(expect.objectContaining({ minLength: expect.any(String) }));
});
```

### 10. Pagination — `OffsetPaginatedDto` test shape

Every list endpoint uses `PageOptionsDto` → `OffsetPaginatedDto<T>`. The shape is:

```typescript
{
  data: T[],
  pagination: { page: number, limit: number, total: number, totalPages: number, hasNext: boolean, hasPrev: boolean }
}
```

Test the service's `findMany`:

```typescript
it('returns paginated users with the right page metadata', async () => {
  const userFixtures = [
    { id: 1, publicId: 'usr_01', email: 'a@b.c' },
    { id: 2, publicId: 'usr_02', email: 'd@e.f' },
  ];
  mockPrisma.user.findMany.mockResolvedValue(userFixtures);
  mockPrisma.user.count.mockResolvedValue(42);

  const result = await service.findMany({ page: 1, limit: 20, order: 'desc' });

  expect(result.data).toHaveLength(2);
  expect(result.pagination).toMatchObject({
    page: 1,
    limit: 20,
    total: 42,
  });
  expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ skip: 0, take: 20, orderBy: { createdAt: 'desc' } }),
  );
});

it('skips the right number of rows on page 3', async () => {
  await service.findMany({ page: 3, limit: 20 });
  expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ skip: 40, take: 20 }),
  );
});
```

For controllers, assert the response shape matches the DTO class (use `plainToInstance` + `validate` on the response if you want to be airtight).

### 11. i18n exceptions — assert keys, not English

`ValidationException` + the global exception filter return `ErrorDto` with i18n-keyed messages. **Tests assert on the KEY, not the rendered English.** Otherwise tests break when locales are updated.

```typescript
// service throws — assert on the i18n key
import { ValidationException } from '@/exceptions/validation.exception';

it('rejects duplicate email', async () => {
  mockPrisma.user.findFirst.mockResolvedValue({ id: 1, email: 'a@b.c' });

  await expect(service.create({ email: 'a@b.c', password: 'x' }))
    .rejects.toMatchObject({
      name: 'ValidationException',
      // assert on the i18n key the exception was constructed with:
      response: expect.objectContaining({ message: 'user.error.email_already_in_use' }),
    });
});

// e2e — assert error body shape, not the localised message
it('returns 409 with the right error key', async () => {
  await request(app.getHttpServer()).post('/api/v1/users').send({ email: 'taken@b.c', password: 'x' });
  const res = await request(app.getHttpServer()).post('/api/v1/users').send({ email: 'taken@b.c', password: 'x' });
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({
    error: { code: 'CONFLICT' },
    // do NOT assert res.body.error.message text — it's locale-dependent
  });
});
```

### 12. `MODULES_SET`-aware E2E bootstrap

E2E specs run against `AppModule`, which loads the feature-module subset selected by `MODULES_SET`. For specs that exercise admin-only or user-only modules, the env var matters:

| `MODULES_SET` | Loads | Use for E2E |
|---|---|---|
| `monolith` (default) | All features via `ApiModule` | Default — any feature spec |
| `admin_backend` | Admin-only subset (`AdminApiModule`) | Admin-controller specs that want to verify admin-only routes exist + user-only routes return 404 |
| `user_backend` | User-only subset (`UserApiModule`) | User-controller specs that want to verify user routes exist + admin routes return 404 |
| `background` | No HTTP — DB / BullMQ / cache / EventBus full wiring | Worker process specs (consumers, pollers) |

The default `setup-jest.mjs` seeds `MODULES_SET=monolith`. To exercise a different mode in a specific e2e file:

```typescript
beforeAll(async () => {
  process.env.MODULES_SET = 'admin_backend';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
  delete process.env.MODULES_SET;
});

it('admin routes are reachable', async () => {
  await request(app.getHttpServer()).get('/api/v1/admin/users').expect(200);
});

it('user-only routes are NOT mounted', async () => {
  await request(app.getHttpServer()).get('/api/v1/hands').expect(404);
});
```

For `forEmitter()` vs `forFull()` differences: if your spec needs the outbox poller running (it usually doesn't — assert the outbox row was written, don't wait for the poller), use `monolith` or `background`. Otherwise `forEmitter()` modes are fine.

### 13. Cross-references

- **`event-bus-patterns` skill** — full guide to DomainEvent + outbox + consumer patterns. The assertion patterns in 7b / 7c / 7d above are the testing surface.
- **`db-design` (prisma-conventions) skill** — `publicId` fixtures, audit extension behaviour, multi-file schema, `OffsetPaginatedDto` shape.
- **CLAUDE.md** § Hybrid IDs + actor tracking + EventBus (2026-04) — high-level overview, the actor flow

## Unit vs E2E — what goes where

| Layer      | Tool             | Purpose                                           | Mock DB?                                 |
| ---------- | ---------------- | ------------------------------------------------- | ---------------------------------------- |
| Unit       | Jest             | Service / pipe / guard logic, DTO validators      | Yes — inline `PrismaService` mock        |
| E2E (HTTP) | Jest + supertest | Real Nest app + controller + guard + filter chain | **No** — real Postgres, cleanup per spec |

E2E uses the real `AppModule` and a real Postgres (`docker compose up -d` provides it; `setup-jest.mjs` seeds env vars). Cleanup currently relies on `pnpm db:drop` between runs — if you add transactional cleanup or `TRUNCATE` helpers, document them in `references/patterns.md`.

## Anti-patterns

- **Mocking the DB in e2e** — defeats the purpose; use the real test Postgres
- **Testing private methods** — go through the public API; if coverage demands it, use the typed-helper pattern in `references/strict-typescript-testing.md`
- **Shared `let` state across `it()` without `clearAllMocks`** — random failures, flaky CI
- **Asserting on private Prisma calls inside a service that should be tested via behavior** — assert the _output_ and the _side effects_ (returned DTO, emitted event, queue payload), not the SQL shape
- **Forgetting `cls.run()`** when the SUT reads `RequestContextService` — silent fallback to `SYSTEM_ACTOR_ID` masks the bug

## Common rationalizations

| Excuse                                               | Reality                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "It's just a thin controller, the service is tested" | Controllers wire DTO validation, guard metadata, status codes. Test it.                                         |
| "I'll add the spec after the PR is approved"         | You won't. The reviewer assumes the spec is in.                                                                 |
| "Mocking Prisma is too much boilerplate"             | Five lines. If it's truly painful, your service has too many models — that's the design feedback.               |
| "TDD slows me down"                                  | Faster than debugging a 500 in a 5-deep DI chain.                                                               |
| "Manual Swagger test is enough"                      | Doesn't run on the next PR. Doesn't prove edge cases.                                                           |
| "EventBus is async, hard to test"                    | Test the _call_ (`mockEmitter.emit` / `mockPrisma.outbox.create`), not the consumer. Consumer has its own spec. |

## Red flags — STOP and start over

- Wrote service method before the spec
- Spec passes on the first run after writing it
- "Cannot find name `MyService`" was the only failure (typo, not RED)
- Spec asserts what the implementation _does_, not what it _should_
- Suppressed lint with `eslint-disable` to make the spec compile

All of these mean: delete the production code, restart with the failing spec.

## Verification checklist

Before opening a PR:

- [ ] Every new public method has at least one spec
- [ ] Each spec was watched fail before its implementation
- [ ] Each failure was the _expected_ failure (not a typo)
- [ ] `pnpm test` is fully green, no warnings
- [ ] `pnpm lint` is clean (no `eslint-disable` added in specs)
- [ ] Edge cases covered: null inputs, Prisma `P2025` (record not found), unauthorized actor, empty arrays, transaction rollback paths
- [ ] CLS-aware services have at least one `cls.run()` test and at least one no-context test
- [ ] Outbox / EventEmitter calls asserted (channel + payload shape)

Can't tick a box? You skipped TDD. Restart.

## When stuck

| Problem                            | Fix                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| Don't know how to test a service   | Write the wished-for assertion first; the API will follow                          |
| Spec needs 10 mocks                | Service has too many responsibilities; split it                                    |
| Can't mock the DB call             | You're testing a repo, not a service — move to e2e or extract a tiny pure function |
| `cls.getStore()` returns undefined | Wrap the test body in `await cls.run(async () => { ... })`                         |
| Global `AuthGuard` blocks the e2e  | `.overrideGuard(AuthGuard).useValue({ canActivate: () => true })`                  |

## With `superpowers:systematic-debugging`

Bug reported? Write the failing spec that reproduces it (RED), fix the code (GREEN), refactor (REFACTOR). The spec is the regression guard.

Never fix a backend bug without a spec.

## References

- [references/patterns.md](references/patterns.md) — Detailed mocking templates, e2e bootstrap, override patterns, test-data builders
- [references/strict-typescript-testing.md](references/strict-typescript-testing.md) — Patterns for projects with `recommendedTypeChecked` enabled (this project doesn't, but adjacent projects might)
- [references/improve-coverage.md](references/improve-coverage.md) — Workflow for raising coverage on a target file or module

## Final rule

```
Production code → spec exists and failed first
Otherwise → not TDD
```

No exceptions without explicit permission from the human.
