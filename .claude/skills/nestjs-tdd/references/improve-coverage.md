---
description: Workflow for raising test coverage on a target file or module in the NestJS backend
---

# Improve Test Coverage Workflow

Use when the user says "raise coverage on X" or "this file is undertested." Follow the steps in order.

## 1. Set the target

The project's `jest.config.json` does **not** set `coverageThreshold`. Pick an explicit target with the user (default: 90% statements, 80% branches on the file or module under work — coverage padding for the whole repo is not the goal).

## 2. Baseline

```bash
cd backend
pnpm test:cov 2>&1 | tail -30
```

Record per-file metrics for the target file: `% Stmts | % Branch | % Funcs | % Lines`.

## 3. Identify gaps

```bash
# Print just files below 90% statements
pnpm test:cov --coverageReporters=text 2>&1 | grep -E '\|\s+[0-7][0-9]\.'
```

Prioritise:

1. Core business logic (services, hand-state machines, settlement engines)
2. Most-used infrastructure (`PrismaService` callers, `AuthGuard`, `AuthService`)
3. Utilities (`src/utils/`, `src/common/`)

## 4. Write the missing specs (per file)

For each undercovered file:

- **Read the source** — list all branches: `if/else`, `switch`, `try/catch`, `??`, `?.`, ternaries, early returns
- **Read the existing spec** if present — list which paths are already covered
- **Read the DTO/entity** files referenced — confirm field names before writing fixtures (don't guess)
- Follow [SKILL.md → Project mocking idioms](../SKILL.md) — `Partial<Record<keyof X, jest.Mock>>`, inline Prisma mocks, CLS wrapping if needed
- Cover error paths: Prisma `P2025` (record not found), `P2002` (unique constraint), `UnauthorizedException`, malformed input

## 5. Lint after each batch

```bash
pnpm lint
# Or scope it
npx eslint --no-warn-ignored src/api/<feature>/<feature>.service.spec.ts
```

Fix immediately. Do **not** add `eslint-disable` lines to specs.

## 6. Re-run the focused suite

```bash
pnpm test -- src/api/<feature>
```

## 7. Re-measure coverage

```bash
pnpm test:cov 2>&1 | tail -30
```

Compare to baseline. If still under target, return to step 3 and pick the next undercovered branch.

## 8. Final validation

- All tests pass (zero failures)
- All lint clean (zero errors)
- Per-file coverage at target for the touched file
- No `eslint-disable` or `@ts-ignore` introduced in specs
- No `// TODO: write unit test` left behind for the methods you tackled

## Anti-patterns

| Don't | Do |
|---|---|
| Add `expect(service).toBeDefined()` to pad coverage | Test actual behavior — input → output, side effects |
| Guess DTO shape from memory | Open the DTO file, copy field names |
| `eslint-disable` to silence type errors | Fix the type — see [strict-typescript-testing.md](./strict-typescript-testing.md) |
| Batch lint at the end | Lint after each file — easier to fix in context |
| Aim for 100% | 100% means meaningless tests on getters and `*.module.ts`. Aim 85–95% on the target file |

## Related

- [SKILL.md](../SKILL.md) — Project test patterns and TDD discipline
- [patterns.md](./patterns.md) — Copy-paste spec templates
- [strict-typescript-testing.md](./strict-typescript-testing.md) — Type-safe mock patterns

## Notes for this project

- `coveragePathIgnorePatterns` in `jest.config.json` already excludes `*.module.ts`, `main.ts`, `src/database/{factories,migrations,seeds}/`. Don't try to "cover" those.
- `setup-jest.mjs` seeds env vars — coverage runs use the same env, so DB-dependent code paths still need their Prisma mocks.
- `pnpm test:cov` does NOT run e2e specs (separate config). E2E coverage is not currently measured.
