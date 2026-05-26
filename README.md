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
- **Folio / Ledger** — line-item charges, taxes, add-ons, payments, balance-due display
- **Add-Ons** — pre-configured extras (taxable / non-taxable) with per-booking picker
- **Tax Presets** — per-property tax rates with room/add-on applicability flags
- **Self Check-in** — unique guest link shows booking summary, policy waiver, door code, and arrival instructions
- **Pre-arrival Emails** — automated day-before email with self check-in link (cron-triggered)
- **Guest Profiles** — auto-complete, address, vehicle, waiver, behaviour rating
- **Housekeeping View** — room status board (clean / dirty / in progress / out of order), auto-marks dirty on checkout
- **Reports** — occupancy and revenue summaries
- **Email Confirmations** — mailto deep-link or Resend API integration
- **Elavon Converge** — per-property payment processing via hosted Checkout.js fields
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
| `RESEND_OPERATOR_EMAIL` | Staff email to receive new booking alerts |
| `CRON_SECRET` | Secret token protecting cron endpoints (see Cron Jobs) |
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

## Cron Jobs

Scheduled tasks are implemented as secured API endpoints that an external caller
hits on a schedule. No scheduler daemon is bundled — use any free service.

### Available cron endpoints

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/cron/pre-arrival` | `POST` | Sends pre-arrival email with self check-in link to guests arriving tomorrow |

All endpoints require:
```
Authorization: Bearer <CRON_SECRET>
```

### Setup

**Step 1 — Generate a secret**
```bash
openssl rand -hex 32
```
Add it to `.env`:
```
CRON_SECRET=your_generated_secret_here
```

**Step 2 — Choose a free cron service**

#### Option A: cron-job.org (easiest — no code needed)

1. Sign up free at [cron-job.org](https://cron-job.org)
2. Click **Create cronjob**
3. Set the URL: `https://yourdomain.com/api/cron/pre-arrival`
4. Set the schedule: **Daily at 08:00**
5. Under **Headers**, add:
   - Header name: `Authorization`
   - Value: `Bearer your_generated_secret_here`
6. Save — done

#### Option B: GitHub Actions (if your repo is on GitHub)

Create `.github/workflows/cron.yml`:

```yaml
name: Daily cron jobs
on:
  schedule:
    - cron: '0 15 * * *'   # 08:00 MST = 15:00 UTC
  workflow_dispatch:         # also allows manual trigger

jobs:
  pre-arrival:
    runs-on: ubuntu-latest
    steps:
      - name: Send pre-arrival emails
        run: |
          curl -sf -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://yourdomain.com/api/cron/pre-arrival
```

In your GitHub repo → **Settings → Secrets**, add `CRON_SECRET` with the same value.

#### Option C: System cron (VPS / self-hosted)

```bash
# Edit crontab
crontab -e

# Add this line (runs at 08:00 daily)
0 8 * * * curl -sf -X POST -H "Authorization: Bearer YOUR_SECRET" https://yourdomain.com/api/cron/pre-arrival
```

### Testing the endpoint manually

```bash
curl -X POST \
  -H "Authorization: Bearer your_secret" \
  "https://yourdomain.com/api/cron/pre-arrival"

# Test a specific date (useful in dev):
curl -X POST \
  -H "Authorization: Bearer your_secret" \
  "https://yourdomain.com/api/cron/pre-arrival?date=2026-06-01"
```

Response:
```json
{ "ok": true, "date": "2026-06-01", "candidates": 3, "sent": 3 }
```

### How the pre-arrival email works

1. Cron fires at 08:00 daily
2. Endpoint finds bookings where `checkInDate = tomorrow` AND `selfCheckinToken` exists AND `preArrivalSentAt IS NULL`
3. Sends each guest a branded email with a **Check In Online →** button linking to `/checkin/[token]`
4. Stamps `preArrivalSentAt` — never double-sends even if the cron fires twice
5. Guest opens link, agrees to policies, gets their door code + arrival instructions

> **Prerequisites**: The self check-in link must be generated before the cron runs. Click **🔗 Self check-in link** on any booking card to generate and copy it. The cron skips bookings without a token.

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
      email.ts          Resend email templates (confirmation, pre-arrival, cancellation)
      elavon.ts         Elavon Converge payment API client
  routes/
    (app)/              All authenticated pages (booking, inventory, settings…)
      dev/channex/      Channex mock simulator (only visible in mock mode)
    api/                API endpoints (booking CRUD, ARI override, webhooks…)
      booking/[id]/     charge, refund, void, checkout-token, self-checkin-link…
      cron/             Cron-triggered endpoints (pre-arrival)
      dev/              Dev-only endpoints (channex-log, channex-trigger)
    auth/               Login / sign-up pages
    checkin/[token]/    Public self check-in page (no auth required)

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
