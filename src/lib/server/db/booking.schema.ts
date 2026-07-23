import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const timestamps = {
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull()
};

// ─── Properties ──────────────────────────────────────────────────────────────

export const properties = sqliteTable('properties', {
	id: id(),
	name: text('name').notNull(),
	logoUrl: text('logo_url'),
	address: text('address').notNull(),
	city: text('city').notNull(),
	province: text('province').notNull(),
	postalCode: text('postal_code'),
	phone: text('phone'),
	website: text('website'),
	gstNumber: text('gst_number'),
	checkinTime: text('checkin_time').notNull().default('14:00'),
	checkoutTime: text('checkout_time').notNull().default('10:30'),
	// Printed verbatim on registration card and confirmation slip
	policyText: text('policy_text'),
	cancellationPolicy: text('cancellation_policy'),
	earlyDeparturePolicy: text('early_departure_policy'),
	smokingFee: integer('smoking_fee'), // cents
	// ── Deposit / Cancellation Policy ────────────────────────────────────────
	// depositNights: how many nights to charge as deposit (0 = no deposit required)
	depositNights: integer('deposit_nights').notNull().default(1),
	// Flat fee charged on any cancellation, in cents (e.g. 2500 = $25)
	cancellationFeeCents: integer('cancellation_fee_cents').notNull().default(2500),
	// Days before check-in inside which no refund is given (0 = always refund minus fee)
	noRefundDays: integer('no_refund_days').notNull().default(30),
	// ── Deposit calculation method ────────────────────────────────────────────
	// first_night: depositNights × first nightly rate
	// average:     depositNights × (totalStay / nights)
	// percentage:  depositPercent% of total stay
	// flat:        depositFlatCents fixed amount
	depositCalcMethod: text('deposit_calc_method').notNull().default('first_night'),
	depositPercent: integer('deposit_percent'),      // e.g. 20 = 20%, used when method = 'percentage'
	depositFlatCents: integer('deposit_flat_cents'), // fixed cents, used when method = 'flat'
	// ── Channex channel manager ───────────────────────────────────────────────
	// UUID of this property in your Channex account. Set in Settings → Channels.
	channexPropertyId: text('channex_property_id'),
	// ── Elavon Converge payment processing ───────────────────────────────────
	// Credentials stored per-property so each merchant account charges separately.
	// Obtained from Elavon by calling 1-800-377-3962 and requesting API user setup.
	elavonMerchantId: text('elavon_merchant_id'),
	elavonUserId:     text('elavon_user_id'),
	elavonPin:        text('elavon_pin'),        // store encrypted in production
	// ── Online booking (guest-facing page) ───────────────────────────────────
	// Short unique public ID used in booking URLs: /book/[publicId]
	publicId: text('public_id').unique(),
	// Toggle to disable online bookings without removing config
	bookingEnabled: integer('booking_enabled', { mode: 'boolean' }).notNull().default(true),
	// Short blurb shown on the property booking page
	bookingDescription: text('booking_description'),
	// ── Email customization ───────────────────────────────────────────────────
	// Optional note shown near the top of confirmation/pre-arrival emails
	emailNote: text('email_note'),
	// Sign-off text at the bottom of every guest email (e.g. "The Team at Lakeside Motel")
	emailSignature: text('email_signature'),
	// Hero image URL for the booking page header
	heroImageUrl: text('hero_image_url'),
	// Hex accent colour for the booking page (e.g. '#d97706')
	accentColour: text('accent_colour'),
	// ── Gap fill (B&B mode) ───────────────────────────────────────────────────
	// Block dates that form a gap shorter than N nights between bookings. 0 = disabled.
	gapFillNights: integer('gap_fill_nights').notNull().default(0),
	// ── Room quarantine after checkout ────────────────────────────────────────
	// Automatically set room quarantine_until = checkout + quarantineHours. 0 = disabled.
	quarantineHours: integer('quarantine_hours').notNull().default(0),
	// ── Max stay restriction ──────────────────────────────────────────────────
	// Property-wide default maximum stay in nights. null = no limit. Industry typical: 21.
	defaultMaxNights: integer('default_max_nights'),
	...timestamps
});

