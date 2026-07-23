# Elavon Converge Integration — Setup Guide

## Overview

Each property (Falcon Resort, Spanish Fiesta Resort) has its own Elavon merchant account.
The integration uses Elavon's **Converge** platform (formerly VirtualMerchant) to:
- Tokenize credit cards captured over the phone (card never touches our server)
- Charge stored tokens at check-in / check-out
- Issue refunds and voids from within the booking card

---

## Part 1 — What YOU Need to Do (Before Any Code)

### Step 1: Call Elavon Support
**Phone:** 1-800-377-3962 (Elavon Software Support)  
**Do this once for EACH property (Falcon and Spanish Fiesta separately)**

Tell them:
> "I need to integrate Converge with a custom property management system.
> I need three things enabled on my merchant account:
> 1. Tokenization enabled
> 2. An API User created with permission to request Hosted Payment transaction tokens
> 3. My server's IP address whitelisted for API access"

### Step 2: Get Your Server IP First
Before calling, find the IP address of the server where Rezzzo is hosted.
- If running locally for now: you can use a test/demo account (see Part 3)
- If on a cloud host (e.g., Fly.io, Railway, Render): find the outbound IP in your hosting dashboard
- Elavon will need this IP whitelisted — requests from unknown IPs will be rejected

### Step 3: Collect Credentials for Each Property

After the call, you should have for **each property**:

| Credential | What it looks like | Notes |
|---|---|---|
| `ssl_merchant_id` | Numeric, e.g. `123456` | Your existing merchant ID |
| `ssl_user_id` | String, e.g. `apiuser` | The new API user Elavon creates |
| `ssl_pin` | Alphanumeric, e.g. `A1B2C3D4E5F6` | PIN for the API user |

> ⚠️ **Never share these credentials.** They go into Rezzzo's settings page (encrypted at rest), never in code or public repos.

### Step 4: Verify Tokenization is Enabled
Ask Elavon to confirm that your account has:
- ✅ Tokenization enabled
- ✅ Card-not-present (CNP / e-commerce) transactions enabled
- ✅ API user has `Request Hosted Payment Transaction Token` permission

---

## Part 2 — Test / Demo Account (Optional but Recommended)

Elavon has a **demo environment** at `https://api.demo.convergepay.com` (no real money).

Ask Elavon for:
- Demo merchant ID, user ID, and PIN
- Or sign up at [developer.elavon.com](https://developer.elavon.com) for sandbox credentials

This lets you test the full flow before going live.

---

## Part 3 — What Gets Built in Rezzzo

Once you hand over the credentials, this is what will be implemented:

### Settings Page (per property)
A new "Payments" section in Settings where you enter:
```
Elavon Merchant ID: ____________
Elavon User ID:     ____________
Elavon PIN:         ____________
```
These are stored encrypted in the database, one set per property.

### Card Capture (replaces current "last 4 digits" form)
- Checkout.js (Elavon's hosted fields) embedded in the booking card
- Card data goes directly to Elavon — never passes through Rezzzo's server
- Elavon returns a **token** which is stored against the booking
- Operator sees: "Visa ••••1234 — tokenized ✓"

### Charge Button
- "Charge card" button appears in the booking card when a token is on file
- Operator enters amount → Rezzzo calls Elavon API server-side → charge processed
- Transaction ID and result recorded in payment events

### Refund Button
- Available on any completed charge in the payment history
- Calls Elavon with the original transaction ID → refund processed

### Void Button
- Available same-day before batch settlement
- Cancels the transaction entirely (no refund needed)

---

## Part 4 — Transaction Types Reference

| Action | Elavon transaction type | When to use |
|---|---|---|
| Charge a stored token | `ccsale` | Check-in, deposit, final charge |
| Auth only (hold funds) | `ccauthonly` | Pre-auth at check-in |
| Complete a pre-auth | `cccomplete` | Settle pre-auth at check-out |
| Refund | `ccreturn` | After settlement, partial or full refund |
| Void | `ccvoid` | Same-day, before settlement |
| Get token | `ccgettoken` | When capturing card via Checkout.js |

---

## Part 5 — Checklist Summary

### You need to do:
- [ ] Call Elavon (1-800-377-3962) for **Falcon Resort** — enable tokenization + get API user credentials
- [ ] Call Elavon for **Spanish Fiesta Resort** — same as above
- [ ] Get your server's outbound IP whitelisted for both accounts
- [ ] Get demo/sandbox credentials for testing (optional but recommended)
- [ ] Hand over credentials securely (use a password manager share, not email)

### Developer will build:
- [ ] Elavon credentials storage in Settings (per property, encrypted)
- [ ] Checkout.js hosted fields replacing the current card capture form
- [ ] `/api/booking/[id]/charge` endpoint (server-side Converge API call)
- [ ] `/api/booking/[id]/refund` endpoint
- [ ] `/api/booking/[id]/void` endpoint
- [ ] Transaction result logging in payment events
- [ ] Charge / Refund / Void buttons in the booking card UI

---

## Part 6 — Useful Links

- Elavon Developer Portal: https://developer.elavon.com
- Converge Checkout.js docs: https://developer.elavon.com/products/checkout-js/v1/take-a-payment
- Elavon Software Support: 1-800-377-3962
- Demo/sandbox environment: https://api.demo.convergepay.com
- Production endpoint: https://www.myvirtualmerchant.com/VirtualMerchant/process.do

---

*Last updated: May 2026*
