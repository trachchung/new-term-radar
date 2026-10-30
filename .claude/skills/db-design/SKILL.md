---
name: prisma-conventions
description: Project-specific Prisma + PostgreSQL conventions for the Fullring monorepo backend (NestJS + Prisma 6 + PostgreSQL 16). Activate FIRST for any work touching `backend/prisma/schema/*.prisma`, Prisma models, migrations, or DB queries. Covers Hybrid IDs (int PK + publicId), the publicId Prisma extension, the audit extension (createdBy / updatedBy auto-fill from CLS), AUDIT_MODELS registry, multi-file schema layout, snake_case @map / @@map, the transactional outbox pattern, pnpm migration commands, and per-MODULES_SET wiring. Overrides generic Prisma 101 advice (`cuid()` IDs, `npx prisma migrate dev`, single schema.prisma, serverless connection pooling) which contradicts the project's setup.
---

# Prisma + PostgreSQL Conventions

NestJS 10 + Prisma 6 + PostgreSQL 16. The project has THREE Prisma extensions doing heavy lifting (publicId, audit, EventBus-outbox). Generic Prisma tutorials skip every one of them. This skill captures the conventions so you don't ship a model that breaks them.

Read this BEFORE the subfiles (`schema-design.md`, `core-rules.md`, `migrations.md`, `optimization.md`, `indexing.md`, `database-selection.md`, `orm-selection.md`). Those are good PostgreSQL/Prisma theory; this skill is the project layer on top.

## 0. Stack reality — verify before assuming

| Generic advice | Project reality |
|---|---|
| `id String @id @default(cuid())` | **Hybrid IDs**: `id Int @id @default(autoincrement())` for FKs + `publicId String @unique @default(uuid()) @map("public_id") @db.VarChar(40)` for external surface |
| `npx prisma migrate dev` | `pnpm migration:create` / `migration:generate` / `migration:up` / `migration:show` / `db:drop` |
| Single `prisma/schema.prisma` | **Multi-file**: `prisma/schema/_base.prisma` (generator + datasource) + one file per domain (`auth.prisma`, `players.prisma`, `event-bus.prisma`, …) |
| Vercel / Lambda connection pool tuning | Project runs Docker Swarm + persistent Postgres on VPS. Connection pool tuned via `DATABASE_URL` query params if needed, never per-request handlers. |
| `cuid()` / `nanoid()` IDs | Project uses **UUID v4** for `publicId` via the publicId Prisma extension. Internal PKs stay `Int @id @default(autoincrement())`. |
| Schema lives in one file | `prisma format` works across the multi-file schema; don't merge it. |
| `npx prisma generate` | `pnpm prisma:generate` |

Before recommending a schema pattern, **`grep` the existing schema** (`grep -n "publicId\|@@map\|@db.Timestamptz" backend/prisma/schema/*.prisma`) and match what's there.

## 1. The Hybrid ID pattern (every business entity)

Internal PKs are integers (cheap FK joins). External IDs are UUID v4 strings with a domain prefix (Stripe-style, e.g. `usr_018f1e9a…`, `hnd_018f…`).

```prisma
model User {
  id        Int    @id @default(autoincrement())
  publicId  String @unique @default(uuid()) @map("public_id") @db.VarChar(40)

  email     String @unique @db.VarChar(255)
  // …

  createdAt DateTime @default(now())          @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy Int?    @map("created_by")        // auto-filled by audit extension
  updatedBy Int?    @map("updated_by")        // auto-filled by audit extension

  @@map("users")
}
```

**Rules:**
- Every business entity (Users, Clubs, Events, Hands, Posts, Players, Tournaments, Vouchers, …) gets `id` AND `publicId`.
- **Append-only logs** (`AuditLog`, `ActivityEntry`, `PlayerHistory`) also get `publicId` for forensic permalinks.
- **SKIP `publicId`** for:
  - Junction / lookup tables (addressable via parent)
  - High-volume hot-path tables: `HandAction`, `HandPlayerSnapshot`, `BoardRunout`, `HandSettlement`, `SettlementPot`, `SettlementWinner`
