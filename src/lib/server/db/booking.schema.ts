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
		sortOrder: integer('sort_order').notNull().default(0),
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
		nightlyRate: integer('nightly_rate').notNull() // cents e.g. 18900 = $189.00
	},
	(t) => [unique('rate_tiers_season_type_uq').on(t.seasonId, t.roomTypeId)]
);

// ─── Tax Presets ──────────────────────────────────────────────────────────────
// Named tax types configured per-property. Soft-deleted (is_active = false)
// rather than removed so historical bookings retain their tax labels.

export const taxPresets = sqliteTable('tax_presets', {
	id: id(),
	propertyId: text('property_id')
		.notNull()
		.references(() => properties.id, { onDelete: 'cascade' }),
	label: text('label').notNull(), // e.g. "GST", "PST"
	ratePercent: real('rate_percent').notNull(), // e.g. 5.0, 11.0
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull()
});

// ─── Booking Channels ─────────────────────────────────────────────────────────
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
	...timestamps
});

// ─── Bookings ─────────────────────────────────────────────────────────────────
// Central record for the full booking lifecycle.
//
// Status flow:
//   confirmed  → phone/advance booking (slip stage)
//   checked_in → guest on property (registration card stage)
//   checked_out → guest has departed
//   cancelled  → booking voided (never hard-deleted; kept for history)
//
// Walk-ins are created as confirmed and immediately transitioned to checked_in.
// The "slip view" and "card view" are UI states of this same record.

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

		// confirmed | checked_in | checked_out | cancelled
		status: text('status').notNull().default('confirmed'),

		checkInDate: text('check_in_date').notNull(), // "YYYY-MM-DD"
		checkOutDate: text('check_out_date').notNull(),

		// Filled at check-in (card stage)
		numAdults: integer('num_adults').notNull().default(1),
		numChildren: integer('num_children').notNull().default(0),
		vehicleMake: text('vehicle_make'),
		vehicleColour: text('vehicle_colour'),
		vehiclePlate: text('vehicle_plate'),

		otaConfirmationNumber: text('ota_confirmation_number'),
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
// Amounts in cents; refunds stored as positive values with type="refund".

export const paymentEvents = sqliteTable(
	'payment_events',
	{
		id: id(),
		bookingId: text('booking_id')
			.notNull()
			.references(() => bookings.id, { onDelete: 'cascade' }),
		type: text('type').notNull(), // deposit | final_charge | refund
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

export const propertiesRelations = relations(properties, ({ many }) => ({
	roomTypes: many(roomTypes),
	rooms: many(rooms),
	rateSeasons: many(rateSeasons),
	taxPresets: many(taxPresets),
	bookings: many(bookings)
}));

export const roomTypesRelations = relations(roomTypes, ({ one, many }) => ({
	property: one(properties, { fields: [roomTypes.propertyId], references: [properties.id] }),
	rooms: many(rooms),
	rateTiers: many(rateTiers)
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
	guest: one(guests, { fields: [bookings.guestId], references: [guests.id] }),
	channel: one(bookingChannels, { fields: [bookings.channelId], references: [bookingChannels.id] }),
	clerk: one(user, { fields: [bookings.clerkId], references: [user.id] }),
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
