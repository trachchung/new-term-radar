# NestJS Backend Test Patterns (project-specific)

Detailed templates for unit and e2e specs, calibrated to this codebase's conventions. Pair this with `SKILL.md`. Code is copy-paste-ready against the real path aliases (`@/api`, `@/shared`, `@/database`, `@/guards`).

## Unit spec template — service

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/database/prisma/prisma.service';
import { RequestContextService } from '@/shared/request-context/request-context.service';
import { ClsModule } from 'nestjs-cls';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let prisma: any; // project ESLint allows `any`; swap for Partial<Record<keyof PrismaService, ...>> if you prefer
  let module: TestingModule;

  beforeAll(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    module = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [
        UserService,
        RequestContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(UserService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await module.close();
  });

  describe('findByPublicId', () => {
    it('returns the user when the publicId matches', async () => {
      const fixture = { id: 1, publicId: 'usr_test01', email: 'a@b.c' };
      prisma.user.findFirst.mockResolvedValue(fixture);

      const result = await service.findByPublicId('usr_test01');

      expect(result).toEqual(expect.objectContaining({ publicId: 'usr_test01' }));
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { publicId: 'usr_test01' } }),
      );
    });

    it('throws NotFoundException when no user exists', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findByPublicId('usr_missing'))
        .rejects.toThrow(/not found/i);
    });
  });
});
```

## Unit spec template — controller (with DTO validation)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;
  let userService: Partial<Record<keyof UserService, jest.Mock>>;

  beforeAll(async () => {
    userService = {
      create: jest.fn(),
      findByPublicId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: userService }],
    }).compile();

    controller = module.get(UserController);
  });

  beforeEach(() => jest.clearAllMocks());

  describe('createUser', () => {
    it('passes the DTO straight through to the service', async () => {
      const dto = { username: 'john', email: 'a@b.c', password: 'pw1234' } as CreateUserReqDto;
      userService.create.mockResolvedValue({ publicId: 'usr_new01' });

      const result = await controller.createUser(dto);

      expect(result.publicId).toBe('usr_new01');
      expect(userService.create).toHaveBeenCalledWith(dto);
    });
  });

  // DTO validation lives in a nested describe — class-validator runs against
  // the real DTO class, no Nest pipe needed.
  describe('CreateUserReqDto', () => {
    it('rejects an invalid email', async () => {
      const dto = plainToInstance(CreateUserReqDto, {
        username: 'john', email: 'invalid', password: 'pw1234',
      });
      const errors = await validate(dto);
      expect(errors[0].constraints).toEqual({ isEmail: 'email must be an email' });
    });
  });
});
```

## Unit spec template — guard

```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '@/api/auth/auth.service';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Partial<Record<keyof Reflector, jest.Mock>>;
  let authService: Partial<Record<keyof AuthService, jest.Mock>>;
  let context: Partial<Record<keyof ExecutionContext, jest.Mock>>;
  let module: TestingModule;

  beforeAll(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    authService = { verifyAccessToken: jest.fn() };
    context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({ getRequest: jest.fn() }),
    };

    module = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: authService },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();
    guard = module.get(AuthGuard);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('allows public routes', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    await expect(guard.canActivate(context as ExecutionContext)).resolves.toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('throws when no token is provided on a protected route', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false); // isPublic
    reflector.getAllAndOverride.mockReturnValueOnce(false); // isAuthOptional
    context.switchToHttp().getRequest.mockReturnValue({ headers: {} });

    await expect(guard.canActivate(context as ExecutionContext))
      .rejects.toThrow(UnauthorizedException);
  });
});
```

## Unit spec template — CLS-aware service

```typescript
import { ClsModule, ClsService } from 'nestjs-cls';
import { Test } from '@nestjs/testing';
import { RequestContextService } from '@/shared/request-context/request-context.service';
import { SYSTEM_ACTOR_ID } from '@/shared/request-context/constants';
import { AuditingService } from './auditing.service';

describe('AuditingService', () => {
  let cls: ClsService;
  let rcs: RequestContextService;
  let service: AuditingService;
  let prisma: any;

  beforeEach(async () => {
    prisma = { auditLog: { create: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [
        RequestContextService,
        AuditingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    cls = moduleRef.get(ClsService);
    rcs = moduleRef.get(RequestContextService);
    service = moduleRef.get(AuditingService);
  });

  it('writes the actor id from CLS context', async () => {
    await cls.run(async () => {
      rcs.setActor({ userId: 42, role: 'admin', permissions: [], sessionId: undefined });
      await service.record({ action: 'user.update', entityId: 'usr_x' });
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorId: 42 }) }),
    );
  });

  it('falls back to SYSTEM_ACTOR_ID when no CLS context', async () => {
    await service.record({ action: 'system.purge', entityId: 'sys_x' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorId: SYSTEM_ACTOR_ID }) }),
    );
  });
});
```

