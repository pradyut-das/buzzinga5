# ADR 015: Testing Setup

We use Playwright for end-to-end testing of high-level user flows.

- **E2E testing only** - Focus on testing complete user workflows, not individual component interactions
- **Playwright** - Single tool for all E2E testing needs
- **Test database isolation** - Each test run uses a separate `test.db` file
- **Real browser testing** - Tests run in actual Chromium browsers

## Hard Rules (Non-Negotiable)

1. **Never skip tests** - No `test.skip()`, `test.fixme()`, or any skipping mechanism. If a test can't be made reliable, delete it entirely.
2. **Flaky tests are bugs** - If a test is unreliable in our controlled test environment, the underlying code is unreliable for users too. Fix it.
3. **No overlapping tests** - If two tests cover the same scenario with minor variations, merge them or keep only one.
4. **Speed matters** - Tests run in parallel. Slow tests block iteration. Optimize aggressively.

## When Tests Reveal App Issues: FIX THE APP

**This is critical.** When a flaky test reveals a real app problem, the priority is:

1. **FIX THE APP** - not just the test
2. Real users experience the same issues
3. A "passing" test suite with workarounds is a lie

**Example:** If a test fails because navigating away before sync completes causes data loss:

- **WRONG:** Simplify the test to avoid the navigation scenario
- **RIGHT:** Fix the app to ensure sync completes or data persists locally

**Ask yourself:** "Would a real user hit this problem?" If yes, the app is broken - not just the test.

Workarounds in tests that mask real app issues are technical debt. They let bugs ship to users while giving false confidence. Always prioritize user experience over green test runs.

## Flaky Failures vs Hard Failures

Retries help distinguish failure types. Both are bugs requiring different debugging approaches:

| Failure Type | Behavior                         | Debugging Approach                                               |
| ------------ | -------------------------------- | ---------------------------------------------------------------- |
| **Flaky**    | Fails initially, passes on retry | Race conditions, timing issues, async patterns, missing waits    |
| **Hard**     | Fails all retries                | Logic bugs, broken selectors, missing elements, real regressions |

## Test Organization

All Playwright tests and utilities are located in the `playwright/` directory:

```
playwright/
├── playwright.config.ts       # Playwright configuration
├── global-setup.ts            # Database reset before all tests
├── board-creation.spec.ts     # Board creation flow tests
├── board-unlock.spec.ts       # Board unlock/access flow tests
├── task-management.spec.ts    # Task CRUD operations tests
├── comments.spec.ts           # Comments flow tests
├── contributors.spec.ts       # Contributors management tests
├── columns.spec.ts            # Columns management tests
└── utils/
    ├── db.ts                  # Database helper utilities
    └── playwright.ts          # Playwright test helpers
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in UI mode (interactive)
pnpm test:ui

# Run tests in debug mode
pnpm test:debug

# Run specific test file
pnpm test playwright/board-creation.spec.ts
```

## Test Database

- Tests use a separate `test.db` file (not `local.db`)
- Database is reset before all tests run via `global-setup.ts`
- The build step automatically initializes the database with `pnpm db:push`
- Environment variable `TURSO_DATABASE_URL=file:test.db` is set for test runs

## Configuration

The Playwright config (`playwright/playwright.config.ts`) includes:

- **Test server**: Automatically builds and starts Next.js production server on port 5800
- **Test database**: Uses `file:test.db` via environment variable
- **Browser**: Chromium only
- **Retries**: 2 retries (for flakiness detection, not to hide bugs)
- **Screenshots/Videos**: Captured on failure for debugging
- **Parallel execution**: Enabled (`fullyParallel: true`) with multiple workers
- **Timeouts**: All timeouts configured globally (no per-test overrides allowed):
  - `timeout: 30000` - 30 seconds maximum per test
  - `expect.timeout: 10000` - 10 seconds for assertions
  - `actionTimeout: 10000` - 10 seconds for actions
  - `navigationTimeout: 10000` - 10 seconds for navigation

## Avoiding Overlapping Tests

Before adding a new test, ask:

1. **Does an existing test already cover this?** If yes, don't add a new one.
2. **Is this a minor variation of an existing test?** If yes, merge it into the existing test.
3. **Would users actually hit this scenario?** If it's a theoretical edge case, skip it.

**Example - Password Change Feature:**

Good (2 tests):

- Happy path: change password, verify success, stays logged in
- Security: old password fails after change, new password works

Avoid (8+ separate tests):

- Cancel button, empty validation, mismatch validation, redirect scenarios, etc.

## Best Practices

1. **Use semantic selectors** - Prefer `getByRole`, `getByLabel`, `getByText` over CSS selectors
2. **Wait for elements** - Use Playwright's auto-waiting, avoid manual `sleep()` calls
3. **Test user flows** - Focus on what users do, not implementation details
4. **Keep tests independent** - Each test should work in isolation
5. **No explicit timeouts** - Always use global timeout configuration

## Known Limitations

Some scenarios cannot be reliably tested with Playwright's synthetic events:

- **Complex editor interactions** - Some rich text editor behaviors require real browser events that can't be synthesized.

These are documented here rather than kept as skipped tests.

## Gotchas (Lessons Learned)

These are recurring root causes behind timeouts/flaky E2E tests. Check these first when debugging.

### Selector collisions (Playwright strict mode)

- Scope queries to a container:
  - Example: `const sidebar = page.getByRole("dialog", { name: /edit task/i })`
  - Then query within it: `sidebar.getByRole("combobox", { name: /assignees/i })`
- Avoid `getByText(/foo/i)` when the same text can appear in multiple places
- Disambiguate with `.first()` / `.nth()` or a more specific role-based locator

### Accessibility drives testability

We rely on `getByRole(..., { name })` heavily. That requires proper accessible names.

- Icon-only buttons must have `aria-label` (and ideally `title`)
- Custom combobox triggers must have an accessible name via `aria-label` or associated `<label>`

### Escape key closes the wrong layer

`Escape` can close popovers/menus (desired) or the whole sidebar (undesired), depending on focus.

- Prefer closing via explicit UI controls (e.g. `Back` button) instead of `page.keyboard.press("Escape")`
- Close selection popovers after selecting/creating items to avoid needing Escape

### Optimistic updates should keep stable identities

If the UI swaps an optimistic entity ID for a server ID, it can detach nodes Playwright is interacting with.

- Create entities with deterministic IDs when possible (client generates, server accepts)
- If replacement is unavoidable, ensure the UI remains stable during critical interactions

### Drag and drop needs explicit handles

For DnD (dnd-kit):

- Provide a dedicated drag handle button with listeners
- Don't attach drag listeners to large interactive regions
- Use pointer-based dragging that matches the app's sensor/activation constraints
