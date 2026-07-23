# Channex.io Integration Guide

This guide walks you through setting up Channex.io with your PMS so that your
availability and rates automatically sync to Booking.com, Expedia, Airbnb,
Google Hotels, and any other OTA you connect.

---

## How it works end-to-end

```
Your PMS (this app)
  │
  │  Push ARI (availability + rates + restrictions)
  ▼
Channex.io  ──────────────────────────────────────────►  Booking.com
            ──────────────────────────────────────────►  Expedia
            ──────────────────────────────────────────►  Airbnb
            ──────────────────────────────────────────►  Google Hotels
            ──────────────────────────────────────────►  …any OTA

  OTA booking comes in
  │
  │  Webhook → POST /api/channex/webhook
  ▼
Your PMS creates booking (unassigned) → you assign a room
```

**ARI** = Availability, Rates, Inventory. This is the industry term for the
three pieces of data every OTA needs from you.

---

## Part 1 — Create your Channex account

1. Go to **https://channex.io** and sign up for a free account.
2. Channex is free to start. Paid plans kick in per-property once you go live
   with OTA connections (~$3–6 USD/property/month as of 2026 — always verify
   current pricing on their site).
3. You will use the **Channex dashboard** to connect OTAs and the **Channex
   API** to push ARI from this app. Both use the same account.

---

## Part 2 — Create properties in Channex

In the Channex dashboard:

1. Go to **Properties → Add Property**.
2. Create one property for each of your motels:
   - **Falcon Motel**
   - **Spanish Fiesta Motel**
3. Fill in the basic details (address, currency = **CAD**, timezone,
   check-in/check-out times).
4. After saving, click into the property. The URL will contain its UUID, e.g.:
   `https://app.channex.io/properties/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
   Copy that UUID — this is your **Channex Property ID**.

---

## Part 3 — Create room types in Channex

For each property, you need to create room types that match your PMS room types
(A, B, C, D or whatever you have configured).

In the Channex dashboard, go to **Properties → [your property] → Room Types →
Add Room Type**:

| Your PMS Room Type | Channex Room Type Name     |
|--------------------|----------------------------|
| A — 1 Bed          | 1 Bedroom                  |
| B — 2 Bed          | 2 Bedroom                  |
| C — 2 Bed + Kitchen| 2 Bedroom with Kitchen     |
| D — 3 Bed + Kitchen| 3 Bedroom with Kitchen     |

> **Important:** Set the **Count** (total units) in Channex to match the
> number of physical rooms of that type in your property. Channex uses pooled
> inventory — it will cap OTA bookings at this count.

After saving each room type, copy the UUID from the URL or from the room type
detail page. This is your **Channex Room Type ID**.

---

## Part 4 — Create rate plans in Channex

Each room type needs at least one rate plan. A rate plan is how you price the
room for a channel (e.g. "Standard Rate").

In the Channex dashboard: **Room Types → [your room type] → Rate Plans → Add
Rate Plan**

- Name: `Standard`
- Type: `Per Room` (not per person)
- Currency: `CAD`

After saving, copy the UUID. This is your **Channex Rate Plan ID**.

> **Tip:** Later you can add a "Non-Refundable" rate plan at a small discount
> (e.g. −10%) for guests willing to commit. Some OTAs surface this as a
> separate option. For now, one Standard plan per room type is enough.

---

## Part 5 — Connect your OTAs in Channex

This is the easy part — no code required. In the Channex dashboard:

1. Go to **Channels → Add Channel**
2. Select the OTA (Booking.com, Expedia, Airbnb, etc.)
3. Follow the on-screen steps — Channex walks you through linking your OTA
   property account
4. Once connected, Channex will sync availability automatically when you push
   from your PMS

**Booking.com**: You will need your Booking.com Extranet account. Channex will
ask for your Hotel ID and you'll authorize the connection in the Extranet.

**Expedia**: Similar process — requires your Expedia Partner Central account.

**Airbnb**: Requires linking your Airbnb host account.

**Google Hotels (Free Booking Links)**: Available in Channex under
Channels → Google. Requires a Google Hotel Center account linked to your
Google My Business profile. This is free and drives direct traffic.

---

## Part 6 — Configure your PMS

### 6a. Add your API key to .env

In the Channex dashboard, go to **Profile (top right) → API Keys → Create API
Key**. Copy the key, then add it to your `.env` file:

```env
CHANNEX_API_KEY=your-api-key-here
```

Optionally, set a webhook secret for security (see Part 7):
```env
CHANNEX_WEBHOOK_SECRET=any-random-string-you-choose
```

Restart your dev server after updating `.env`.

### 6b. Enter Channex IDs in Settings

In your PMS, go to **Settings → Channels → Channex Integration**.

For each property:
- Paste the **Channex Property ID**

For each room type within the property:
- Paste the **Channex Room Type ID**
- Paste the **Channex Rate Plan ID** (Standard)

Click **Save** for each.

Once these are filled in, the **Avail** page will show a `⇅ Channex` badge
on connected room types, and the **Sync Channex** button will become active.

---

## Part 7 — Register the webhook

The webhook is how OTA bookings flow into your PMS automatically.

In the Channex dashboard:
1. Go to **Settings → Webhooks → Add Webhook**
2. URL: `https://yourdomain.com/api/channex/webhook`
   (replace with your actual deployed domain — `localhost` won't work here,
   you need a public URL)