- **Never use the integer `id` externally.** API responses + URLs use `publicId`.
- The publicId Prisma extension auto-fills `publicId` on `create` / `createMany` / `upsert` — you don't write it by hand.

When writing a service that fetches an entity, query by `publicId` (not `id`):

```typescript
async findByPublicId(publicId: string): Promise<UserResDto> {
  const user = await this.prisma.user.findFirst({
    where: { publicId },
    include: this.defaultInclude,
  });
  if (!user) throw new NotFoundException(`User ${publicId} not found`);
  return plainToInstance(UserResDto, user);
}
```

## 2. The audit Prisma extension (actor tracking)

Models registered in `AUDIT_MODELS` (`src/shared/audit/audit.registry.ts`) automatically get `createdBy` / `updatedBy` populated on every write, sourced from the request actor in CLS context. Soft-delete models also get `deletedBy` / `deletedAt`.

**Required columns on every audited model:**
```prisma
createdBy Int? @map("created_by")
updatedBy Int? @map("updated_by")
// soft-delete models also:
deletedBy Int? @map("deleted_by")
deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)
```

**Domain-specific actor columns coexist** with the generic ones. Keep them where they encode workflow:
- `actorId`, `verifiedBy`, `requestedBy`, `reviewedBy`, `kycVerifiedBy`, `authorId`

**To add a new audited model:**
1. Add the columns above to the Prisma model.
2. Register the model name in `AUDIT_MODELS` in `src/shared/audit/audit.registry.ts`.
3. Optionally add `AUDITABLE_FIELDS[model]` if you want field-level audit log entries instead of "any change".
4. Don't manually set `createdBy` / `updatedBy` in your service — the extension does it. Manual sets get overwritten.

**Services never pass `userId` as a method arg** to satisfy the audit extension. The actor flows automatically via `RequestContextService` → CLS → Prisma extension. If you need the actor in business logic, read it explicitly:

```typescript
const userId = this.rcs.getUserId();   // not method arg
```

## 3. The publicId Prisma extension

Auto-fills `publicId` on `create`, `createMany`, `upsert` for any model that declares the field. You don't generate it by hand.

```typescript
// CORRECT — extension fills publicId
await this.prisma.user.create({
  data: { email: 'a@b.c', password: hashed },
});

// WRONG — manual publicId
await this.prisma.user.create({
  data: { publicId: 'usr_manual', email: 'a@b.c' /* … */ },
});
```

**Prefix table** lives in `src/shared/public-id/`. Adding a new model means adding its prefix there too.

For seed data + tests, manual `publicId` is fine (extension recognises explicit values and leaves them alone). Use them to keep fixtures stable:

```typescript
const fixture = { id: 1, publicId: 'usr_test01', email: 'a@b.c' };
```

## 4. Multi-file Prisma schema

`prisma format`, `pnpm prisma:generate`, `pnpm migration:*` all work across the multi-file layout. Don't merge into a single file.

```
backend/prisma/schema/
├── _base.prisma          # generator + datasource — DON'T add models here
├── auth.prisma           # User, Role, RefreshToken, OtpRequest
├── content.prisma        # Posts, Comments, etc.
├── event-bus.prisma      # outbox table
├── files.prisma          # uploads
├── notifications.prisma  # in-app notifs
├── organization.prisma   # Clubs, ClubMembers
└── players.prisma        # Players, ratings
```

**Adding a new domain:** create `prisma/schema/<domain>.prisma`, declare models there. Don't put models in `_base.prisma` — that file is reserved for `generator client {}` + `datasource db {}`.

**Cross-file relations work** — Prisma resolves models across the schema folder.

## 5. Column types — project conventions

