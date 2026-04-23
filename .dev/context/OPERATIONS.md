# Falcon & Spanish Fiesta Motels — Operations Overview

## Context

The husband who previously managed the business has passed away. The goal of this software is to help the remaining operator (his wife) run things more efficiently — **not to replace her workflow overnight**, but to provide a digital companion that runs alongside the physical books she is comfortable with. The software should feel familiar, reduce manual effort where possible, and grow over time.

---

## Properties

Two motels operating side-by-side, managed through a **shared central office**.

- **Falcon Motel** — 30 units (room numbers non-consecutive, up to 36)
- **Spanish Fiesta Motel** — 36 units (rooms 1–36)

Both properties share the same office staff, booking workflow, and confirmation slip pad. Each property has its own OTA accounts (separate Expedia and Booking.com accounts per property).

---

## Users & Access

| User | Role | Familiarity |
|------|------|-------------|
| Operator (wife) | Primary — takes bookings, charges guests, runs the desk | Knows the paper process well; not highly technical |
| Son | Secondary — helps remotely and on-site | More tech-comfortable; needs to be able to operate fully when helping |
| Other family members | Occasional — may help at the desk | Less familiar with the booking process; app should guide them |
| Clerk | Named on confirmation slips and records | Could be any of the above |

- Multiple users may need to access simultaneously (son remotely while operator is at desk)
- Role/permission differences may be needed eventually (e.g. who can change rates, who can issue refunds)

---

## Deployment & Access

- **Local database** (`local.db` / SQLite) used for development and as a fallback
- **Cloud deployment** needed for production — allows son to help remotely, enables future online booking
- **Offline resilience** is a nice-to-have (local.db already supports this pattern)
- **Devices:** must work on desktop PC (office) and mobile/tablet (son on the go, family helping)
- **Responsive UI** required — touch-friendly for tablets
- **Future:** public-facing online booking widget for their motel website

---

## Room Inventory

Each room is described by a configuration code:

| Field | Meaning |
|-------|---------|
| No. of Rooms | Number of rooms in the unit (1, 2, or 3) |
| Kitchen | Has kitchen (1 = yes, 0 = no) |
| Queen | Number of queen beds |
| Double | Number of double beds |
| HB | Has hideabed/sofa bed (1 = yes, 0 = no) |
| Code | Shorthand e.g. `2RM1K2Q0D1HB` |

Room type categories used for pricing (Rm A–D):

| Category | Type |
|----------|------|
| Rm A | 1 Bed |
| Rm B | 2 Bed |
| Rm C | 2 Bed + Kitchen |
| Rm D | 3 Bed + Kitchen |

---

## Pricing

Seasonal pricing is managed via a **printed colour-coded calendar** (currently a spreadsheet exported to HTML). The operator highlights dates with a marker to indicate which price tier applies.

Pricing tiers vary by season:

| Season | Rm A | Rm B | Rm C | Rm D |
|--------|------|------|------|------|
| Low (green) | $79 | $89 | $99 | — |
| Shoulder (purple) | $110 | $129 | $149 | — |
| Shoulder (pink) | $99 | $110 | $139 | — |
| Mid (blue) | $129 | $139 | $159 | — |
| Mid (peach) | $89 | $99 | $110 | — |
| Peak (yellow) | $189 | $199 | $210 | $259 |
| Peak (red) | $199 | $210 | $229 | — |

**Notes:**
- Minimum stay: **3 nights**
- Rates generally apply to both properties equally, but may occasionally differ (e.g. one property is closer to the beach)
- Operator can override any rate for a specific booking (grandfathered guests, family, friends, negotiated deals) — everything is written in pencil intentionally
- Multi-night bookings may span different pricing tiers — operator quotes per night if needed (e.g. "1 night @ $100, 1 night @ $200 = $300 total")
- Rate lines on the card are freeform — operator may write more lines than the card has printed (2 is the template, but more are common)
- **Rate presets** would be useful for common rates, plus ability to enter custom amounts quickly

---

## Taxes

- **GST** (federal) + **PST** (provincial, which includes a municipal component)
- Rates are flat percentages but can change periodically (not often — every few years)
- Operator currently hand-writes each tax line label and calculates manually
- **Proposed: tax presets** — operator configures named tax types with rates in settings (e.g. "GST 5%", "PST 11%"), then quickly applies them when filling out a booking
- Tax amounts are auto-calculated from presets but remain manually editable
- Historical bookings must preserve the tax rates that were in effect at the time

---

## Booking System (Current — Paper-Based)

### The Booking Books

Two large physical ledger books, one per property. Each open spread = two months side by side.

**Grid layout per page:**
- Columns = days of the month (1–31 across the top)
- Rows = room numbers down the left side

