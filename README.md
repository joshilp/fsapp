# fsapp — Hotel Property Management System

A mobile-friendly, cloud-deployable PMS for small motel/hotel operators.
Built with SvelteKit 5, Drizzle ORM, SQLite (better-sqlite3), and Tailwind CSS.

---

## Features

- **Booking Grid** — drag-to-select rooms and dates; side-by-side or focus layout per property
- **BookingCard** — full booking lifecycle: reserve → confirm → check-in → check-out → cancel
- **Group Bookings** — multi-room group card with master date range, shared folio, payment transfers
- **Inventory / ARI Calendar** — availability, rates, and restrictions grid with inline editing
- **Channex.io Integration** — channel manager sync; push ARI to OTAs, receive booking webhooks
- **Channex Mock Mode** — test the full integration locally without a paid account (`/dev/channex`)
- **Deposit Workflow** — pending deposits with "Mark received" and auto-promote to Confirmed
- **Folio / Ledger** — line-item charges, taxes, payments, balance-due display
- **Guest Profiles** — auto-complete, address, vehicle, waiver, behaviour rating
- **Housekeeping View** — room status board
- **Reports** — occupancy and revenue summaries
- **Email Confirmations** — mailto deep-link or Resend API integration
- **Roles** — admin approval required; admin sees Users page

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | SvelteKit 5 (Svelte 5 Runes) |
| Database | SQLite via `better-sqlite3` |
| ORM | Drizzle ORM |
| Auth | better-auth (email + password) |
| Styling | Tailwind CSS v4 + shadcn-svelte components |
| Email | Resend (optional) |
| Channel Manager | Channex.io (optional, mock available) |
| Testing | Playwright |

---

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`. Required fields:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Path to SQLite file, e.g. `local.db` |
| `BETTER_AUTH_SECRET` | Random 32-char string for session signing |
| `ORIGIN` | App URL, e.g. `http://localhost:5173` |

Optional:

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend.com API key for email sending |
| `RESEND_FROM_EMAIL` | Sender address (must be verified domain) |
| `CHANNEX_API_KEY` | Channex.io API key for OTA sync |
| `CHANNEX_WEBHOOK_SECRET` | Webhook signature secret (optional) |
| `CHANNEX_MOCK` | Set `true` to log ARI locally instead of calling Channex |

### 3. Initialise the database

```bash
pnpm db:push        # apply schema to local.db
pnpm db:seed        # seed properties, rooms, channels, tax presets
```

### 4. Create an admin user

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=changeme ADMIN_NAME="Your Name" pnpm db:seed:admin
```

### 5. Start the dev server

```bash
pnpm dev
```

Open `http://localhost:5173` and sign in.

---

## Database scripts

```bash
pnpm db:push           # sync schema to database (dev)
pnpm db:generate       # generate a Drizzle migration file
pnpm db:migrate        # apply pending migrations
pnpm db:studio         # open Drizzle Studio (visual DB browser)
pnpm db:seed           # seed base data (properties, rooms, channels)
pnpm db:seed:demo      # seed ~20 realistic demo bookings
pnpm db:seed:reset     # wipe demo bookings and re-seed
pnpm db:seed:admin     # create or update admin user (needs ADMIN_* env vars)
```

---

## Channex Integration

Channex.io is a certified channel manager that syncs your rates and availability
to OTAs (Booking.com, Expedia, Airbnb, etc.) and sends booking webhooks back.

### Mock mode (recommended while developing)

Set `CHANNEX_MOCK=true` in `.env`. All ARI pushes are logged locally. Visit
`/dev/channex` to:
- Inspect every ARI payload the app has sent
- Fire simulated `booking_new` / `booking_cancel` webhooks to test the full
  inbound booking flow without a real OTA connection

The **Dev** link appears in the navbar when mock mode is active and disappears
for production builds (`CHANNEX_MOCK` unset or empty).

### Going live with Channex

1. Sign up at [channex.io](https://channex.io) (14-day free trial)
2. Create a property + room types + rate plans in the Channex dashboard
3. In fsapp Settings, enter the Channex UUIDs for each property and room type
4. Add your API key: `CHANNEX_API_KEY=<your key>`
5. Register the webhook URL in Channex: `https://yourdomain.com/api/channex/webhook`
6. Remove `CHANNEX_MOCK=true` (or set it to empty)

---

## Testing

See **[tests/README.md](tests/README.md)** for the full testing guide.

### Quick reference

```bash
pnpm test              # run all tests (auto-starts dev server)
pnpm test:ui           # Playwright interactive UI — best for debugging
pnpm test:headed       # run with a visible browser
pnpm test:api          # API tests only (no browser, fast)
pnpm test:report       # open last HTML report
```

### One-time test setup

```bash
# 1. Add test credentials to .env
TEST_EMAIL=test@example.com
TEST_PASSWORD=testpass123

# 2. (Optional) Add Channex IDs for Channex-specific tests
TEST_CHANNEX_PROPERTY_ID=<uuid>
TEST_CHANNEX_ROOM_TYPE_ID=<uuid>
TEST_CHANNEX_RATE_PLAN_ID=<uuid>
TEST_ROOM_TYPE_ID=<uuid>
```

Tests that require Channex IDs **skip gracefully** if the env vars are not set —
they won't fail the suite.

---

## Project structure

```
src/
  lib/
    components/
      booking/          BookingCard, BookingGrid, GroupCard, RoomAssignmentDialog
      core/             CustomDialog, Navbar
      ui/               shadcn-svelte components (Button, Input, etc.)
    server/
      db/               Drizzle schema (booking.schema.ts, auth.schema.ts)
      channex.ts        Channex API client (real + mock)
      channex-mock.ts   In-memory ARI push log for mock mode
      booking-queries.ts  Server-side query helpers
  routes/
    (app)/              All authenticated pages (booking, inventory, settings…)
      dev/channex/      Channex mock simulator (only visible in mock mode)
    api/                API endpoints (booking CRUD, ARI override, webhooks…)
      dev/              Dev-only endpoints (channex-log, channex-trigger)
    auth/               Login / sign-up pages

tests/                  Playwright test suite (see tests/README.md)
scripts/                DB seed and migration scripts
drizzle/                SQL migration files
```

---

## Key concepts

**Properties** — physical locations (e.g. Falcon Motel, Spanish Fiesta Motel).
Each has its own rooms, channels, and Channex connection.

**Rooms** — belong to a property and a room type. A booking is assigned to a
specific room (or left "unassigned" to be assigned later).

**Room Types** — categories like "King Suite" or "Standard Double". Used for
inventory-level booking (from the ARI grid) and Channex sync.

**Booking Status flow:**
`reserved` → `confirmed` → `checked_in` → `checked_out` (or `cancelled`)
- `reserved`: taken over phone/web, deposit not yet received
- `confirmed`: deposit received (or walk-in / OTA booking)

**Channels** — booking sources: Direct, Phone, Website, Booking.com, etc.

**Folio** — the per-booking ledger of charges (rate lines, taxes) and payments.
Deposits start as `pending` and must be manually "marked received".

---

## Deployment

The app uses `@sveltejs/adapter-auto`. For a Node.js server:

```bash
pnpm build
node build
```

For production, replace `CHANNEX_MOCK=true` with your real Channex credentials
and set `ORIGIN` to your public domain.