| Type | Use |
|---|---|
| `Int @id @default(autoincrement())` | Internal PKs |
| `String @unique @default(uuid()) @db.VarChar(40)` | `publicId` |
| `String @db.VarChar(N)` | Bounded strings (emails, names, codes) |
| `String @db.Text` | Unbounded text (descriptions, JSON-as-string) |
| `Decimal @db.Decimal(18,2)` | Money, chip counts — **never `Float`** |
| `DateTime @db.Timestamptz(6)` | All timestamps — **never `Timestamp`** (without TZ) |
| `Json` (or `Json @db.JsonB`) | Semi-structured payloads — prefer JSONB explicitly |
| Enum (Prisma `enum`) | Small stable sets (`Role`, `HandStatus`, `Street`) |

**Default `@db.Timestamptz(6)`** for every datetime. The project uses microsecond precision consistently. Don't mix with bare `@db.Timestamp`.

**Snake_case in DB, camelCase in Prisma:**
```prisma
createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
@@map("users")
```

## 6. Indexes — minimum table

Every model should declare at minimum:
- PK (auto from `@id`)
- `@unique` on `publicId` (already in the boilerplate)
- `@unique` on `email` / `username` / similar external surface
- `@@index([foreignKeyId])` for every FK column (Postgres does NOT auto-index FKs)
- `@@index([createdAt])` if you query "recent N"
- `@@index([status, createdAt])` composite for `WHERE status = X ORDER BY createdAt DESC`

```prisma
model Hand {
  id        Int      @id @default(autoincrement())
  publicId  String   @unique @default(uuid()) @map("public_id") @db.VarChar(40)
  tableId   Int      @map("table_id")
  table     PokerTable @relation(fields: [tableId], references: [id])
  status    HandStatus
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  // …
  @@index([tableId])
  @@index([status, createdAt])
  @@map("hands")
}
```

## 7. Migrations — pnpm commands only

```bash
# Local dev — generate migration from schema changes
pnpm migration:generate

# Local dev — create empty migration (write SQL by hand)
pnpm migration:create

# Apply pending migrations
pnpm migration:up

# Show status
pnpm migration:show

# NUKE — wipes DB, re-applies all migrations, runs seeds
pnpm db:drop

# Re-generate Prisma client after schema change
pnpm prisma:generate
```

**Migration discipline:**
- One migration per logical change. Don't batch unrelated schema diffs.
- Migration name describes the intent: `add_public_id_to_clubs`, not `update`.
- Backfill scripts go in `prisma/seed-data/` as JSON + `seed:run`, or as a one-off NestJS command runner.
- **NEVER `prisma migrate dev` in production** — `MODULES_SET` builds + the deploy workflow handle production migrations via `prisma migrate deploy`.

**Schema drift check** before pushing:
```bash
pnpm migration:show
```
If pending migrations exist, generate + commit them.

## 8. Transactional outbox — when a write triggers an event

Domain writes that need to publish a durable event MUST go through the outbox pattern:

```typescript
await this.prisma.$transaction(async (tx) => {
  const hand = await tx.hand.update({
    where: { id }, data: { status: 'closed' },
  });

  // CORRECT — outbox row written INSIDE the same transaction
  await this.eventBus.emit(new TournamentHandClosed({ handPublicId: hand.publicId }), { tx });

  return hand;
});
// poller picks up the outbox row + dispatches to BullMQ post-commit
```

See the `event-bus-patterns` skill for the full pattern (durable vs ephemeral, the "no WS emit inside `$transaction`" rule that caused the 2026-04 `HandsCloseService` bug).

## 9. PrismaService lifecycle

`PrismaService` extends `PrismaClient` and implements NestJS lifecycle hooks:

```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**Don't instantiate `new PrismaClient()` anywhere else.** Inject `PrismaService` directly into services. No repository layer.

## 10. Query patterns — project preferences

### `defaultInclude` per service

```typescript
@Injectable()
export class UserService {
  private readonly defaultInclude = {
    profile: true,
    roles: { include: { role: true } },
  } satisfies Prisma.UserInclude;

