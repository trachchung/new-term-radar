# Strict TypeScript Testing Patterns

Patterns for writing Jest specs that pass `typescript-eslint` `recommendedTypeChecked` rules.

## When this applies

**This project's ESLint config does NOT enable `recommendedTypeChecked`.** `eslint.config.mjs` sets `no-explicit-any: off`, so `let prismaServiceValue: any` is accepted in specs.

**Default project idiom** for typed mocks is:

```typescript
let userService: Partial<Record<keyof UserService, jest.Mock>>;
```

Use the patterns below if:

- A linter rule is later enabled and existing specs need to be cleaned up
- You're porting a spec from a sibling project that uses strict TS
- You want extra safety for a critical-path spec (auth, payments, audit)

## 1. Mock typing — alternatives to `any`

```typescript
// Project default (accepted, lenient)
let mockUsersService: any;

// Strict alternative 1 — Partial<Record<keyof X, jest.Mock>> (the project's preferred typed form)
let mockUsersService: Partial<Record<keyof UsersService, jest.Mock>>;

// Strict alternative 2 — jest.Mocked<Pick<...>>
const mockUsersService: jest.Mocked<Pick<UsersService, 'findByEmail' | 'update'>> = {
  findByEmail: jest.fn(),
  update: jest.fn(),
};
```

## 2. `Partial<Record<keyof ExecutionContext, jest.Mock>>` for guard contexts

The auth guard spec uses this form — copy it for any guard test:

```typescript
let context: Partial<Record<keyof ExecutionContext, jest.Mock>>;

context = {
  getHandler: jest.fn(),
  getClass: jest.fn(),
  switchToHttp: jest.fn().mockReturnValue({ getRequest: jest.fn() }),
};

// Cast at the call site
guard.canActivate(context as ExecutionContext);
```

## 3. Jest asymmetric matchers + strict TS

`expect.anything()`, `expect.any()`, `expect.objectContaining()` return `any`. Nested inside `expect.objectContaining({})`, they trigger `no-unsafe-assignment` under strict TS.

```typescript
// Strict TS — cast nested matchers to unknown
expect(mockFn).toHaveBeenCalledWith(
  expect.objectContaining({
    createdAt: expect.anything() as unknown,
    items: expect.arrayContaining([
      expect.objectContaining({ id: 1 }),
    ]) as unknown,
  }),
);
```

Top-level matchers (directly inside `toHaveBeenCalledWith()` or `toEqual()`) don't need casting — those args accept `unknown`.

## 4. Null entity fields

```typescript
// Strict TS
const member = {
  user: null as unknown as User,
  child: null as unknown as Child,
};
```

## 5. Private method access (when coverage demands it)

Prefer testing through the public API. When a private method has branch logic that can't be reached publicly:

```typescript
type IsLimitReached = (feature: string, count: number) => boolean;

const callIsLimitReached = (
  svc: FeatureLimitService,
  feature: string,
  count: number,
): boolean =>
  (svc as unknown as { isLimitReached: IsLimitReached })
    .isLimitReached(feature, count);

expect(callIsLimitReached(service, 'photos', 5)).toBe(true);
```

## 6. DTO mock verification

Always read the actual DTO class before writing fixtures. Don't guess field names:

```typescript
// 1. Open backend/src/api/<feature>/dto/<dto>.req.dto.ts
// 2. Confirm field names — e.g., the actual field is `latestTermsVersion`, not `termsVersion`
const dto: UpdateTermsDto = { latestTermsVersion: '2.0' };
```

## 7. `ConfigService` mocks

```typescript
const mockConfig = { get: jest.fn() } as unknown as ConfigService;
```

## 8. Unused variables

```typescript
// Use prefix `_` to suppress unused-var warnings (project config respects argsIgnorePattern: '^_')
const _unusedButResolvable = module.get<ConfigService>(ConfigService);

// Or just don't declare it
module.get<ConfigService>(ConfigService); // verifies it resolves
```

## 9. Import style — no `require()`

```typescript
import * as redisConfig from './redis.config';
jest.spyOn(redisConfig, 'getRedisOptions').mockReturnValue({ host: 'localhost' });
```

## 10. `catch (e)` typing

```typescript
try {
  await service.something();
} catch (e: unknown) {
  expect((e as Error).message).toMatch(/expected/);
}
```

## Quick reference

| Problem | Lenient (project default) | Strict TS alternative |
|---|---|---|
| Mock service | `let svc: any` | `Partial<Record<keyof X, jest.Mock>>` |
| Cast value | `as any` | `as unknown as TargetType` |
| Nested matcher | `expect.anything()` | `expect.anything() as unknown` |
| Null field | `null as any` | `null as unknown as Entity` |
| Private method | `(svc as any)['m']()` | typed helper with explicit fn type |
| Caught error | `catch (e: any)` | `catch (e: unknown)` + cast |

**Rule of thumb for this project:** start with the lenient form. Only reach for the strict form if you hit a lint error, the spec is on a critical path, or a future ESLint upgrade demands it.