**How a booking is drawn:**
- `>` chevron on check-in date
- Horizontal line drawn across to check-out date
- `<` chevron on check-out date
- Inside the span: guest name, quoted rate, booking source, notes
- If a booking crosses into the next month, the last cell of the current month says **"over"** — a visual reminder to check the next page

**Booking source codes:**
- `E` = Expedia
- `B` = Booking.com
- *(blank)* = Direct (phone, walk-in, or in-person)

**Room changes:**
- A guest may be moved from one room to another (operator preference, guest request, proximity to beach, etc.)
- Incoming guests may need to be shuffled if a stay extension conflicts with an existing booking

---

## Two-Stage Booking Workflow

Every booking goes through up to two stages. Phone/advance bookings go through both. Walk-ins may go straight to Stage 2.

### Stage 1 — Phone Booking (Confirmation Slip)

The confirmation slip is a **shared pad** used by both properties. Both logos are printed side by side; operator ticks which property the booking is for.

**During the phone call:**
1. Operator fills the slip quickly while on the call:
   - Ticks which property (Spanish Fiesta or Falcon)
   - Caller's phone number
   - Date of call
   - Unit #, rate, arrival date, departure date
   - Amount received (deposit)
   - Guest name and mailing address
   - Payment method: Check / Cash / Visa / M.C. / Other
   - Comments
   - Clerk name (who took the call)
2. Operator may record the credit card number on the slip to charge the deposit after the call ends (to keep the call brief)
3. After the call:
   - Makes a clean copy of the slip if needed
   - Runs the deposit on the card
   - Creates a receipt
   - **Sends the slip + motel pamphlet to the guest** as confirmation (mailed or emailed)
   - Retains operator's copy
4. Marks the booking in the physical book

**Slip fields (supports multiple rows — 3 printed, but freeform):**
- UNIT # | RATES | ARRIVAL | DEPARTURE | AMOUNT RECEIVED

**Pre-printed policies on slip:**
- All rates payable upon arrival
- Reserved units not staying full term will be charged one extra night
- Cancellation up to 30 days notice: $25.00 fee
- Less than 30 days notice: NO REFUND
- Check-in: 2:00 PM — Check-out: 10:30 AM

### Stage 2 — Check-In (Registration Card)

Used for all arrivals — walk-ins directly, phone bookings when the guest arrives.

The registration card is **per-property** (pre-printed with GST number, logo, address).

1. Guest states requirements (party size, kitchen preference, etc.)
2. Operator checks availability, assigns a room
3. Guest fills in (customer section):
   - Name (please print)
   - Street, City, Province/State
   - Phone
   - Make of car, colour of car, car licence
   - Number in party
   - Signature
4. Operator fills in:
   - Unit number and check-in date (top right)
   - **Days Occupied grid** — 7 rows (Sun–Sat) × 4 columns of checkboxes; operator marks each day of the stay left-to-right, wrapping into the next column for stays over 7 days (visual reference for guest only)
   - Rate lines (freeform, as many as needed): `[qty] Days at $[rate]`
   - Accommodation subtotal
   - Tax lines (labeled, e.g. "GST $15", "PST $33")
   - Any extra charge lines
   - Grand total
   - Less Deposit Paid (from the confirmation slip deposit, if applicable)
   - Balance Due
5. Operator charges credit card via **Elavon POS** for the balance
6. **Copies distributed:**
   - Guest receives: front copy of registration card + customer receipt, stapled
   - Operator retains: card copy + merchant receipt, stapled and filed
   - Merchant copies submitted to accountant at tax season

**Registration card financial structure:**
```
[qty] Days at $[rate]        ← rate line 1
[qty] Days at $[rate]        ← rate line 2 (if rates change mid-stay)
... (additional lines as needed, freeform)
─────────────────────
$[subtotal]                  ← accommodation subtotal
[Tax label]  $[amount]       ← e.g. GST $15
[Tax label]  $[amount]       ← e.g. PST $33
$[extra]                     ← spare line (pet fee, etc.)
─────────────────────
$[grand total]
Less Deposit Paid   $
─────────────────────
Balance Due         $
```

**Pre-printed on registration card:**
- GST # (business registration number — per property config)
- Property logo, address, phone, website
- "This property is privately owned..."
- "10:30 is checkout time. Guest staying over..."
- "All rates payable upon arrival..."
- "NO SMOKING — A $150 restoration fee will be applied per occurrence."

---

## OTA Bookings (Expedia / Booking.com)

- Operator lists a **small subset of rooms** per property on each OTA platform
- Each property has its own separate account per OTA
- **New bookings, cancellations, and modifications** arrive via email
- Operator workflow:
  1. Receives OTA email notification
  2. Goes to reservation on OTA website, or prints it out
  3. References the pricing calendar to confirm nightly rates
  4. Writes the room number and per-night breakdown on the printout
  5. Marks the booking in the physical book