  async findOne(publicId: string) {
    return this.prisma.user.findFirst({
      where: { publicId },
      include: this.defaultInclude,
    });
  }
}
```

Keeps relation loading consistent across the service's methods.

### Offset pagination — `OffsetPaginatedDto`

```typescript
async findMany(opts: ListUsersReqDto): Promise<OffsetPaginatedDto<UserResDto>> {
  const { page = 1, limit = 20, q, order = 'desc' } = opts;
  const where = q ? { email: { contains: q } } : {};
  const [data, total] = await Promise.all([
    this.prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: order },
      include: this.defaultInclude,
    }),
    this.prisma.user.count({ where }),
  ]);
  return plainToInstance(OffsetPaginatedDto<UserResDto>, {
    data: plainToInstance(UserResDto, data),
    pagination: { page, limit, total },
  });
}
```

Cursor pagination is scaffolded in the project but not actively used. Prefer offset unless you have a documented reason.

### Avoid N+1

```typescript
// BAD
const users = await this.prisma.user.findMany();
for (const u of users) {
  const profile = await this.prisma.profile.findFirst({ where: { userId: u.id } });
}

// GOOD — include + select to keep payload tight
const users = await this.prisma.user.findMany({
  include: { profile: { select: { id: true, displayName: true } } },
});
```

Reach for `$queryRaw` only for aggregations Prisma can't express. Pin the result type:

```typescript
const result = await this.prisma.$queryRaw<{ userId: number; count: bigint }[]>`
  SELECT user_id, COUNT(*) AS count FROM hands GROUP BY user_id
`;
```

## 11. CLS-aware writes (the actor flow)

Services don't take `userId` as a method arg. The actor flows via:

```
HTTP request
  → AuthGuard (validates JWT, populates `request['user']`)
  → RequestContextInterceptor (writes actor to nestjs-cls)
  → service method
  → Prisma write
  → audit Prisma extension reads CLS, fills createdBy / updatedBy
```

If you need the actor explicitly in business logic:

```typescript
constructor(private readonly rcs: RequestContextService) {}

async doThing() {
  const userId = this.rcs.getUserId();   // not from a method arg
  // …
}
```

`SYSTEM_ACTOR_ID` is the no-context fallback (used by background workers + tests without `cls.run()`).

## 12. Prisma error handling

```typescript
import { Prisma } from '@prisma/client';