3. Events to subscribe to:
   - `booking_new`
   - `booking_update`
   - `booking_cancel`
4. If you set `CHANNEX_WEBHOOK_SECRET` in your `.env`, paste the same string
   as the **Webhook Secret** in Channex — this prevents spoofed requests

> **For local testing:** Use a tunnel like [ngrok](https://ngrok.com) or
> [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
> to expose your local server temporarily.
> Example: `ngrok http 5173` → use the generated `https://xxx.ngrok.io` URL
> as your webhook URL in Channex.

---

## Part 8 — Using the ARI Calendar

Go to **Avail** in the top navigation. This is your rates & availability
management screen.

### What you see

| Row | What it shows |
|-----|---------------|
| **Available** | Rooms not booked on that date (auto-calculated) |
| **Rate/night** | Season rate (coloured) or a blue override rate |
| **Min / Flags** | Minimum nights required; CTA/CTD badges if set |

### Editing a cell

Click any cell to open the edit popover:

- **Rate override** — leave blank to use the season rate; type a dollar amount
  to override just that date (e.g. for a special event premium)
- **Min nights** — override the season minimum for that specific date
- **Stop sell** — closes all OTA channels for that date (room shows as
  unavailable everywhere, but direct bookings still work in your PMS)
- **CTA (Closed to Arrival)** — guests cannot check in on this date
- **CTD (Closed to Departure)** — guests cannot check out on this date

CTA/CTD are useful for long-weekend management: set CTA on Friday and CTD on
Monday to force guests to book the full long weekend.

### Sync Channex button

Pushes the current 60-day window of ARI for the selected property to Channex
in one go. Channex then distributes to all connected OTAs.

Changes made via the cell popover **automatically trigger a push** to Channex
for that specific date, so you typically don't need the bulk Sync button unless
you're doing initial setup or recovering from a connection issue.

---

## Part 9 — When an OTA booking arrives

1. Guest books on Booking.com (or Expedia, etc.)
2. Booking.com notifies Channex
3. Channex sends a webhook to your PMS
4. Your PMS creates the booking automatically:
   - Status: `Confirmed`
   - Room: **Unassigned** (you must assign a specific room)
   - Guest name, email, phone from the OTA (if provided)
   - Source channel: e.g. "Booking.com"
   - OTA confirmation number stored for reference
5. The booking appears in the **"Unassigned Online Bookings"** section on the
   booking grid
6. You click it, open the booking card, assign a room, and the grid updates

Channex also immediately reduces the available count for that room type across
all OTAs, preventing double-bookings.

---

## Part 10 — Cancellations from OTAs

When a guest cancels on Booking.com:
1. Booking.com notifies Channex
2. Channex sends a `booking_cancel` webhook to your PMS
3. Your PMS automatically sets the booking status to `Cancelled`
4. The room becomes available again, and Channex pushes updated availability
   back to all OTAs

---

## Troubleshooting

### "No Channex ID configured" on a room type

You haven't yet entered the Channex UUIDs in **Settings → Channels**. Fill them
in and the `⇅ Channex` badge will appear.

### Sync Channex button says "failed"

Check:
1. `CHANNEX_API_KEY` is set correctly in `.env` (no extra spaces, no quotes)
2. The Channex Property ID and Room Type IDs in Settings are correct UUIDs
3. The room type has at least one rate season configured (no season = no rate
   to push)

### OTA bookings aren't appearing

Check:
1. Your webhook URL is publicly accessible (not `localhost`)
2. The webhook is registered in the Channex dashboard with the correct URL
3. The events `booking_new` / `booking_update` / `booking_cancel` are checked
4. If using a webhook secret, it matches exactly in both Channex and `.env`
5. Check server logs for `[channex webhook]` messages

### Availability showing wrong counts

Availability is calculated live from active bookings in your PMS. If it looks
off, check that old test bookings have been cancelled rather than left as
`confirmed`. Cancelled bookings don't count toward occupancy.

### Google Hotels not showing your rates

Google Hotels (Free Booking Links) can take 1–4 weeks to index after initial
setup. Make sure your Google My Business profile address exactly matches your
Channex property address.

---

## Quick reference

| What | Where |
|------|-------|
| Channex dashboard | https://app.channex.io |
| Channex API docs | https://developers.channex.io |
| Your ARI calendar | /availability (Avail in nav) |
| Channex ID settings | Settings → Channels → Channex Integration |
| Webhook URL | https://yourdomain.com/api/channex/webhook |
| API key env var | `CHANNEX_API_KEY` in `.env` |
| Webhook secret env var | `CHANNEX_WEBHOOK_SECRET` in `.env` |
| Migration (run once) | `npm run migrate:channex` |