- **Payment:** motel charges the guest's card directly at check-in (OTA provides the expected total)
- **Cancellations:** handled entirely through the OTA; if a guest calls the motel to cancel, operator directs them back to the OTA
- **Modifications:** handled by OTA; operator updates the book when notified

---

## Stay Extensions & Room Moves

- Guests may ask to extend their stay at the desk
- Extension may or may not change the nightly rate (operator's discretion)
- Extension may require a room change if the current room is already booked
- In that case, operator may need to move the incoming guest to a different room
- Everything stays flexible — operator decides case by case

---

## Accounting & POS

- **POS:** Elavon (credit card terminal)
- **Current accounting:** data is manually entered into an old DOS-based accounting program, then sent to an accountant
- **Goal:** transition to **QuickBooks** (or similar modern software)
- Operator eventually prints Elavon summary and inputs into accounting manually
- Would be nice if the booking app could help automate or simplify that data handoff

---

## Property Configuration (per property, stored in DB)

Each property needs the following settings stored:

| Setting | Example |
|---------|---------|
| Name | Falcon Motel |
| Logo | (image) |
| Address | 123 Fake St, Fake Place, BC |
| Phone | 555-555-5555 |
| Website | www.business.com |
| GST # | xxxxxxxxxxxxxx |
| Check-in time | 2:00 PM |
| Check-out time | 10:30 AM |
| Cancellation policy | Up to 30 days: $25 fee / Under 30 days: no refund |
| Early departure policy | One extra night charged |
| No-smoking fee | $150 |
| Policy text (card) | "This property is privately owned..." |

---

## Software Goals & Approach

### Philosophy
- Run **alongside** the paper system — the operator keeps using the physical books if she wants to
- Digital system is the **source of truth** for future reference, reporting, and accounting
- Familiar visual layout — the grid/calendar view should feel like the books she knows
- Simple, fast, and non-intimidating for a non-technical operator
- Should **guide** less familiar users through the process (son, other family members)

### Core Features (Priority Order)

1. **Booking grid** — visual calendar per property, per month; rooms on Y-axis, dates on X-axis; shows bookings as spans with guest name and source indicator
2. **Room inventory** — room list per property with configuration details
3. **Stage 1 — Quick booking form** (mirrors confirmation slip): property selector, caller phone, unit, rate, arrival, departure, deposit amount, payment method, guest name/address, clerk, comments; CC number field (stored securely, cleared after charge)
4. **Stage 2 — Check-in form** (mirrors registration card): pre-filled from Stage 1 if exists; adds vehicle info, party size, full address, freeform rate lines, tax lines (from presets, editable), deposit carry-over, balance due
5. **Pricing calendar** — seasonal rate tiers with date ranges; shown as reference when creating a booking
6. **Tax presets** — configurable named tax types (label + %); auto-applied as line items, editable per booking
7. **Rate presets** — quick-select common rates, plus custom entry
8. **Printable folio** — digital equivalent of the registration card; prints cleanly with property logo, GST #, guest details, day grid, rate lines, taxes, totals, policies
9. **Printable confirmation** — digital equivalent of the confirmation slip; sent to guest after phone booking
10. **Room moves** — reassign a booking to a different room
11. **Stay extensions** — extend checkout date with conflict detection
12. **OTA import assist** — paste/upload OTA reservation; app pre-fills booking form and suggests available rooms
13. **Reporting** — revenue + tax summaries for filing (by period, by source, by property)
14. **QuickBooks integration** — export booking/financial data (future phase)

### Out of Scope (for now)
- Real-time OTA channel management (live availability sync)
- Online guest-facing booking widget (future)
- Full PMS replacement

---

## Reference Documents

| File | Description |
|------|-------------|
| `Falcon.html` | Falcon Motel room inventory |
| `Spanish Fiesta.html` | Spanish Fiesta room inventory |
| `Rates.html` | 2026 seasonal pricing calendar |
| `Reservation Card.html` | Blank registration card template |
| `Filled Reservation Card.html` | Sample filled registration card |
| `Confirmation Slip.html` | Blank confirmation slip template |
| `Filled Confirmation Slip.html` | Sample filled confirmation slip |

---

## Open Questions

- [ ] Do Falcon and Spanish Fiesta share the same GST number (same business entity), or do they each have their own?
- [ ] What exactly does the Elavon summary look like — per transaction, per day, or per period?
- [ ] Does the accountant need anything beyond revenue + tax breakdown, or do they need per-guest detail?
- [ ] Are there any booking sources beyond Direct, Expedia, and Booking.com?
- [ ] Is there a concept of a "no-show" or deposit forfeiture that needs to be tracked?
- [ ] Does the operator ever offer weekly or monthly rates?
- [ ] What domain/hosting is the motel website on? (relevant for future online booking and cloud deployment)
- [ ] How should CC numbers be handled digitally — stored encrypted temporarily, or just a reminder note field?
