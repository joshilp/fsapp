# Tests

This directory contains the Playwright test suite for fsapp. Tests cover both
full-browser E2E workflows and API-level contract validation.

## Quick start

```bash
# Run all tests (starts the dev server automatically if not already running)
pnpm test

# Open Playwright's interactive UI — best for debugging and writing new tests
pnpm test:ui

# Run with a visible browser window
pnpm test:headed

# Run only API tests (no browser, much faster)
pnpm test:api

# Open the last HTML report
pnpm test:report
```

## Prerequisites

### 1. Test credentials in .env

`pnpm test` automatically creates (or updates) the test user in `local.db`
via `tests/setup/global-setup.ts` — no manual seed step needed. Just make
sure these are set in `.env` (defaults already present):

```env
TEST_EMAIL=admin@example.com
TEST_PASSWORD=yourpassword
```

The global setup runs before every `pnpm test` call and upserts that user
as an approved admin, so the password in `.env` is always what Playwright
uses to log in, regardless of what's in the database.

### 2. Configure Channex test IDs (for Channex tests)

To run Channex webhook and ARI tests, set the Channex UUIDs for one of your
properties and room types. Find these in Settings → Channels after you've
configured Channex IDs for a property.

```env
TEST_CHANNEX_PROPERTY_ID=<uuid from local.db properties.channex_property_id>
TEST_CHANNEX_ROOM_TYPE_ID=<uuid from local.db room_types.channex_room_type_id>
TEST_CHANNEX_RATE_PLAN_ID=<uuid from local.db room_types.channex_rate_plan_id>
TEST_ROOM_TYPE_ID=<uuid from local.db room_types.id>
```

If these are not set, the relevant tests are **skipped** (not failed) with a
clear message explaining what to set.

### 3. Enable mock mode

```env
CHANNEX_MOCK=true
```

This is already set in .env by default. It routes ARI pushes to the local log
instead of the real Channex API, and enables the /dev/channex simulator page.

---

## Directory structure

```
tests/
  setup/
    global-setup.ts       Runs before any test. Creates/updates the test user
                          in local.db using TEST_EMAIL + TEST_PASSWORD from .env.
                          This makes `pnpm test` fully self-contained — no manual
                          seed step required.
    auth.setup.ts         Logs in once, saves session to .playwright/auth.json.
                          Runs before all other tests. Re-run if you change your
                          test user password.

  fixtures/
    index.ts              Re-exports `test` and `expect` with custom fixtures.
                          Always import from here, not from @playwright/test.
    data-factories.ts     Functions that create consistent test payloads.
                          Use these instead of scattering inline objects in tests.
    page-objects/         (future) UI abstractions — e.g. BookingGrid.ts wraps
                          drag-select and booking creation so tests read like
                          business requirements rather than CSS selectors.

  schemas/
    channex.schema.ts     TypeScript interfaces + validate() functions for the
                          Channex API contract. These document exactly what
                          Channex expects. If Channex updates their API, update
                          the schema first, then fix failing tests.

  e2e/
    01-smoke.spec.ts      App loads, nav is visible, unauthenticated redirects.
    02-channex-webhook.spec.ts  Full flow: fire mock webhook → booking created.

  api/
    channex-ari-format.spec.ts   Validates ARI push payloads against schema.
    channex-webhook-parse.spec.ts  Tests all webhook event types + signature check.
```

---

## How to add a new test

### Adding a test case to an existing file

Open the relevant spec file and add a `test(...)` block inside the existing
`test.describe(...)`. Follow the pattern:

```ts
test('description of the business rule being tested', async ({ page, apiContext }) => {
  // Arrange — set up state
  // Act — perform the action
  // Assert — verify the outcome with descriptive expect messages
  expect(result, 'human-readable description of what should be true').toBe(expected);
});
```

### Adding a new spec file

1. Create `tests/e2e/XX-name.spec.ts` or `tests/api/name.spec.ts`
2. Start with a block comment explaining the business scenario, acceptance
   criteria, and prerequisites (see existing files for the pattern)
3. Import from `'../fixtures'` (not directly from `@playwright/test`)
4. Use `data-factories.ts` for test data rather than inline strings

### Adding a new page object

If a test needs to interact with a complex UI (e.g. the booking grid), create
a class in `tests/fixtures/page-objects/`. The class wraps Playwright locators
and exposes high-level methods:

```ts
// tests/fixtures/page-objects/BookingGrid.ts
export class BookingGrid {
  constructor(private page: Page) {}

  async openBookingCard(roomNumber: string, date: string) {
    // ... implementation
  }
}
```

Then add it as a fixture in `tests/fixtures/index.ts`.

---

## How auth works

`tests/setup/global-setup.ts` upserts the test user in `local.db` before
anything else runs.

`tests/setup/auth.setup.ts` then logs in with those credentials and saves
the browser storage state (cookies + localStorage) to `.playwright/auth.json`.
All subsequent tests load this file and start pre-authenticated.

`.playwright/auth.json` is gitignored and regenerated on every `pnpm test`
run, so it always reflects the current session.

If you see auth-related test failures, check that `TEST_EMAIL` and
`TEST_PASSWORD` in `.env` match what you expect, then re-run.

---

## Current test coverage

| Area | Coverage |
|------|----------|
| App loads / navigation | ✅ smoke test |
| Channex webhook → booking_new | ✅ (requires Channex IDs in .env) |
| Channex webhook → booking_cancel | ✅ (requires Channex IDs in .env) |
| ARI payload format (rate in dollars) | ✅ (requires TEST_ROOM_TYPE_ID) |
| ARI payload format (date format) | ✅ (requires TEST_ROOM_TYPE_ID) |
| Webhook signature verification | ✅ |
| Booking creation via BookingCard | 🔲 not yet |
| Check-in / check-out flow | 🔲 not yet |
| Group booking workflow | 🔲 not yet |
| Deposit pending → received | 🔲 not yet |

---

## Debugging failing tests

```bash
# Run a single file
pnpm test tests/api/channex-ari-format.spec.ts

# Run a single test by name
pnpm test --grep "rate value is in dollars"

# Show browser (see what's happening visually)
pnpm test:headed

# Step through in Playwright UI
pnpm test:ui

# Re-run only failed tests
pnpm test --last-failed
```

Traces and screenshots for failed tests are saved in `test-results/`.
Run `pnpm test:report` to open the full HTML report.