try {
  await this.prisma.user.update({ where: { publicId }, data });
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') throw new NotFoundException(`User ${publicId} not found`);
    if (e.code === 'P2002') throw new ConflictException('Email already in use');
  }
  throw e;
}
```

The global exception filter (`src/filters/global-exception.filter.ts`) catches `Prisma.PrismaClientKnownRequestError` already — but specific business-error mapping belongs in the service, not the filter.

## 13. Seed data

JSON files in `prisma/seed-data/`. Loaded by `pnpm seed:run`. Idempotent: re-runs upsert by `publicId` (or business-key) so dev environments stay reproducible.

```bash
pnpm seed:run
```

Add a new seed:
1. JSON fixture in `prisma/seed-data/<domain>.json`
2. Loader in `prisma/seeders/<domain>.seeder.ts` using upsert
3. Wire into the seed runner

## 14. Connection management

DATABASE_URL is configured in `.env`. The project does NOT need per-request pool gymnastics (no Vercel / Lambda). Standard `PrismaClient` singleton in `PrismaService` is correct.

If a high-traffic deployment needs PgBouncer, configure at infrastructure level — not in the Prisma client.

## 15. Pre-flight checklist (Prisma work)

Before opening a PR that touches `prisma/schema/*.prisma`:

- [ ] Every new business model has `id Int @id @default(autoincrement())` + `publicId String @unique @default(uuid()) @map("public_id") @db.VarChar(40)`
- [ ] Every audited model has `createdBy Int? @map("created_by")` + `updatedBy Int? @map("updated_by")` + (if soft-deleted) `deletedBy` + `deletedAt`
- [ ] New audited model is registered in `AUDIT_MODELS`
- [ ] Every `DateTime` is `@db.Timestamptz(6)`
- [ ] Every `String` has either `@db.VarChar(N)` or `@db.Text` (no bare unbounded VarChar)
- [ ] Every money / chip value is `Decimal @db.Decimal(18,2)`, never `Float`
- [ ] Every FK column has `@@index([fkId])`
- [ ] Every `WHERE x = Y ORDER BY z` query has a composite `@@index([x, z])`
- [ ] Migration generated via `pnpm migration:generate` (or `:create` for manual SQL)
- [ ] Migration name describes intent (verb + noun)
- [ ] `pnpm prisma:generate` re-ran, types are fresh
- [ ] If the model is referenced in services: query by `publicId`, not `id`
- [ ] If the write produces a domain event: routed via `EventBusService.emit({ tx })` inside `$transaction`
- [ ] Backfill / data migration scripts are idempotent

## 16. Anti-patterns (project-specific)

- **Generating publicId manually** in service code — extension does it. Manual values get overwritten or duplicated.
- **Querying by integer `id` from external API surface** — breaks the publicId convention. Use `publicId` in all controller / service public methods.
- **Manually setting `createdBy` / `updatedBy`** — audit extension overwrites them from CLS.
- **`prisma.$transaction` + `EventEmitter2.emit()` inside the callback** — real fixed bug class. WS broadcasts emitted inside a transaction fire BEFORE the commit, so consumers see "the hand closed" before the row actually exists. Use `eventBus.emit({ tx })` for durable events; use a `queueMicrotask` post-commit for ephemeral if you must.
- **Adding a new datetime without `@db.Timestamptz(6)`** — silent timezone drift.
- **`Float` for money** — silent precision loss. Use `Decimal @db.Decimal(18,2)`.
- **Single `schema.prisma` merge** — breaks the multi-file convention. New domains get their own file.
- **`npx prisma migrate dev` in CI / prod** — use `pnpm migration:*` locally + `prisma migrate deploy` in production via the deploy workflow.
- **Storing JSON when relational shape exists** — JSON for genuinely semi-structured payloads (event metadata, file metadata), NOT for "I'll model it later".

## 17. When generic skills conflict

Generic Prisma tutorials, Prisma Cloud docs, and the `database-design` reference material below all assume a single-file schema with `cuid()` IDs and no extensions. **They're correct for greenfield projects. They're wrong for this one.**

If a generic skill says "use `cuid()` for IDs", this skill wins — the project uses Hybrid IDs with int PKs and UUID `publicId`.

If a generic skill says "set `createdBy` manually in the service", this skill wins — the audit extension does it.

If a generic skill says "run `npx prisma migrate dev`", this skill wins — `pnpm migration:*`.

---

## References (general PostgreSQL / Prisma theory — read for background)

- [`core-rules.md`](core-rules.md) — PostgreSQL design rules (TIMESTAMPTZ, BIGINT vs INT, FK indexing, JSONB, etc.). Solid general-purpose reference.
- [`schema-design.md`](schema-design.md) — Normalization, PK selection, timestamp strategy.
- [`indexing.md`](indexing.md) — Index types, composite indexes, when to use GIN / GiST.
- [`optimization.md`](optimization.md) — Query plans, N+1 mitigation, EXPLAIN ANALYZE.
- [`migrations.md`](migrations.md) — General migration safety. Project uses Prisma migrate via `pnpm migration:*` (not the raw SQL workflow described here).
- [`database-selection.md`](database-selection.md) — PostgreSQL vs Neon vs Turso vs SQLite. Project locked on PostgreSQL 16 — not actively relevant.
- [`orm-selection.md`](orm-selection.md) — Drizzle vs Prisma vs Kysely. Project locked on Prisma 6 — not actively relevant.

**Read the subfiles for theory; this SKILL.md is the source of truth for project conventions.**