## Unit spec template — EventBus emitter

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

describe('HandsCloseService', () => {
  let service: HandsCloseService;
  let prisma: any;
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tournamentHand: { update: jest.fn() },
      outbox: { create: jest.fn() },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    emitter = { emit: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        HandsCloseService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = moduleRef.get(HandsCloseService);
  });

  it('writes the durable event to outbox inside the transaction', async () => {
    await service.closeHand('hnd_test01');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.outbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'TournamentHandClosed' }),
      }),
    );
  });

  it('does NOT emit the WS broadcast inside the transaction', async () => {
    // Regression guard: WS-inside-tx was a real fixed bug class.
    let emitCalledInsideTx = false;
    prisma.$transaction.mockImplementation(async (cb: any) => {
      const result = await cb(prisma);
      emitCalledInsideTx = emitter.emit.mock.calls.length > 0;
      return result;
    });

    await service.closeHand('hnd_test01');
    expect(emitCalledInsideTx).toBe(false);
    expect(emitter.emit).toHaveBeenCalledWith('hand.closed', expect.anything());
  });
});
```

## E2E spec template

```typescript
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { AuthGuard } from '@/guards/auth.guard';

describe('Tournaments (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/tournaments returns paginated list', () =>
    request(app.getHttpServer())
      .get('/api/v1/tournaments')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            data: expect.any(Array),
            pagination: expect.any(Object),
          }),
        );
      }));
});
```

To exercise role checks instead of bypassing the guard, mock `AuthService.verifyAccessToken` to return a payload:

```typescript
.overrideProvider(AuthService).useValue({
  verifyAccessToken: jest.fn().mockReturnValue({ id: 1, role: 'admin' }),
})
```

## DB cleanup strategies (e2e)

Project currently has no shared cleanup utility. Pick one and document it next to the spec:

### Option A — `pnpm db:drop` between full suite runs

Simplest. Runs `prisma migrate reset --force`. Fine for CI, slow locally.

### Option B — Per-spec `TRUNCATE`

```typescript
afterEach(async () => {
  await prisma.$executeRaw`TRUNCATE TABLE "Tournament", "User" RESTART IDENTITY CASCADE;`;
});
```

Use when a spec writes data and would pollute later specs. List tables touched explicitly — `RESTART IDENTITY CASCADE` keeps PK sequences predictable.

### Option C — Transaction rollback

Open a transaction in `beforeEach`, roll back in `afterEach`. Requires `PrismaService` to expose a query-runner-like handle; not trivial with the current setup. Document if you build it.

## Test data builders

For complex domain entities (TournamentHand, Player), build fluent factories:

```typescript
class HandFixtureBuilder {
  private hand = {
    id: 1,
    publicId: 'hnd_test01',
    status: 'IN_PROGRESS' as const,
    actions: [] as Array<{ playerId: number; action: string }>,
  };

  withStatus(status: 'IN_PROGRESS' | 'CLOSED'): this {
    this.hand.status = status;
    return this;
  }

  withAction(playerId: number, action: string): this {
    this.hand.actions.push({ playerId, action });
    return this;
  }

  build() {
    return { ...this.hand };
  }
}

// Usage
const closedHand = new HandFixtureBuilder().withStatus('CLOSED').build();
```

Keep builders near the spec that uses them. Promote to `test/builders/` once 3+ specs share one.

## Quick-reference table

| Need | Pattern |
|---|---|
| Mock service dependency | `Partial<Record<keyof X, jest.Mock>>` |
| Mock Prisma model | Inline `{ model: { method: jest.fn() } }` |
| Mock `$transaction` | `$transaction: jest.fn((cb) => cb(prisma))` |
| CLS-aware test | `imports: [ClsModule.forRoot({ global: true })]` + `cls.run(...)` |
| Bypass global `AuthGuard` in e2e | `.overrideGuard(AuthGuard).useValue({ canActivate: () => true })` |
| Mock JWT payload (keep guard logic) | `.overrideProvider(AuthService).useValue({ verifyAccessToken: jest.fn().mockReturnValue({...}) })` |
| Mock BullMQ queue | `{ provide: getQueueToken('name'), useValue: { add: jest.fn() } }` |
| Reset between tests | `beforeEach(() => jest.clearAllMocks())` |
| One-shot module build | `beforeAll(async () => { module = await Test.createTestingModule(...).compile(); })` |
| Tear down | `afterAll(async () => { await module.close(); })` |
