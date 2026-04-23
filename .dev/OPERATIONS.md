# Falcon & Spanish Fiesta Motels — Operations Overview

## Context

The husband who previously managed the business has passed away. The goal of this software is to help the remaining operator (his wife) run things more efficiently — **not to replace her workflow overnight**, but to provide a digital companion that runs alongside the physical books she is comfortable with. The software should feel familiar, reduce manual effort where possible, and grow over time.

---

## Properties

Two motels operating side-by-side, managed through a **shared central office**.

- **Falcon Motel** — 30 units (room numbers non-consecutive, up to 36)
- **Spanish Fiesta Motel** — 36 units (rooms 1–36)

Both properties share the same office staff and booking workflow. Each property has its own OTA accounts (separate Expedia and Booking.com accounts per property).

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
- Operator can override any rate for a specific booking (grandfathered guests, family, friends, negotiated deals, etc.) — everything is written in pencil intentionally
- Multi-night bookings may span different pricing tiers — operator quotes per night if needed (e.g. "1 night @ $100, 1 night @ $200 = $300 total")
- **Rate presets** would be useful for common rates, plus ability to enter custom amounts quickly

---

## Taxes

- **GST** (federal) + **PST** (provincial, which includes a municipal component)
- Rates are flat percentages but can change periodically (not often — every few years)
- Operator currently hand-writes each tax line and calculates manually
- **Proposed: tax presets** — operator configures named tax types with rates in settings (e.g. "GST 5%", "PST 8%"), then quickly adds them when filling out a booking form
- Historical bookings should preserve the rates that were in effect at the time

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

## Guest Check-In (Walk-In / In-Person)

1. Customer arrives and states requirements: number of people, kitchen preference, etc.
2. Operator checks availability and offers a room: *"I have this room on this side"*
3. Operator takes a **duplicate registration card** (carbonless, pre-printed with a GST number)
4. Customer fills in:
   - Name, email, address
   - Vehicle details
   - Signature
5. Operator fills in:
   - Room number(s)
   - Check-in / check-out dates
   - A **7-column × 4-row day grid** (S M T W T F S) — operator checkmarks the days of the stay, filling left to right, wrapping into the next row for stays over 7 days
6. Financial section:
   - Nightly rate(s) — can be different per night if pricing tiers change mid-stay
   - Tax lines (hand-written label + amount per tax type)
   - Total amount
7. For complex/group bookings (e.g. 20 rooms for a business):
   - Multiple rooms listed on one card
   - Grouped pricing lines: *"10 rooms @ $100 = $1,000 / 10 rooms @ $200 = $2,000"*
   - Subtotal → taxes → total
8. Operator charges credit card via **Elavon POS**
9. **Copies distributed:**
   - Customer: front copy of registration card + customer receipt copy, stapled
   - Operator retains: card copy + merchant receipt copy, stapled and filed
   - Merchant copies submitted to accountant at tax season

---

## Phone Bookings

1. Operator fills a **quick slip** to note details during the call
2. May run a deposit on the card at time of booking
3. Slip is sent to the customer as a **booking confirmation**
4. Customer also receives a **motel pamphlet** (mailed or emailed)

---

## OTA Bookings (Expedia / Booking.com)

- Operator lists a **small subset of rooms** per property on each OTA platform
- Each property has its own separate account per OTA
- **New bookings, cancellations, and modifications** arrive via email
- Operator workflow:
  1. Receives OTA email notification
  2. Goes to reservation on OTA website (or prints it out)
  3. References the pricing calendar to confirm nightly rates
  4. Writes the room number and per-night breakdown on the printout (e.g. "1 night @ $100, 1 night @ $200")
  5. Marks the booking in the physical book
- **Payment:** motel charges the guest's card directly at check-in (OTA provides the expected total)
- **Cancellations:** handled entirely through the OTA; if a guest calls the motel to cancel, operator directs them back to the OTA platform
- **Modifications:** handled by OTA; operator updates the book when notified

---

## Stay Extensions & Room Moves

- Guests may ask to extend their stay at the desk
- Extension may or may not change the nightly rate (operator's discretion)
- Extension may require a room change if the current room is already booked by someone else
- In that case, operator may also need to move the incoming guest to a different room
- Everything stays flexible — operator decides case by case

---

## Accounting & POS

- **POS:** Elavon (credit card terminal)
- **Current accounting:** data is manually entered into an old DOS-based accounting program, then sent to an accountant
- **Goal:** transition to **QuickBooks** (or similar modern software)
- Operator eventually prints Elavon summary and inputs into accounting manually
- Would be nice if the booking app could help automate or simplify that data handoff

---

## Users & Access

| User | Role | Familiarity |
|------|------|-------------|
| Operator (wife) | Primary — takes bookings, charges guests, runs the desk | Knows the paper process well; not highly technical |
| Son | Secondary — helps remotely and on-site | More tech-comfortable; needs to be able to operate fully when helping |
| Other family members | Occasional — may help at the desk | Less familiar with the booking process; app should guide them |

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

## Software Goals & Approach

### Philosophy
- Run **alongside** the paper system — the operator keeps using the physical books if she wants to
- Digital system is the **source of truth** for future reference, reporting, and accounting
- Familiar visual layout — the grid/calendar view should feel like the books she knows
- Simple, fast, and non-intimidating for a non-technical operator
- Should **guide** less familiar users through the process (son, other family members)

### Core Features (Priority Order)

1. **Booking grid** — visual calendar per property, per month, rooms on Y-axis, dates on X-axis; shows bookings as spans with guest name and source indicator
2. **Room inventory** — room list per property with configuration details
3. **Booking creation** — direct (walk-in/phone) and OTA; includes room assignment, dates, guest name, nightly rate breakdown, notes
4. **Pricing calendar** — seasonal rate tiers with date ranges; shown as reference when creating a booking
5. **Tax presets** — configurable named tax types (label + percentage); applied when generating a folio/receipt
6. **Rate presets** — quick-select common rates, plus custom entry
7. **Guest folio / registration card** — printable digital equivalent of the paper card; includes day grid, room, rates, taxes, total, guest details
8. **Room moves** — reassign a booking to a different room
9. **Stay extensions** — extend a booking's checkout date, with conflict detection
10. **OTA import assist** — upload/paste OTA reservation details; app suggests available rooms and pre-fills the booking form
11. **Reporting** — end-of-period summaries for tax filing (revenue, taxes collected, by source)
12. **QuickBooks integration** — export or sync booking/financial data (future phase)

### Out of Scope (for now)
- Real-time OTA channel management (availability sync)
- Online guest-facing booking widget
- Full PMS replacement

---

## Reference Documents Needed

- [ ] **Registration card** — HTML export from Excel (to finalize digital form field layout)
- [ ] **Phone booking confirmation slip** — HTML export from Excel (to design digital confirmation)

---

## Open Questions

- [ ] What exactly does the Elavon summary look like — is it per transaction, per day, or per period?
- [ ] Does the accountant need anything beyond revenue + tax breakdown, or do they need per-guest detail?
- [ ] Are there any other booking sources beyond Direct, Expedia, and Booking.com?
- [ ] Is there a concept of a "no-show" or deposit forfeiture that needs to be tracked?
- [ ] Does the operator ever offer weekly or monthly rates (beyond the nightly rate structure)?
- [ ] What domain/hosting is the motel website currently on? (relevant for future online booking widget and cloud deployment)