// ─── Room Types ───────────────────────────────────────────────────────────────
// Abstract pricing categories (Rm A–D equivalent). Per-property so a third
// property with a different category set is fully supported.

export const roomTypes = sqliteTable('room_types', {
	id: id(),
	propertyId: text('property_id')
		.notNull()
		.references(() => properties.id, { onDelete: 'cascade' }),
	name: text('name').notNull(), // e.g. "1 Bed", "2 Bed + Kitchen"
	category: text('category').notNull(), // A | B | C | D
	sortOrder: integer('sort_order').notNull().default(0),
	// ── Guest-facing booking page ─────────────────────────────────────────────
	description: text('description'),   // short marketing blurb shown on booking page
	imageUrl: text('image_url'),        // photo URL (overrides stock category image)
	maxOccupancy: integer('max_occupancy'), // max guests (shown as "Sleeps N")
	// ── Parent/child inventory ────────────────────────────────────────────────
	// If set, this room type has no physical rooms of its own. It borrows the
	// inventory pool of the referenced parent type (e.g. "1 Bed Room" and
	// "2 Bed Suite" both draw from the same 4 physical units).
	parentRoomTypeId: text('parent_room_type_id'),
	// ── Channex channel manager mapping ──────────────────────────────────────
	// channexRoomTypeId: UUID of the matching Room Type in Channex
	// channexRatePlanId: UUID of the default Rate Plan in Channex (one per room type)
	channexRoomTypeId: text('channex_room_type_id'),
	channexRatePlanId: text('channex_rate_plan_id'),
	// Floor rate used when no season covers a date — pushed to Channex as the fallback rate
	defaultRateCents: integer('default_rate_cents'),
	// ── Max stay override ─────────────────────────────────────────────────────
	// null = use property-level defaultMaxNights; set to override for this room type only.
	maxNights: integer('max_nights'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull()
});

// ─── Rooms ────────────────────────────────────────────────────────────────────
// Physical units. Config (beds, kitchen, etc.) is updated in place — no history
// needed since the booking's line items capture the financial record at the time.

export const rooms = sqliteTable(
	'rooms',
	{
		id: id(),
		propertyId: text('property_id')
			.notNull()
			.references(() => properties.id, { onDelete: 'cascade' }),
		roomTypeId: text('room_type_id').references(() => roomTypes.id, { onDelete: 'set null' }),
		roomNumber: text('room_number').notNull(), // display value e.g. "32"
		numRooms: integer('num_rooms').notNull().default(1), // rooms-within-a-unit
		hasKitchen: integer('has_kitchen', { mode: 'boolean' }).notNull().default(false),
		kingBeds: integer('king_beds').notNull().default(0),
		queenBeds: integer('queen_beds').notNull().default(0),
		doubleBeds: integer('double_beds').notNull().default(0),
		hasHideabed: integer('has_hideabed', { mode: 'boolean' }).notNull().default(false),
		// JSON array of config names, e.g. '["1Q Sleeping","1Q+1D Sleeping"]'
		// null = single fixed config; operators pick at booking time when set
		configs: text('configs'),
	// Housekeeping status: clean | dirty | in_progress | out_of_order
	housekeepingStatus: text('housekeeping_status').notNull().default('clean'),
	// 1 (low) → 10 (high). Suggestions only — operator always has final say.
	desirabilityWeight: integer('desirability_weight').notNull().default(5),
	cleaningEaseWeight: integer('cleaning_ease_weight').notNull().default(5),
	notes: text('notes'),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	// Door access code shown to guest at self check-in
	doorCode: text('door_code'),
	// Free-text arrival instructions (parking, key lockbox, Wi-Fi, etc.)
	checkinInstructions: text('checkin_instructions'),
	// Timestamp (ms) until which this room is quarantined post-checkout (cleaning buffer).
	// null or past timestamp = not quarantined.
	quarantineUntil: integer('quarantine_until', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(t) => [
		index('rooms_property_idx').on(t.propertyId),
		unique('rooms_property_number_uq').on(t.propertyId, t.roomNumber)
	]
);

// ─── Rate Seasons ─────────────────────────────────────────────────────────────
// Date ranges with a colour (mirrors the highlighter-on-calendar workflow).
// Per-property; use "copy season" in the UI to duplicate across properties.

export const rateSeasons = sqliteTable(
	'rate_seasons',
	{
		id: id(),
		propertyId: text('property_id')
			.notNull()
			.references(() => properties.id, { onDelete: 'cascade' }),
		name: text('name').notNull(), // e.g. "Peak — Canada Day"
		colour: text('colour').notNull().default('#cccccc'), // hex, shown on booking grid
		startDate: text('start_date').notNull(), // ISO "YYYY-MM-DD"
		endDate: text('end_date').notNull(),
		// Minimum stay required for this season (e.g. 3 for long weekends)
		minNights: integer('min_nights').notNull().default(1),
		// Staff-only: if true, this season is never shown on the public booking page
		isManualOnly: integer('is_manual_only', { mode: 'boolean' }).notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0),
		// Optional base rate in cents. When set, room-type tiers store an upcharge on top.
		// Effective rate = baseRateCents + tier.nightlyRate_upcharge → stored as tier.nightlyRate.
		baseRateCents: integer('base_rate_cents'),
		...timestamps
	},
	(t) => [index('rate_seasons_property_idx').on(t.propertyId)]
);

// ─── Rate Tiers ───────────────────────────────────────────────────────────────
// Nightly rate per (season × room type). All amounts in cents.

export const rateTiers = sqliteTable(
	'rate_tiers',
	{
		id: id(),
		seasonId: text('season_id')
			.notNull()
			.references(() => rateSeasons.id, { onDelete: 'cascade' }),
		roomTypeId: text('room_type_id')
			.notNull()
			.references(() => roomTypes.id, { onDelete: 'cascade' }),
	nightlyRate: integer('nightly_rate').notNull(), // cents e.g. 18900 = $189.00
	// Day-of-week rate overrides: JSON 7-element array indexed 0=Sun…6=Sat.
	// null element = use nightlyRate for that day.
	// Example: '[null,null,null,null,null,18900,18900]' = Fri+Sat at $189, other days use base.
	dowRates: text('dow_rates'),
	// Occupancy-based pricing: guests above baseOccupancy are charged extraGuestFeeCents/night each
	baseOccupancy: integer('base_occupancy').notNull().default(2),
	extraGuestFeeCents: integer('extra_guest_fee_cents').notNull().default(0)
	},
	(t) => [unique('rate_tiers_season_type_uq').on(t.seasonId, t.roomTypeId)]
);

// ─── Rate Overrides ───────────────────────────────────────────────────────────
// Per-date override of the season-based rate and/or restrictions for a room type.
// Used by the ARI calendar for one-off adjustments (e.g. sold-out a specific day,
// special event premium, stop-sell a date on all channels).
// Only columns that are non-null override the season default.

export const rateOverrides = sqliteTable(
	'rate_overrides',
	{
		id: id(),
		roomTypeId: text('room_type_id')
			.notNull()
			.references(() => roomTypes.id, { onDelete: 'cascade' }),
		date: text('date').notNull(), // ISO "YYYY-MM-DD"
		// null = use season rate; set to override nightly rate for this date
		rateCents: integer('rate_cents'),
		// null = use season minNights; set to override minimum stay for this date
		minNights: integer('min_nights'),
		// Selling availability cap: null = use computed (totalRooms - bookings);
		// set to limit how many rooms are offered online for this date (OTA allotment)
		availabilityOverride: integer('availability_override'),
		// Channel restrictions
		stopSell: integer('stop_sell', { mode: 'boolean' }).notNull().default(false),
		closedToArrival: integer('closed_to_arrival', { mode: 'boolean' }).notNull().default(false),
		closedToDeparture: integer('closed_to_departure', { mode: 'boolean' }).notNull().default(false),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(t) => [
		unique('rate_overrides_type_date_uq').on(t.roomTypeId, t.date),
		index('rate_overrides_type_idx').on(t.roomTypeId),
		index('rate_overrides_date_idx').on(t.date)
	]
);


// Named tax types configured per-property. Soft-deleted (is_active = false)
// rather than removed so historical bookings retain their tax labels.

export const taxPresets = sqliteTable('tax_presets', {
	id: id(),
	propertyId: text('property_id')
		.notNull()
		.references(() => properties.id, { onDelete: 'cascade' }),
	label: text('label').notNull(), // e.g. "GST", "PST"
	ratePercent: real('rate_percent').notNull(), // e.g. 5.0, 11.0
	appliesToRoom:  integer('applies_to_room',  { mode: 'boolean' }).notNull().default(true),
	appliesToAddon: integer('applies_to_addon', { mode: 'boolean' }).notNull().default(true),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull()
});

// ─── Add-On Presets ───────────────────────────────────────────────────────────
// Pre-configured charge items (pet fee, parking, etc.) shown as a dropdown in
// the booking folio. The operator can override qty and unit price at booking time.
// isTaxable controls whether the add-on is included in the tax subtotal.
// Soft-deleted (isActive = false) so historical line items retain their labels.

export const addonPresets = sqliteTable('addon_presets', {
	id: id(),
	propertyId: text('property_id')
		.notNull()
		.references(() => properties.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	defaultUnitCents: integer('default_unit_cents'),
	isTaxable: integer('is_taxable', { mode: 'boolean' }).notNull().default(true),
	// JSON array of taxPreset IDs that apply to this addon (null = use isTaxable fallback)
	taxPresetIds: text('tax_preset_ids'),
	// per_stay | per_night | per_adult | per_adult_per_night
	postingFactor: text('posting_factor').notNull().default('per_stay'),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull()
});

// ─── Length-of-Stay Discounts ────────────────────────────────────────────────
// Automatic % discount applied when a booking meets the minimum night threshold.
// roomTypeId = null means the rule applies to all room types in the property.

export const losDiscounts = sqliteTable('los_discounts', {
	id: id(),
	propertyId: text('property_id')
		.notNull()
		.references(() => properties.id, { onDelete: 'cascade' }),
	// null = applies to all room types for this property
	roomTypeId: text('room_type_id').references(() => roomTypes.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),       // e.g. "Weekly stay — 10% off"
	minNights: integer('min_nights').notNull(), // must book at least this many nights
	discountPercent: real('discount_percent').notNull(), // e.g. 10.0 = 10%
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull()
});

// ─── Promo Codes ─────────────────────────────────────────────────────────────
// Guest-entered discount codes on the public booking page.
// Either discountPercent OR discountCents applies (not both).

export const promoCodes = sqliteTable(
	'promo_codes',
	{
		id: id(),
		propertyId: text('property_id')
			.notNull()
			.references(() => properties.id, { onDelete: 'cascade' }),
		code: text('code').notNull(),           // e.g. "SUMMER10" (case-insensitive)
		label: text('label').notNull(),          // internal name, e.g. "Summer 2026"
		discountPercent: real('discount_percent'), // e.g. 10.0 = 10% off subtotal
		discountCents: integer('discount_cents'),  // flat deduction in cents
		maxUses: integer('max_uses'),            // null = unlimited
		usedCount: integer('used_count').notNull().default(0),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(t) => [unique('promo_codes_property_code_uq').on(t.propertyId, t.code)]
);


// Extensible source list. Seed data: Direct, Expedia, Booking.com.
// isOta flags channels that use a separate confirmation folder workflow.

export const bookingChannels = sqliteTable('booking_channels', {
	id: id(),
	name: text('name').notNull().unique(), // "Direct" | "Expedia" | "Booking.com" | …
	isOta: integer('is_ota', { mode: 'boolean' }).notNull().default(false),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	sortOrder: integer('sort_order').notNull().default(0)
});

// ─── Room Channel Listings ────────────────────────────────────────────────────
// Which rooms are listed on which OTA channels (the small per-property subset).
// Foundation for future channel manager API integration.

export const roomChannelListings = sqliteTable(
	'room_channel_listings',
	{
		id: id(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		channelId: text('channel_id')
			.notNull()
			.references(() => bookingChannels.id, { onDelete: 'cascade' }),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
	},
	(t) => [unique('rcl_room_channel_uq').on(t.roomId, t.channelId)]
);

// ─── Guests ───────────────────────────────────────────────────────────────────
// Reusable guest profiles. Looked up by name/phone at check-in.

export const guests = sqliteTable('guests', {
	id: id(),
	name: text('name').notNull(),
	phone: text('phone'),
	email: text('email'),
	street: text('street'),
	city: text('city'),
	provinceState: text('province_state'),
	country: text('country'),
	notes: text('notes'),
	// 1 (great) – 5 (problematic); null = not yet rated
	rating: integer('rating'),
	ratingNotes: text('rating_notes'),
	...timestamps
});

// ─── Groups ───────────────────────────────────────────────────────────────────
// A named block of rooms under a single organiser (wedding party, company crew,
// film crew, sports team, etc.).  Each booking links to a group via groupId.
//
// billingType:
//   master     → organiser pays one combined bill
//   individual → each guest pays their own room

export const groups = sqliteTable('groups', {
	id: id(),
	// nullable: group can span both properties
	propertyId: text('property_id').references(() => properties.id, { onDelete: 'set null' }),
	name: text('name').notNull(), // e.g. "Smith Wedding June 14"
	organizerName:  text('organizer_name'),
	organizerPhone: text('organizer_phone'),
	organizerEmail: text('organizer_email'),
	billingType: text('billing_type').notNull().default('master'), // master | individual
	notes: text('notes'),
	...timestamps
});

// ─── Bookings ─────────────────────────────────────────────────────────────────
// Central record for the full booking lifecycle.
//
// Status flow:
//   reserved    → phone/advance booking (deposit not yet collected; tentative hold)
//   confirmed   → deposit received; booking committed
//   checked_in  → guest on property (registration card stage)
//   checked_out → guest has departed
//   cancelled   → booking voided (never hard-deleted; kept for history)
//
// Walk-ins skip 'reserved' and are created directly as 'confirmed' (payment immediate).
// OTA bookings arrive as 'confirmed' (OTA guarantees the payment).
// Recording a received deposit on a 'reserved' booking auto-promotes it to 'confirmed'.

export const bookings = sqliteTable(
	'bookings',
	{
		id: id(),
		propertyId: text('property_id')
			.notNull()
			.references(() => properties.id),
		roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
		guestId: text('guest_id').references(() => guests.id, { onDelete: 'set null' }),
		channelId: text('channel_id').references(() => bookingChannels.id, { onDelete: 'set null' }),
		clerkId: text('clerk_id').references(() => user.id, { onDelete: 'set null' }),

		// reserved | confirmed | checked_in | checked_out | cancelled | blocked
		status: text('status').notNull().default('reserved'),

		checkInDate: text('check_in_date').notNull(), // "YYYY-MM-DD"
		checkOutDate: text('check_out_date').notNull(),

		// Filled at check-in (card stage)
		numAdults: integer('num_adults').notNull().default(1),
		numChildren: integer('num_children').notNull().default(0),
		vehicleMake: text('vehicle_make'),
		vehicleColour: text('vehicle_colour'),
		vehiclePlate: text('vehicle_plate'),

		otaConfirmationNumber: text('ota_confirmation_number'),
		// Set on public (online) bookings — 8-char token for confirmation page (no auth)
		publicToken: text('public_token').unique(),
		// For unassigned online bookings: captures the requested room type before operator assigns a room
		requestedRoomTypeId: text('requested_room_type_id').references(() => roomTypes.id, { onDelete: 'set null' }),
		// Free-text clerk name for non-registered users (walk-ins helping at desk, etc.)
		// Takes precedence over clerkId for display when set.
		clerkName: text('clerk_name'),
		// Selected room configuration when room has multiple configs (e.g. "1Q+1D Sleeping")
		roomConfig: text('room_config'),
		notes: text('notes'),

		// Timestamps for lifecycle events
		checkedInAt: integer('checked_in_at', { mode: 'timestamp_ms' }),
		checkedOutAt: integer('checked_out_at', { mode: 'timestamp_ms' }),
		cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),

		checkoutNotes: text('checkout_notes'),

		// Room-move chain: set when a booking is split mid-stay.
		// movedFromBookingId: on the NEW room booking (points back to the prior room).
		// movedToBookingId:   on the ORIGINAL booking  (points forward to the new room).
		// Stored as plain text (no FK) to avoid self-referential DDL issues.
		movedFromBookingId: text('moved_from_booking_id'),
		movedToBookingId:   text('moved_to_booking_id'),

		// Group bookings: multiple rooms linked under one folio
		groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),

		// Guest signed the registration card / waiver
		waiverSigned: integer('waiver_signed', { mode: 'boolean' }).default(false),

		// Self check-in: unique token sent to guest via link
		selfCheckinToken: text('self_checkin_token').unique(),
		// Timestamp when the guest completed self check-in
		selfCheckinAt: integer('self_checkin_at', { mode: 'timestamp_ms' }),
		// Timestamp when pre-arrival email (with self check-in link) was sent
		preArrivalSentAt: integer('pre_arrival_sent_at', { mode: 'timestamp_ms' }),

		// Tracks when a confirmation email was last sent to the guest
		confirmationSentAt: integer('confirmation_sent_at', { mode: 'timestamp_ms' }),

		// Applied promo code (for tracking usage)
		promoCodeId: text('promo_code_id').references(() => promoCodes.id, { onDelete: 'set null' }),

		...timestamps
	},
	(t) => [
		index('bookings_property_idx').on(t.propertyId),
		index('bookings_room_idx').on(t.roomId),
		index('bookings_checkin_idx').on(t.checkInDate),
		index('bookings_status_idx').on(t.status)
	]
);

// ─── Booking Line Items ───────────────────────────────────────────────────────
// Freeform financial lines mirroring the handwritten card format.
// type: "rate" | "tax" | "extra" | "deposit"
//
// Examples:
//   rate    label="3 Days at $189"   qty=3  unitAmount=18900  total=56700
//   tax     label="GST"              qty=—  unitAmount=—      total=2835
//   extra   label="Pet fee"          qty=1  unitAmount=2500   total=2500
//   deposit label="Less Deposit"     qty=—  unitAmount=—      total=-10000 (negative)
//
// All amounts in cents. Totals are stored as entered — no auto-recalculation
// on read, matching the paper system where the operator writes what they decide.

export const bookingLineItems = sqliteTable(
	'booking_line_items',
	{
		id: id(),
		bookingId: text('booking_id')
			.notNull()
			.references(() => bookings.id, { onDelete: 'cascade' }),
		type: text('type').notNull(), // rate | tax | extra | deposit
		label: text('label').notNull(),
		quantity: real('quantity'), // nights/days — rate lines only
		unitAmount: integer('unit_amount'), // cents — rate lines only
		totalAmount: integer('total_amount').notNull(), // cents; negative for deposit
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(t) => [index('bli_booking_idx').on(t.bookingId)]
);

// ─── Payment Events ───────────────────────────────────────────────────────────
// Immutable record of every charge, deposit, and refund against a booking.
// type: "deposit" | "final_charge" | "refund"
// status: "pending" (recorded but not yet collected) | "received" (money in hand)
// Amounts in cents; refunds stored as positive values with type="refund".

export const paymentEvents = sqliteTable(
	'payment_events',
	{
		id: id(),
		bookingId: text('booking_id')
			.notNull()
			.references(() => bookings.id, { onDelete: 'cascade' }),
		type: text('type').notNull(), // deposit | final_charge | refund
		// pending = noted but not yet collected; received = money confirmed in hand
		status: text('status').notNull().default('received'), // pending | received
		amount: integer('amount').notNull(), // cents
		paymentMethod: text('payment_method').notNull(), // card | cash | check | other
		receiptNumber: text('receipt_number'),
		notes: text('notes'),
		chargedAt: integer('charged_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(t) => [index('pe_booking_idx').on(t.bookingId)]
);

// ─── CC Staging ───────────────────────────────────────────────────────────────
// Short-lived encrypted storage for card details recorded during a phone call.
// One record per booking maximum (unique constraint on bookingId).
//
// Encryption: AES-256-GCM, key from CC_ENCRYPTION_KEY env var.
// Cleared immediately after the deposit is charged (isCharged = true → delete).
// expiresAt is a hard 24-hour TTL safety net; a cleanup job removes expired rows.
//
// IMPORTANT: encryptedData must NEVER be logged, serialized to client, or
// included in any API response. Access only through the charge workflow.

export const ccStaging = sqliteTable('cc_staging', {
	id: id(),
	bookingId: text('booking_id')
		.notNull()
		.unique()
		.references(() => bookings.id, { onDelete: 'cascade' }),
	encryptedData: text('encrypted_data').notNull(), // AES-256-GCM ciphertext
	lastFour: text('last_four'), // for display only — not sensitive
	cardType: text('card_type'), // "Visa" | "MC" | "Amex" | …
	isCharged: integer('is_charged', { mode: 'boolean' }).notNull().default(false),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull()
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const groupsRelations = relations(groups, ({ one, many }) => ({
	property: one(properties, { fields: [groups.propertyId], references: [properties.id] }),
	bookings: many(bookings)
}));

export const addonPresetsRelations = relations(addonPresets, ({ one }) => ({
	property: one(properties, { fields: [addonPresets.propertyId], references: [properties.id] })
}));

export const propertiesRelations = relations(properties, ({ many }) => ({
	roomTypes: many(roomTypes),
	rooms: many(rooms),
	rateSeasons: many(rateSeasons),
	taxPresets: many(taxPresets),
	addonPresets: many(addonPresets),
	losDiscounts: many(losDiscounts),
	promoCodes: many(promoCodes),
	bookings: many(bookings)
}));

export const roomTypesRelations = relations(roomTypes, ({ one, many }) => ({
	property: one(properties, { fields: [roomTypes.propertyId], references: [properties.id] }),
	parent: one(roomTypes, { fields: [roomTypes.parentRoomTypeId], references: [roomTypes.id], relationName: 'parentChild' }),
	children: many(roomTypes, { relationName: 'parentChild' }),
	rooms: many(rooms),
	rateTiers: many(rateTiers),
	losDiscounts: many(losDiscounts)
}));

export const losDiscountsRelations = relations(losDiscounts, ({ one }) => ({
	property: one(properties, { fields: [losDiscounts.propertyId], references: [properties.id] }),
	roomType: one(roomTypes, { fields: [losDiscounts.roomTypeId], references: [roomTypes.id] })
}));

export const promoCodesRelations = relations(promoCodes, ({ one, many }) => ({
	property: one(properties, { fields: [promoCodes.propertyId], references: [properties.id] }),
	bookings: many(bookings)
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
	property: one(properties, { fields: [rooms.propertyId], references: [properties.id] }),
	roomType: one(roomTypes, { fields: [rooms.roomTypeId], references: [roomTypes.id] }),
	bookings: many(bookings),
	channelListings: many(roomChannelListings)
}));

export const rateSeasonsRelations = relations(rateSeasons, ({ one, many }) => ({
	property: one(properties, { fields: [rateSeasons.propertyId], references: [properties.id] }),
	tiers: many(rateTiers)
}));

export const rateTiersRelations = relations(rateTiers, ({ one }) => ({
	season: one(rateSeasons, { fields: [rateTiers.seasonId], references: [rateSeasons.id] }),
	roomType: one(roomTypes, { fields: [rateTiers.roomTypeId], references: [roomTypes.id] })
}));

export const rateOverridesRelations = relations(rateOverrides, ({ one }) => ({
	roomType: one(roomTypes, { fields: [rateOverrides.roomTypeId], references: [roomTypes.id] })
}));

export const taxPresetsRelations = relations(taxPresets, ({ one }) => ({
	property: one(properties, { fields: [taxPresets.propertyId], references: [properties.id] })
}));

export const bookingChannelsRelations = relations(bookingChannels, ({ many }) => ({
	listings: many(roomChannelListings),
	bookings: many(bookings)
}));

export const roomChannelListingsRelations = relations(roomChannelListings, ({ one }) => ({
	room: one(rooms, { fields: [roomChannelListings.roomId], references: [rooms.id] }),
	channel: one(bookingChannels, {
		fields: [roomChannelListings.channelId],
		references: [bookingChannels.id]
	})
}));

export const guestsRelations = relations(guests, ({ many }) => ({
	bookings: many(bookings)
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
	property: one(properties, { fields: [bookings.propertyId], references: [properties.id] }),
	room: one(rooms, { fields: [bookings.roomId], references: [rooms.id] }),
	requestedRoomType: one(roomTypes, { fields: [bookings.requestedRoomTypeId], references: [roomTypes.id] }),
	guest: one(guests, { fields: [bookings.guestId], references: [guests.id] }),
	channel: one(bookingChannels, { fields: [bookings.channelId], references: [bookingChannels.id] }),
	clerk: one(user, { fields: [bookings.clerkId], references: [user.id] }),
	group: one(groups, { fields: [bookings.groupId], references: [groups.id] }),
	promoCode: one(promoCodes, { fields: [bookings.promoCodeId], references: [promoCodes.id] }),
	lineItems: many(bookingLineItems),
	paymentEvents: many(paymentEvents),
	ccStaging: one(ccStaging, { fields: [bookings.id], references: [ccStaging.bookingId] })
}));

export const bookingLineItemsRelations = relations(bookingLineItems, ({ one }) => ({
	booking: one(bookings, { fields: [bookingLineItems.bookingId], references: [bookings.id] })
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
	booking: one(bookings, { fields: [paymentEvents.bookingId], references: [bookings.id] })
}));

export const ccStagingRelations = relations(ccStaging, ({ one }) => ({
	booking: one(bookings, { fields: [ccStaging.bookingId], references: [bookings.id] })
}));

// ─── Night Audit Runs ─────────────────────────────────────────────────────────
// Records each time a night audit was completed for a property.
// Unique constraint prevents double-auditing a night.

export const nightAuditRuns = sqliteTable(
	'night_audit_runs',
	{
		id: id(),
		propertyId: text('property_id')
			.notNull()
			.references(() => properties.id, { onDelete: 'cascade' }),
		auditDate: text('audit_date').notNull(), // ISO "YYYY-MM-DD" — the night being audited
		ranBy: text('ran_by').references(() => user.id, { onDelete: 'set null' }),
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(t) => [
		index('nar_property_idx').on(t.propertyId),
		unique('nar_property_date_uq').on(t.propertyId, t.auditDate)
	]
);

export const nightAuditRunsRelations = relations(nightAuditRuns, ({ one }) => ({
	property: one(properties, { fields: [nightAuditRuns.propertyId], references: [properties.id] }),
	user: one(user, { fields: [nightAuditRuns.ranBy], references: [user.id] })
}));
