<script lang="ts">
	// ── Status badge colours ───────────────────────────────────────────────────
	type Status = 'implemented' | 'partial' | 'planned';

	const STATUS_LABEL: Record<Status, string> = {
		implemented: 'Implemented',
		partial: 'Partial',
		planned: 'Planned'
	};
	const STATUS_CLASS: Record<Status, string> = {
		implemented: 'bg-green-100 text-green-800 border-green-200',
		partial: 'bg-amber-100 text-amber-800 border-amber-200',
		planned: 'bg-stone-100 text-stone-500 border-stone-200'
	};

	// ── Nav structure ──────────────────────────────────────────────────────────
	type Article = { id: string; title: string; status: Status };
	type Section = { id: string; label: string; icon: string; articles: Article[] };

	const sections: Section[] = [
		{
			id: 'getting-started', label: 'Getting Started', icon: '🚀',
			articles: [
				{ id: 'welcome',        title: 'Welcome to Rezzzo',       status: 'implemented' },
				{ id: 'property-setup', title: 'Setting up your property', status: 'implemented' },
				{ id: 'room-types',     title: 'Room types & parent rooms', status: 'implemented' },
				{ id: 'rooms',          title: 'Physical rooms',            status: 'implemented' },
				{ id: 'first-booking',  title: 'Your first booking',        status: 'implemented' }
			]
		},
		{
			id: 'rates', label: 'Rates & Pricing', icon: '💲',
			articles: [
				{ id: 'rate-seasons',    title: 'Rate seasons',              status: 'implemented' },
				{ id: 'rate-tiers',      title: 'Per-room-type rates',       status: 'implemented' },
				{ id: 'date-overrides',  title: 'Per-date rate overrides',   status: 'implemented' },
				{ id: 'los-discounts',   title: 'Length-of-stay discounts',  status: 'implemented' },
				{ id: 'promo-codes',     title: 'Promo codes',               status: 'implemented' },
				{ id: 'extra-guests',    title: 'Extra guest fees',          status: 'implemented' },
				{ id: 'staff-rates',     title: 'Staff-only (manual) rates', status: 'implemented' }
			]
		},
		{
			id: 'inventory', label: 'Inventory & Availability', icon: '📦',
			articles: [
				{ id: 'availability-calc', title: 'How availability works',    status: 'implemented' },
				{ id: 'stop-sell',         title: 'Stop-sell & availability cap', status: 'implemented' },
				{ id: 'parent-child',      title: 'Parent / child room types', status: 'implemented' },
				{ id: 'restrictions',      title: 'Min stay, CTA & CTD',       status: 'implemented' },
				{ id: 'blackouts',         title: 'Blackout dates',             status: 'implemented' }
			]
		},
		{
			id: 'online-booking', label: 'Online Booking', icon: '🌐',
			articles: [
				{ id: 'booking-page',    title: 'Public booking page',        status: 'implemented' },
				{ id: 'rate-calendar',   title: 'Rate calendar widget',       status: 'implemented' },
				{ id: 'booking-promo',   title: 'Promo codes at booking',     status: 'implemented' },
				{ id: 'deposit-flow',    title: 'Deposit workflow',           status: 'implemented' },
				{ id: 'confirm-email',   title: 'Confirmation emails',        status: 'implemented' }
			]
		},
		{
			id: 'reservations', label: 'Reservations', icon: '📅',
			articles: [
				{ id: 'create-booking',  title: 'Creating a booking',         status: 'implemented' },
				{ id: 'assign-room',     title: 'Assigning rooms',            status: 'implemented' },
				{ id: 'booking-addons',  title: 'Add-ons & extras',           status: 'implemented' },
				{ id: 'folio-receipt',   title: 'Folio & receipt',            status: 'implemented' },
				{ id: 'group-bookings',  title: 'Group bookings',             status: 'implemented' },
				{ id: 'move-booking',    title: 'Moving a booking',           status: 'implemented' },
				{ id: 'checkin-out',     title: 'Check-in & check-out',       status: 'implemented' }
			]
		},
		{
			id: 'guests', label: 'Guests', icon: '👤',
			articles: [
				{ id: 'guest-profiles',  title: 'Guest profiles',             status: 'implemented' },
				{ id: 'create-guest',    title: 'Creating a guest',           status: 'implemented' },
				{ id: 'self-checkin',    title: 'Self check-in',              status: 'implemented' },
				{ id: 'pre-arrival',     title: 'Pre-arrival emails',         status: 'implemented' },
				{ id: 'digital-waiver',  title: 'Digital waiver & e-sign',    status: 'implemented' },
				{ id: 'guest-dedup',     title: 'Guest deduplication / merge',status: 'implemented' }
			]
		},
		{
			id: 'payments', label: 'Payments', icon: '💳',
			articles: [
				{ id: 'elavon-setup',    title: 'Elavon setup',               status: 'implemented' },
				{ id: 'charge-deposit',  title: 'Charging a deposit',         status: 'implemented' },
				{ id: 'refunds-voids',   title: 'Refunds & voids',            status: 'implemented' },
				{ id: 'public-receipt',  title: 'Public receipt link',        status: 'implemented' }
			]
		},
		{
			id: 'reports', label: 'Reports', icon: '📊',
			articles: [
				{ id: 'occupancy-report', title: 'Occupancy report',          status: 'implemented' },
				{ id: 'adr-revpar',       title: 'ADR & RevPAR',              status: 'implemented' },
				{ id: 'custom-dates',     title: 'Custom date ranges',        status: 'implemented' }
			]
		},
		{
			id: 'channels', label: 'Channels & OTA', icon: '🔗',
			articles: [
				{ id: 'channex-setup',   title: 'Channex channel manager',    status: 'implemented' },
				{ id: 'ari-sync',        title: 'ARI sync (rates, inventory)',  status: 'implemented' },
				{ id: 'ota-mapping',     title: 'OTA room type mapping',      status: 'implemented' }
			]
		},
		{
			id: 'settings', label: 'Settings & Admin', icon: '⚙️',
			articles: [
				{ id: 'tax-presets',     title: 'Tax presets',                status: 'implemented' },
				{ id: 'property-branding', title: 'Property branding',        status: 'implemented' },
				{ id: 'email-templates', title: 'Email templates & cron',     status: 'implemented' },
				{ id: 'housekeeping',    title: 'Housekeeping status',         status: 'implemented' },
				{ id: 'multi-property',  title: 'Multi-property management',  status: 'implemented' }
			]
		},
		{
			id: 'comparison', label: 'Feature Comparison', icon: '⚖️',
			articles: [
				{ id: 'vs-onres',        title: 'Rezzzo vs OnRes',            status: 'implemented' }
			]
		}
	];

	let activeId = $state('welcome');
	let searchQuery = $state('');
	let sidebarOpen = $state(false);

	const flatArticles = sections.flatMap((s) => s.articles.map((a) => ({ ...a, sectionLabel: s.label })));

	const filteredSections = $derived(() => {
		const q = searchQuery.toLowerCase().trim();
		if (!q) return sections;
		return sections.map((s) => ({
			...s,
			articles: s.articles.filter((a) =>
				a.title.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)
			)
		})).filter((s) => s.articles.length > 0);
	});

	function select(id: string) {
		activeId = id;
		sidebarOpen = false;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	const activeArticle = $derived(flatArticles.find((a) => a.id === activeId));
</script>

<svelte:head>
	<title>Help & Documentation — Rezzzo</title>
</svelte:head>

<div class="flex w-full overflow-hidden" style="height: calc(100dvh - 3.5rem);">

	<!-- ── Mobile sidebar toggle ──────────────────────────────────────────── -->
	<button
		class="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg lg:hidden"
		onclick={() => { sidebarOpen = !sidebarOpen; }}
		aria-label="Toggle navigation"
	>
		{sidebarOpen ? '✕' : '☰'}
	</button>

	<!-- ── Sidebar ────────────────────────────────────────────────────────── -->
	<aside class={[
		'z-40 w-64 shrink-0 overflow-y-auto border-r border-stone-200 bg-white',
		'transition-transform duration-200',
		'fixed inset-y-14 left-0 lg:static lg:inset-auto lg:translate-x-0',
		sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:translate-x-0'
	].join(' ')} style="height: calc(100dvh - 3.5rem);">
		<div class="sticky top-0 bg-white px-3 py-3 border-b border-stone-100 z-10">
			<p class="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Documentation</p>
			<input
				type="search"
				placeholder="Search…"
				bind:value={searchQuery}
				class="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
			/>
		</div>
		<nav class="px-2 py-2">
			{#each filteredSections() as section}
				<div class="mb-1">
					<p class="mb-0.5 px-2 pt-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
						{section.icon} {section.label}
					</p>
					{#each section.articles as article}
						<button
							type="button"
							onclick={() => select(article.id)}
							class={[
								'w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-left transition-colors',
								activeId === article.id
									? 'bg-amber-50 font-semibold text-amber-900'
									: 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
							].join(' ')}
						>
							<span class="truncate">{article.title}</span>
							{#if article.status !== 'implemented'}
								<span class={[
									'ml-1.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase',
									STATUS_CLASS[article.status]
								].join(' ')}>
									{article.status === 'partial' ? 'Partial' : 'Soon'}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			{/each}
		</nav>
	</aside>

	<!-- ── Backdrop (mobile) ───────────────────────────────────────────────── -->
	{#if sidebarOpen}
		<button
			type="button"
			aria-label="Close navigation"
			class="fixed inset-0 z-30 bg-black/40 lg:hidden cursor-default"
			onclick={() => { sidebarOpen = false; }}
		></button>
	{/if}

	<!-- ── Main content ───────────────────────────────────────────────────── -->
	<main class="flex-1 min-w-0 overflow-y-auto bg-stone-50">
		<div class="px-6 py-8 lg:px-10 lg:py-10 max-w-3xl">

		<!-- Article header -->
		{#if activeArticle}
			<div class="mb-6 flex items-start gap-3">
				<div class="flex-1 min-w-0">
					<p class="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-1">
						{flatArticles.find(a => a.id === activeId)?.sectionLabel}
					</p>
					<h1 class="text-2xl font-bold text-stone-900">{activeArticle.title}</h1>
				</div>
				<span class={[
					'mt-1 shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold',
					STATUS_CLASS[activeArticle.status]
				].join(' ')}>
					{STATUS_LABEL[activeArticle.status]}
				</span>
			</div>
		{/if}

		<!-- Article content (switch on activeId) -->
		{#if activeId === 'welcome'}
			<div class="prose-help">
				<p class="lead">Rezzzo is a cloud-based property management system built for independent motels. It handles bookings, rates, inventory, payments, and guest communication — all from a mobile-friendly web interface.</p>
				<h2>What you can do with Rezzzo</h2>
				<ul>
					<li><strong>Booking grid</strong> — a visual calendar showing all rooms and bookings side by side. Drag to create, drag to move.</li>
					<li><strong>Online booking</strong> — a branded public booking page with a live rate calendar, promo codes, and instant confirmation emails.</li>
					<li><strong>Rate management</strong> — seasonal pricing with per-date overrides, LOS discounts, extra guest fees, and staff-only rates.</li>
					<li><strong>Inventory control</strong> — stop-sell, availability caps, closed-to-arrival restrictions, and min-stay enforcement.</li>
					<li><strong>Payments</strong> — Elavon credit card processing with deposit capture, refunds, and voids.</li>
					<li><strong>Guest management</strong> — profiles, self check-in with digital waiver, pre-arrival emails, and door codes.</li>
					<li><strong>Reports</strong> — occupancy, ADR, RevPAR, and revenue for any date range.</li>
					<li><strong>Channel manager</strong> — two-way ARI sync with OTAs via Channex.</li>
				</ul>
				<div class="callout callout-tip">
					<strong>Tip:</strong> Start by setting up your property, then add room types and rooms, then configure your first rate season. The Getting Started section walks you through it in order.
				</div>
			</div>

		{:else if activeId === 'property-setup'}
			<div class="prose-help">
				<p class="lead">Before you can create bookings, you need to configure your property's basic details.</p>
				<h2>Steps</h2>
				<ol>
					<li>Go to <strong>Settings → Property</strong>.</li>
					<li>Fill in your property name, address, city, province, and phone number.</li>
					<li>Upload a logo URL and set an accent colour — these appear on your public booking page.</li>
					<li>Set your <strong>cancellation policy</strong> text — shown to guests before they book online.</li>
					<li>Set a <strong>public booking ID</strong> (short URL slug) — this is the path to your booking page, e.g. <code>/book/falcon-motel</code>.</li>
					<li>Optionally add a <strong>booking description</strong> shown in the booking page header.</li>
				</ol>
				<h2>Elavon payment credentials</h2>
				<p>If you process payments through Elavon, enter your merchant ID, user ID, and PIN under the Elavon section of Property Settings. These are used to charge deposits directly through the booking card.</p>
				<div class="callout callout-warning">
					<strong>Note:</strong> Elavon credentials are property-specific. If you manage multiple properties with separate Elavon merchant accounts, each property has its own credentials.
				</div>
			</div>

		{:else if activeId === 'room-types'}
			<div class="prose-help">
				<p class="lead">Room types are the bookable categories you offer guests. Physical rooms are then assigned to a type.</p>
				<h2>Creating a room type</h2>
				<ol>
					<li>Go to <strong>Settings → Rooms &amp; Types</strong>.</li>
					<li>Under "Room Types", fill in a name (e.g. "2 Bed + Kitchen"), a short code (e.g. <code>2BDK</code>), and sort order.</li>
					<li>Optionally add a photo URL, description (shown on the booking page), and max occupancy ("Sleeps N").</li>
					<li>Set a default nightly rate — this is the fallback rate used when no season covers a date.</li>
				</ol>
				<h2>Parent / child room types</h2>
				<p>If you have rooms that can be sold in different configurations (e.g. a 2-bedroom unit sold as either a "1 Bed Room" or a "2 Bed Suite"), use the <strong>"Uses inventory of"</strong> dropdown.</p>
				<ul>
					<li>The <strong>parent</strong> type owns the physical rooms (inventory lives here).</li>
					<li><strong>Child</strong> types borrow from the parent's pool — booking either a 1-bed or a 2-bed suite reduces the same physical inventory.</li>
					<li>Child types can have their own rates (set in rate seasons) while sharing the physical pool.</li>
				</ul>
				<div class="callout callout-tip">
					<strong>Example:</strong> 4 physical 2-bedroom units. Create "2 Bed Unit" as the parent (with the 4 physical rooms). Create "1 Bed Room" and "2 Bed Suite" as children pointing to "2 Bed Unit". Now booking any configuration correctly reduces availability.
				</div>
			</div>

		{:else if activeId === 'rooms'}
			<div class="prose-help">
				<p class="lead">Physical rooms are individual bookable units. Each room belongs to a room type and can be assigned to a booking.</p>
				<h2>Adding a room</h2>
				<ol>
					<li>Go to <strong>Settings → Rooms &amp; Types</strong>, scroll to the Rooms section.</li>
					<li>Enter the room number, select a room type, and specify bed configuration (king, queen, double, hideabed) and whether it has a kitchen.</li>
					<li>Optionally add a <strong>door code</strong> and <strong>check-in instructions</strong> — these are sent to guests in the pre-arrival email and self check-in link.</li>
				</ol>
				<h2>Activating / deactivating rooms</h2>
				<p>Use the Active/Inactive toggle on the room row to take a room out of rotation (e.g. for renovation) without deleting it. Inactive rooms are excluded from availability and booking grid.</p>
				<h2>Child room types</h2>
				<p>If a room type has a parent set ("Uses inventory of"), it has no physical rooms of its own — don't add rooms to child types. The parent's rooms are used automatically.</p>
			</div>

		{:else if activeId === 'first-booking'}
			<div class="prose-help">
				<p class="lead">Once your property, room types, rooms, and at least one rate season are set up, you can take your first booking.</p>
				<h2>Manual booking (staff-created)</h2>
				<ol>
					<li>Go to the <strong>Booking Grid</strong>.</li>
					<li>Click an empty cell on the grid, or click the <strong>+ New</strong> button.</li>
					<li>Fill in the guest's name, email, phone, check-in/out dates, and room type.</li>
					<li>The system auto-assigns an available room. You can reassign later.</li>
				</ol>
				<h2>Online booking (guest-initiated)</h2>
				<p>Your guests can book directly at <code>/book/[your-public-id]</code>. They select dates on the rate calendar, choose a room type, enter their details, and submit. A confirmation email is sent automatically.</p>
			</div>

		{:else if activeId === 'rate-seasons'}
			<div class="prose-help">
				<p class="lead">Rate seasons define named date ranges with specific pricing. All rates in Rezzzo are season-based.</p>
				<h2>Creating a season</h2>
				<ol>
					<li>Go to <strong>Rates</strong>. Select your property and year from the top bar.</li>
					<li>Drag across days on the calendar to define a date range. A popover appears to set the season name, colour, base rate, and minimum stay.</li>
					<li>Seasons are colour-coded on the calendar for easy visual reference.</li>
				</ol>
				<h2>Base rate vs. per-type rates</h2>
				<p>You can set a <strong>base rate</strong> on a season, which applies to all room types. Or leave it blank and set individual rates per room type in the side panel. Room-type rates override the base rate.</p>
				<h2>Minimum stay</h2>
				<p>Set a minimum number of nights for a season (e.g. 2 for long weekends). Guests are warned on the public booking page and cannot submit a shorter booking.</p>
				<h2>Staff-only seasons</h2>
				<p>Check <strong>"Staff only"</strong> to prevent a season from appearing on the public booking page. Useful for group/corporate rates that should only be applied by staff.</p>
				<h2>Copying a year</h2>
				<p>Use <strong>Copy from [year]</strong> in the toolbar to duplicate all seasons from the previous year into the current year, shifting dates by exactly 12 months.</p>
			</div>

		{:else if activeId === 'rate-tiers'}
			<div class="prose-help">
				<p class="lead">Within each rate season, you can set a different nightly rate per room type.</p>
				<h2>Setting rates</h2>
				<p>Select a season on the rates calendar, then use the side panel to enter a dollar rate for each room type. Click ✓ to save each row individually.</p>
				<h2>Base occupancy &amp; extra guest fee</h2>
				<p>Each rate tier has two optional fields:</p>
				<ul>
					<li><strong>Base occ</strong> — the number of guests the base rate covers (default 2).</li>
					<li><strong>+$/extra</strong> — additional charge per guest above the base, per night.</li>
				</ul>
				<p>Example: base rate $150, base occ 2, extra $20/night. A booking for 3 guests over 4 nights would add $80 in extra guest charges.</p>
				<div class="callout callout-tip">
					The extra guest fee appears as a separate line in the rate breakdown on the public booking page, so guests can see exactly what they're paying.
				</div>
			</div>

		{:else if activeId === 'date-overrides'}
			<div class="prose-help">
				<p class="lead">The inventory grid lets you override rates, minimum stay, availability, and stop-sell on a per-date basis, independent of seasons.</p>
				<h2>Accessing overrides</h2>
				<p>Go to <strong>Inventory</strong>. The grid shows room types as rows and dates as columns. Click any cell to set overrides for a specific date or date range.</p>
				<h2>Available overrides</h2>
				<ul>
					<li><strong>Rate</strong> — override the nightly rate for specific dates.</li>
					<li><strong>Min nights</strong> — set a minimum stay requirement for specific dates (e.g. 3 nights minimum over Canada Day).</li>
					<li><strong>Availability cap</strong> — limit how many rooms are offered online (e.g. hold 1 back for walk-ins even if you have 4 rooms).</li>
					<li><strong>Stop-sell</strong> — prevent all online bookings for a room type on specific dates.</li>
					<li><strong>Closed to arrival (CTA)</strong> — prevent guests from checking in on a specific date.</li>
					<li><strong>Closed to departure (CTD)</strong> — prevent guests from checking out on a specific date.</li>
				</ul>
				<div class="callout callout-warning">
					<strong>Important:</strong> All of these overrides are enforced on the public booking page and at booking submission. Guests cannot bypass them online.
				</div>
				<h2>Channex sync</h2>
				<p>Overrides set in the inventory grid are also synced to Channex (and from there to connected OTAs) when you use the channel manager.</p>
			</div>

		{:else if activeId === 'los-discounts'}
			<div class="prose-help">
				<p class="lead">LOS (Length-of-Stay) discounts automatically apply a percentage discount when a guest books a minimum number of nights.</p>
				<h2>Setting up an LOS discount</h2>
				<ol>
					<li>Go to <strong>Settings → Rates &amp; Promotions</strong>.</li>
					<li>Under "Length-of-Stay Discounts", enter a label, minimum nights, and discount percentage.</li>
					<li>Optionally restrict it to a specific room type — or leave blank to apply to all types.</li>
				</ol>
				<h2>How it's applied</h2>
				<p>Rezzzo automatically finds the best (highest discount) applicable LOS rule for the number of nights being booked. The discount is applied to the rate subtotal before any promo code. The discount line appears in the booking page rate breakdown.</p>
			</div>

		{:else if activeId === 'promo-codes'}
			<div class="prose-help">
				<p class="lead">Promo codes allow guests to enter a code at booking for a percentage or flat dollar discount.</p>
				<h2>Creating a promo code</h2>
				<ol>
					<li>Go to <strong>Settings → Rates &amp; Promotions</strong>.</li>
					<li>Under "Promo Codes", enter the code (e.g. <code>SUMMER10</code>), a label, and the discount (% or $ amount).</li>
					<li>Optionally set a max uses limit and/or an expiry date.</li>
				</ol>
				<h2>Usage</h2>
				<p>On the public booking page, Step 3 has a promo code field. When a guest enters a valid code, the discount is applied immediately and reflected in the rate breakdown. The code's used count increments when the booking is submitted.</p>
			</div>

		{:else if activeId === 'extra-guests'}
			<div class="prose-help">
				<p class="lead">Charge additional guests above a base occupancy level on a per-night basis.</p>
				<h2>Configuration</h2>
				<p>On the <strong>Rates</strong> page, each rate tier row has two fields alongside the nightly rate:</p>
				<ul>
					<li><strong>Base occ</strong> — guests included in the base rate (default: 2).</li>
					<li><strong>+$/extra</strong> — fee per additional guest per night (in dollars).</li>
				</ul>
				<h2>Guest count on the booking page</h2>
				<p>Guests select adults and children in Step 3. As the count changes, the rate quote updates live. If total guests exceed base occupancy and a fee is configured, the surcharge is shown as a separate line in the breakdown.</p>
			</div>

		{:else if activeId === 'staff-rates'}
			<div class="prose-help">
				<p class="lead">Staff-only (manual) rate seasons are visible to staff but never shown to guests booking online.</p>
				<h2>Creating a staff-only rate</h2>
				<p>When creating or editing a rate season, check the <strong>"Staff only"</strong> checkbox. This season will be excluded from the public booking page and public pricing API.</p>
				<h2>Use cases</h2>
				<ul>
					<li>Corporate or group rates agreed at a discount</li>
					<li>Returning guest loyalty rates</li>
					<li>Travel agent rates</li>
					<li>Employee/owner rates</li>
				</ul>
				<p>Staff can apply a manual-only rate by creating a booking internally on the booking grid and manually adding a rate line item to the folio.</p>
			</div>

		{:else if activeId === 'availability-calc'}
			<div class="prose-help">
				<p class="lead">Understanding how Rezzzo calculates available rooms helps you avoid double-bookings and manage inventory correctly.</p>
				<h2>The formula</h2>
				<p>For a given room type and date range:</p>
				<pre>Available = min(totalRooms, availabilityCap) − assignedBookings − unassignedBookings</pre>
				<ul>
					<li><strong>totalRooms</strong> — active physical rooms of this type (or parent type for child room types).</li>
					<li><strong>availabilityCap</strong> — the lowest <code>availability_override</code> set in the inventory grid for any date in the range (if set).</li>
					<li><strong>assignedBookings</strong> — bookings with a specific room ID assigned that conflict with the date range.</li>
					<li><strong>unassignedBookings</strong> — bookings with no room yet assigned, for this type (or for the same pool if using parent/child).</li>
				</ul>
				<h2>Pool-based availability (parent/child)</h2>
				<p>If room types share a parent, they all draw from the same pool. A booking for a child type reduces the count available for all siblings and the parent. This prevents double-selling the same physical room under different configurations.</p>
			</div>

		{:else if activeId === 'stop-sell'}
			<div class="prose-help">
				<p class="lead">Stop-sell prevents online bookings for a room type on specific dates without removing the room from the system.</p>
				<h2>Setting a stop-sell</h2>
				<ol>
					<li>Go to <strong>Inventory</strong>.</li>
					<li>Click the cell for the room type and date(s) you want to close.</li>
					<li>Toggle <strong>Stop Sell</strong> on. Use bulk mode to set a date range at once.</li>
				</ol>
				<h2>Availability cap</h2>
				<p>Instead of a full stop-sell, you can set an <strong>availability override</strong> to limit how many rooms are offered online. For example, if you have 4 rooms but want to hold 1 back for walk-ins, set the cap to 3.</p>
				<h2>Staff can still book</h2>
				<p>Stop-sell only affects the public booking page. Staff can still create manual bookings on stopped-sell dates from the booking grid.</p>
			</div>

		{:else if activeId === 'parent-child'}
			<div class="prose-help">
				<p class="lead">Parent/child room types let you sell the same physical room under different configurations, with shared inventory.</p>
				<h2>Setup</h2>
				<ol>
					<li>Create the <strong>parent</strong> room type and assign your physical rooms to it.</li>
					<li>Create the <strong>child</strong> room types (different pricing/config options). In the room type settings, set "Uses inventory of" to the parent.</li>
					<li>Set rate seasons for the child types as normal — they can have completely different pricing from the parent.</li>
				</ol>
				<h2>How inventory is shared</h2>
				<p>When any child type is booked, it consumes one unit from the parent's physical room pool. The parent's availability, stop-sell overrides, and availability caps all apply to all children.</p>
				<h2>Room assignment</h2>
				<p>When assigning a room to a child-type booking, staff can select from the parent's physical rooms (since children have no rooms of their own).</p>
			</div>

		{:else if activeId === 'restrictions'}
			<div class="prose-help">
				<p class="lead">Booking restrictions control when guests can arrive, depart, and the minimum length of their stay.</p>
				<h2>Minimum stay</h2>
				<p>Can be set at two levels:</p>
				<ul>
					<li><strong>Season level</strong> — a default min nights for the entire season (e.g. 2 nights for all of summer).</li>
					<li><strong>Per-date override</strong> — a stricter min stay for specific dates (e.g. 3 nights on holiday weekends).</li>
				</ul>
				<p>The most restrictive value wins. Guests cannot submit a booking that violates either level.</p>
				<h2>Closed to arrival (CTA)</h2>
				<p>Prevents guests from checking in on a specific date. Set via the inventory grid. Useful for managing housekeeping load (e.g. no check-ins on Sundays).</p>
				<h2>Closed to departure (CTD)</h2>
				<p>Prevents guests from checking out on a specific date. Synced to Channex for OTA enforcement, but not currently enforced on the public Rezzzo booking page.</p>
			</div>

		{:else if activeId === 'blackouts'}
			<div class="prose-help">
				<p class="lead">Blackouts close a room type to all online bookings for a period of time.</p>
				<h2>Quick Blackout tool</h2>
				<p>The inventory page has a built-in blackout tool. Click the <strong>🚫 Blackout</strong> button in the toolbar to open it.</p>
				<ol>
					<li>Choose <strong>Close dates</strong> or <strong>Reopen dates</strong>.</li>
					<li>Pick a date range.</li>
					<li>Select a specific room type or <em>All room types</em>.</li>
					<li>Click <strong>Apply stop-sell</strong> (or <strong>Lift stop-sell</strong>).</li>
				</ol>
				<p>Changes are synced to Channex automatically. Guests cannot book online for closed dates; staff can still create internal bookings (e.g. maintenance).</p>
				<h2>Maintenance blocks</h2>
				<p>For maintenance periods, the preferred approach is to create a staff booking with status <strong>Blocked</strong> for the room(s) and dates, which removes them from availability at a room level without requiring stop-sell.</p>
			</div>

		{:else if activeId === 'booking-page'}
			<div class="prose-help">
				<p class="lead">Every property has a branded public booking page at <code>/book/[publicId]</code>.</p>
				<h2>What guests see</h2>
				<ol>
					<li><strong>Step 1 — Dates:</strong> A 2-month rate calendar with per-day pricing. Stop-sold dates are greyed out. Guests click to select check-in, then check-out.</li>
					<li><strong>Step 2 — Room:</strong> Available room types with photos, descriptions, bed config, "Sleeps N", and estimated total.</li>
					<li><strong>Step 3 — Confirm:</strong> Guest details, guest count (with live extra-guest fee update), promo code field, full rate breakdown, and submit.</li>
				</ol>
				<h2>Branding</h2>
				<p>The booking page uses your property's accent colour and logo. Set these in <strong>Settings → Property</strong>.</p>
				<h2>Deep linking</h2>
				<p>You can link directly to a specific room type: <code>/book/[publicId]?room=[roomTypeId]</code>. This skips Step 2 and takes the guest straight to confirmation.</p>
			</div>

		{:else if activeId === 'rate-calendar'}
			<div class="prose-help">
				<p class="lead">The rate calendar on the public booking page shows guests the nightly rate for each date before they select their stay.</p>
				<h2>What's shown</h2>
				<ul>
					<li>Each day cell shows <strong>from $X</strong> — the lowest available rate across all room types for that date.</li>
					<li>Stop-sold dates are greyed out and unselectable.</li>
					<li>Past dates are greyed out automatically.</li>
				</ul>
				<h2>Selecting dates</h2>
				<p>Click a date to set check-in, then click another date to set check-out. The range is highlighted. Clicking the check-in/check-out summary below the calendar resets selection.</p>
				<h2>Rate sources</h2>
				<p>The calendar uses per-date rate overrides (from the inventory grid) first, falling back to the active season's rate. Manual-only seasons are excluded. All rates shown are before taxes and extra guest fees.</p>
			</div>

		{:else if activeId === 'booking-promo'}
			<div class="prose-help">
				<p class="lead">Guests can enter a promo code on the booking page to receive a discount.</p>
				<p>See <button onclick={() => select('promo-codes')} class="text-amber-700 underline underline-offset-2 hover:text-amber-900">Promo codes</button> for how to create codes. On the booking page:</p>
				<ol>
					<li>In Step 3, a "Have a promo code?" section appears below the rate breakdown.</li>
					<li>The guest types the code and clicks Apply (or presses Enter).</li>
					<li>The rate quote updates live — the discount is shown as a separate line.</li>
					<li>Invalid or expired codes show no effect (no error message to prevent code fishing).</li>
				</ol>
			</div>

		{:else if activeId === 'deposit-flow'}
			<div class="prose-help">
				<p class="lead">Deposits can be collected online via the Elavon payment integration.</p>
				<p>See <button onclick={() => select('elavon-setup')} class="text-amber-700 underline underline-offset-2">Elavon setup</button> for credential configuration.</p>
				<h2>How it works</h2>
				<ol>
					<li>After a booking is confirmed, open the booking card in the dashboard or grid.</li>
					<li>Click <strong>Charge Deposit</strong>. An Elavon Checkout.js form appears.</li>
					<li>Enter the card details in the hosted iframe (PCI-compliant — card data never touches Rezzzo servers).</li>
					<li>Elavon processes the payment. The deposit is recorded on the folio as a payment event.</li>
				</ol>
			</div>

		{:else if activeId === 'confirm-email'}
			<div class="prose-help">
				<p class="lead">Confirmation emails are sent automatically when a guest books online or when a staff member triggers them manually.</p>
				<h2>Automatic triggers</h2>
				<ul>
					<li><strong>Online booking submitted</strong> — guest confirmation + operator alert sent immediately.</li>
					<li><strong>Booking confirmed</strong> — if a booking moves from pending to confirmed status, a confirmation email is sent to the guest.</li>
					<li><strong>Deposit received</strong> — a deposit receipt is sent after a successful charge.</li>
					<li><strong>Check-out</strong> — a post-stay receipt/folio is emailed to the guest.</li>
				</ul>
				<h2>Pre-arrival emails</h2>
				<p>A pre-arrival email with door code and check-in instructions is sent automatically via a cron job, typically 24–48 hours before check-in. See <button onclick={() => select('email-templates')} class="text-amber-700 underline underline-offset-2">Email templates &amp; cron</button> for setup.</p>
			</div>

		{:else if activeId === 'create-booking'}
			<div class="prose-help">
				<p class="lead">Staff can create bookings manually for phone/walk-in reservations, or for internal blocks.</p>
				<h2>From the booking grid</h2>
				<ol>
					<li>Click an empty cell for the room and date you want.</li>
					<li>A create-booking panel opens. Fill in guest details, dates, channel, and any notes.</li>
					<li>The booking is created and appears on the grid immediately.</li>
				</ol>
				<h2>From the dashboard</h2>
				<p>Click the <strong>+ New Booking</strong> button in the top-right. This opens the same form but requires you to pick a property and room type manually.</p>
				<h2>Booking statuses</h2>
				<ul>
					<li><strong>Confirmed</strong> — normal active booking.</li>
					<li><strong>Pending</strong> — awaiting deposit or confirmation.</li>
					<li><strong>Checked in</strong> — guest has arrived.</li>
					<li><strong>Checked out</strong> — guest has departed.</li>
					<li><strong>Cancelled</strong> — booking is cancelled. Remains visible for record-keeping.</li>
					<li><strong>Blocked</strong> — room is blocked (maintenance, hold). Not bookable but not a real reservation.</li>
				</ul>
			</div>

		{:else if activeId === 'assign-room'}
			<div class="prose-help">
				<p class="lead">When a booking is created (especially online bookings), a specific room may not be assigned yet. Staff assign rooms based on preferences and availability.</p>
				<h2>Assigning from the booking card</h2>
				<p>Open the booking card. If no room is assigned, an "Assign room" button appears. Click to see available rooms for those dates, and select one.</p>
				<h2>Assigning from the grid</h2>
				<p>Unassigned bookings appear in the <strong>Unassigned panel</strong> (usually on the left side of the booking grid). Drag a booking from the panel to a room row to assign it.</p>
				<h2>Child room types</h2>
				<p>For child-type bookings, the room selector shows rooms from the parent type's physical pool (since children have no rooms of their own).</p>
			</div>

		{:else if activeId === 'booking-addons'}
			<div class="prose-help">
				<p class="lead">Add-ons are extra charges added to a booking's folio — pet fees, parking, early check-in, etc.</p>
				<h2>Add-on presets</h2>
				<p>Go to <strong>Settings → Add-ons</strong> to create preset add-ons (name, price, taxable flag). These appear as quick-add options on the booking card.</p>
				<h2>Adding to a booking</h2>
				<ol>
					<li>Open the booking card.</li>
					<li>In the Folio section, click <strong>+ Add-on</strong>.</li>
					<li>Select a preset or enter a custom item with description and amount.</li>
					<li>The item appears on the folio and is included in the receipt.</li>
				</ol>
			</div>

		{:else if activeId === 'folio-receipt'}
			<div class="prose-help">
				<p class="lead">Every booking has a folio — a running total of charges and payments.</p>
				<h2>Line items</h2>
				<p>The folio shows rate charges (auto-created at booking), add-ons, taxes, and payment events (deposits, refunds).</p>
				<h2>Internal receipt</h2>
				<p>Staff can view a full formatted receipt at <code>/booking/[id]/receipt</code>.</p>
				<h2>Public receipt link</h2>
				<p>Each booking has a unique public token. Staff can copy a guest-accessible receipt link from the internal receipt page. Guests can view their folio without logging in at <code>/receipt/[token]</code>.</p>
				<p>Post-checkout, this link is included in the checkout email automatically.</p>
			</div>

		{:else if activeId === 'group-bookings'}
			<div class="prose-help">
				<p class="lead">Group bookings let you block multiple rooms for a single group (weddings, sports teams, corporate retreats).</p>
				<h2>Creating a group</h2>
				<ol>
					<li>On the booking grid, switch to <strong>Draw mode</strong>.</li>
					<li>Drag across multiple room rows and the date range to select the block.</li>
					<li>A group creation dialog appears. Set the group name, organizer details, and billing type (master bill or individual).</li>
				</ol>
				<h2>Managing a group</h2>
				<p>The <strong>Group Card</strong> shows all bookings in the group. Individual names can be added to each room as they're confirmed. Payments can be transferred to/from a master folio.</p>
			</div>

		{:else if activeId === 'move-booking'}
			<div class="prose-help">
				<p class="lead">Bookings can be moved to a different room or dates after creation.</p>
				<h2>Moving to a different room</h2>
				<p>Open the booking card and use <strong>Change Room</strong>. The system checks for conflicts before allowing the move.</p>
				<h2>Changing dates</h2>
				<p>Open the booking card and edit the check-in/out dates. The system validates availability for the new dates.</p>
				<h2>On the grid</h2>
				<p>You can drag a booking block horizontally (to different dates) or vertically (to a different room) directly on the booking grid.</p>
			</div>

		{:else if activeId === 'checkin-out'}
			<div class="prose-help">
				<p class="lead">Check-in and check-out actions update booking status and trigger automated communications.</p>
				<h2>Check-in</h2>
				<ol>
					<li>Open the booking card.</li>
					<li>Click <strong>Check In</strong>. Status changes to "Checked In".</li>
					<li>If a self check-in link hasn't been sent, you can generate and send it from the booking card.</li>
				</ol>
				<h2>Check-out</h2>
				<ol>
					<li>Open the booking card.</li>
					<li>Click <strong>Check Out</strong>. Status changes to "Checked Out".</li>
					<li>A post-stay receipt email is automatically sent to the guest, including the public receipt link.</li>
					<li>The room's housekeeping status is set to "Dirty" automatically.</li>
				</ol>
			</div>

		{:else if activeId === 'guest-profiles'}
			<div class="prose-help">
				<p class="lead">Rezzzo maintains guest profiles with stay history, contact info, and notes.</p>
				<h2>Viewing guests</h2>
				<p>Go to <strong>Guests</strong> to see all guest profiles. Search by name, email, or phone. Click a profile to see their full stay history and notes.</p>
				<h2>Automatic profile creation</h2>
				<p>When a guest books online, a profile is created automatically (or matched by email if one already exists). Staff-created bookings also create profiles.</p>
			</div>

		{:else if activeId === 'create-guest'}
			<div class="prose-help">
				<p class="lead">Staff can create a guest profile manually without an associated booking.</p>
				<h2>How to create</h2>
				<ol>
					<li>Go to <strong>Guests</strong>.</li>
					<li>Click <strong>+ New Guest</strong> in the header.</li>
					<li>Fill in name, email, and phone. Click Create.</li>
					<li>The new profile opens automatically.</li>
				</ol>
				<p>This is useful for pre-registering repeat guests or importing past customer contact information.</p>
			</div>

		{:else if activeId === 'self-checkin'}
			<div class="prose-help">
				<p class="lead">Self check-in lets guests complete arrival formalities online before they arrive, without needing to interact with staff.</p>
				<h2>Generating a self check-in link</h2>
				<ol>
					<li>Open the booking card.</li>
					<li>Click <strong>Self check-in link</strong>. A unique URL is generated and can be emailed to the guest or sent via the pre-arrival cron.</li>
				</ol>
				<h2>What the guest does</h2>
				<ol>
					<li>Opens the link on their phone (no login required).</li>
					<li>Reviews booking details — property, room type, dates, check-in/out times.</li>
					<li>Optionally enters vehicle information (make/model, colour, license plate).</li>
					<li>Checks the policy agreement checkbox and taps <strong>Complete Check-In</strong>.</li>
					<li>The door code and arrival instructions are revealed immediately on screen.</li>
				</ol>
				<h2>What happens automatically</h2>
				<ul>
					<li>Booking status advances from <code>confirmed</code> → <code>checked_in</code>.</li>
					<li><code>waiverSigned</code> is set to <code>true</code> and the timestamp is recorded.</li>
					<li>Vehicle details are saved to the booking record.</li>
					<li>An operator alert email is sent so staff know the guest has arrived.</li>
				</ul>
				<h2>Status in the booking card</h2>
				<p>Once the guest completes self check-in, the booking shows a green "Self checked in" badge with timestamp, and the status badge reads <strong>Checked In</strong>.</p>
			</div>

		{:else if activeId === 'pre-arrival'}
			<div class="prose-help">
				<p class="lead">Rezzzo can automatically send a pre-arrival email with check-in instructions and door codes.</p>
				<h2>Cron job setup</h2>
				<p>Pre-arrival emails are triggered by an external cron service calling a secured API endpoint. See <button onclick={() => select('email-templates')} class="text-amber-700 underline underline-offset-2">Email templates &amp; cron</button> for setup instructions.</p>
				<h2>What's included</h2>
				<ul>
					<li>Property name and check-in date</li>
					<li>Room door code (from room settings)</li>
					<li>Check-in instructions (from room settings)</li>
					<li>Link to the self check-in page if not already completed</li>
				</ul>
				<div class="callout callout-tip">
					Set door codes and instructions per room in <strong>Settings → Rooms</strong> by clicking the door code field on a room row.
				</div>
			</div>

		{:else if activeId === 'digital-waiver'}
			<div class="prose-help">
				<p class="lead">Guests agree to your property policies during self check-in by ticking a checkbox — no separate signature pad is required.</p>
				<h2>Waiver content</h2>
				<p>The policy text displayed to the guest is set per property in <strong>Settings → Property → Policy Text</strong>. Use this field for house rules, cancellation terms, liability waivers, and any other required disclosures.</p>
				<h2>What gets recorded</h2>
				<ul>
					<li><code>waiverSigned: true</code> is stored on the booking record.</li>
					<li><code>selfCheckinAt</code> is set to the exact timestamp of completion.</li>
					<li>Both are visible in the booking card and available in reports.</li>
				</ul>
				<div class="callout callout-tip">
					For operations that legally require a handwritten or captured signature, print the registration card from the booking card (<strong>Print reg. card</strong>) and have the guest sign on arrival.
				</div>
			</div>

		{:else if activeId === 'guest-dedup'}
			<div class="prose-help">
				<p class="lead">Guest deduplication identifies and merges duplicate guest profiles (same guest with slightly different names or email addresses).</p>
				<h2>How to merge</h2>
				<ol>
					<li>Go to <strong>Guests</strong> and search for one of the duplicates.</li>
					<li>Click the guest to open their profile.</li>
					<li>Click <strong>Merge…</strong> in the top-right of the profile.</li>
					<li>Search for the other duplicate record and select it.</li>
					<li>Click <strong>Confirm merge</strong>.</li>
				</ol>
				<p>All bookings from the selected duplicate are moved to the kept profile, and any blank fields (phone, email, address) are filled in from the duplicate. The duplicate record is then deleted.</p>
			</div>

		{:else if activeId === 'elavon-setup'}
			<div class="prose-help">
				<p class="lead">Rezzzo integrates with Elavon Converge for PCI-compliant credit card processing.</p>
				<h2>Getting credentials</h2>
				<ol>
					<li>Log in to your Elavon Converge merchant portal.</li>
					<li>Get your <strong>Merchant ID</strong>, <strong>User ID</strong>, and <strong>PIN</strong>.</li>
					<li>Enter these in <strong>Settings → Property → Elavon</strong>.</li>
				</ol>
				<h2>How it works</h2>
				<p>When charging a deposit, Elavon's Checkout.js renders a hosted card form inside the booking card. Card data goes directly from the guest's browser to Elavon — it never passes through Rezzzo servers. Rezzzo receives only a transaction ID and last 4 digits.</p>
			</div>

		{:else if activeId === 'charge-deposit'}
			<div class="prose-help">
				<p class="lead">Deposits are charged directly from the booking card using Elavon.</p>
				<h2>Steps</h2>
				<ol>
					<li>Open the booking card.</li>
					<li>Click <strong>Charge Deposit</strong>.</li>
					<li>A dialog appears with the Elavon hosted card form.</li>
					<li>Enter the amount and card details (or use a saved token if available).</li>
					<li>Click Charge. Elavon processes the transaction.</li>
					<li>On success, a payment event is recorded on the folio with the transaction ID and last 4 digits.</li>
				</ol>
			</div>

		{:else if activeId === 'refunds-voids'}
			<div class="prose-help">
				<p class="lead">Payments can be voided (same day) or refunded (after settlement) from the booking card.</p>
				<h2>Void</h2>
				<p>Available the same day as the original transaction (before settlement). A void cancels the transaction entirely — the guest is never charged.</p>
				<h2>Refund</h2>
				<p>Available after the transaction has settled (typically next business day). A refund returns the specified amount to the guest's card.</p>
				<h2>How to refund/void</h2>
				<ol>
					<li>Open the booking card, find the payment event in the folio.</li>
					<li>Click <strong>Void</strong> or <strong>Refund</strong> next to the payment.</li>
					<li>Enter the amount (for partial refunds) and confirm.</li>
				</ol>
			</div>

		{:else if activeId === 'public-receipt'}
			<div class="prose-help">
				<p class="lead">Every booking has a publicly-accessible receipt URL that guests can view without logging in.</p>
				<h2>Sharing the link</h2>
				<ul>
					<li><strong>Automatically</strong> — the public receipt URL is included in the post-checkout email.</li>
					<li><strong>Manually</strong> — on the internal receipt page, click <strong>📋 Copy guest link</strong> to copy the URL.</li>
				</ul>
				<h2>What guests see</h2>
				<p>The public receipt shows: property header with branding, stay dates, room type, itemized charges (rates, add-ons, taxes), payment history, balance, property notes, and cancellation policy.</p>
				<p>Cancelled bookings are not accessible via the public receipt link (returns 404).</p>
			</div>

		{:else if activeId === 'occupancy-report'}
			<div class="prose-help">
				<p class="lead">The Reports page shows occupancy, revenue, taxes, and key metrics for any date range.</p>
				<h2>Accessing reports</h2>
				<p>Go to <strong>Reports</strong>. By default it shows the current month. Use the month navigation arrows or the custom date range inputs to change the period.</p>
				<h2>Summary cards</h2>
				<ul>
					<li><strong>Check-ins</strong> — number of arrivals in the period</li>
					<li><strong>Accommodation</strong> — rate revenue before tax</li>
					<li><strong>Tax collected</strong> — sum of all tax lines</li>
					<li><strong>Payments in</strong> — recorded payments (with refunds broken out)</li>
					<li><strong>ADR</strong> — Average Daily Rate</li>
					<li><strong>RevPAR</strong> — Revenue per Available Room</li>
				</ul>
				<h2>Per-property occupancy</h2>
				<p>Each property gets its own card showing booked nights vs available nights, occupancy %, and RevPAR.</p>
				<h2>Revenue by room type</h2>
				<p>A horizontal bar chart shows accommodation revenue broken down by room type, so you can see which room categories generate the most income.</p>
				<h2>Top guests</h2>
				<p>The top 5 guests (by number of stays in the period) are listed. Useful for identifying repeat customers.</p>
				<h2>Channel &amp; status breakdown</h2>
				<p>Side-by-side cards show bookings by channel (Direct, Booking.com, etc.) and by status (confirmed, checked in, checked out).</p>
				<h2>Export</h2>
				<p>Click the <strong>CSV</strong> button to download a spreadsheet of all bookings for the period.</p>
			</div>

		{:else if activeId === 'adr-revpar'}
			<div class="prose-help">
				<p class="lead">ADR (Average Daily Rate) and RevPAR (Revenue Per Available Room) are key performance metrics for accommodation businesses.</p>
				<h2>Definitions</h2>
				<ul>
					<li><strong>ADR</strong> = Total room revenue ÷ Rooms sold. Measures average rate per sold room.</li>
					<li><strong>RevPAR</strong> = Total room revenue ÷ Rooms available. Measures overall revenue efficiency including vacancies.</li>
				</ul>
				<h2>Where to find them</h2>
				<p>Both metrics appear on the Reports page as summary cards and within each property's occupancy card for the selected period.</p>
			</div>

		{:else if activeId === 'custom-dates'}
			<div class="prose-help">
				<p class="lead">Reports can be filtered by any custom date range, not just calendar months.</p>
				<h2>Using custom dates</h2>
				<ol>
					<li>Go to <strong>Reports</strong>.</li>
					<li>Use the <strong>From</strong> and <strong>To</strong> date inputs at the top.</li>
					<li>Click <strong>Go</strong>. All metrics update for the selected range.</li>
				</ol>
				<p>The report header shows the selected range label. Month-navigation links are also available for quick month-by-month browsing.</p>
			</div>

		{:else if activeId === 'channex-setup'}
			<div class="prose-help">
				<p class="lead">Rezzzo integrates with Channex to distribute inventory and rates to OTA channels (Booking.com, Expedia, etc.).</p>
				<h2>Setup steps</h2>
				<ol>
					<li>Create a Channex account and connect your OTA channels.</li>
					<li>In Rezzzo, add your Channex property ID and API key in Settings.</li>
					<li>Map each Rezzzo room type to its Channex room type ID and rate plan ID in Settings → Rooms.</li>
				</ol>
			</div>

		{:else if activeId === 'ari-sync'}
			<div class="prose-help">
				<p class="lead">ARI (Availability, Rates, Inventory) sync pushes your current rates, restrictions, and availability to connected OTA channels via Channex.</p>
				<h2>What gets synced</h2>
				<ul>
					<li>Nightly rates (from season tiers and per-date overrides)</li>
					<li>Availability counts</li>
					<li>Min stay restrictions</li>
					<li>Stop-sell flags</li>
					<li>Closed to arrival / departure</li>
				</ul>
				<h2>When sync happens</h2>
				<p>ARI is pushed after every online booking, and can be manually triggered from the inventory grid. A full re-sync can be triggered from Settings.</p>
			</div>

		{:else if activeId === 'ota-mapping'}
			<div class="prose-help">
				<p class="lead">OTA room type mapping connects your Rezzzo room types to the corresponding room types in Channex and on each OTA channel.</p>
				<h2>Configuration</h2>
				<p>In <strong>Settings → Rooms</strong>, each room type has two Channex fields:</p>
				<ul>
					<li><strong>Channex Room Type ID</strong> — the UUID of the matching room type in your Channex account.</li>
					<li><strong>Channex Rate Plan ID</strong> — the UUID of the default rate plan in Channex.</li>
				</ul>
				<p>These are found in your Channex dashboard under Properties → Room Types.</p>
			</div>

		{:else if activeId === 'tax-presets'}
			<div class="prose-help">
				<p class="lead">Tax presets let you define reusable tax rates that are applied to bookings automatically.</p>
				<h2>Creating a tax preset</h2>
				<ol>
					<li>Go to <strong>Settings → Taxes</strong>.</li>
					<li>Click <strong>+ Add tax</strong>. Enter the name (e.g. "GST"), rate (e.g. 5%), and whether it applies to room charges, add-ons, or both.</li>
				</ol>
				<h2>Applying taxes</h2>
				<p>When creating a booking or adding line items, applicable tax presets are offered as quick-add items. They calculate automatically based on the taxable amount.</p>
			</div>

		{:else if activeId === 'property-branding'}
			<div class="prose-help">
				<p class="lead">Each property can have its own branding on the public booking page and guest-facing communications.</p>
				<h2>Branding fields</h2>
				<ul>
					<li><strong>Logo URL</strong> — shown in the booking page header and emails.</li>
					<li><strong>Accent colour</strong> — used for buttons, highlights, and the top border on the booking page.</li>
					<li><strong>Booking description</strong> — a short tagline shown in the booking page header.</li>
					<li><strong>Cancellation policy</strong> — shown to guests before they book.</li>
				</ul>
			</div>

		{:else if activeId === 'email-templates'}
			<div class="prose-help">
				<p class="lead">Rezzzo uses Resend for transactional emails. Automated pre-arrival emails are sent via a cron job.</p>
				<h2>Automated emails</h2>
				<ul>
					<li><strong>Booking confirmation</strong> — sent to guest + operator alert on new online booking.</li>
					<li><strong>Deposit receipt</strong> — sent after a successful payment.</li>
					<li><strong>Pre-arrival</strong> — sent 24–48h before check-in via cron job.</li>
					<li><strong>Post-checkout receipt</strong> — sent when booking is checked out.</li>
				</ul>
				<h2>Setting up the cron job</h2>
				<ol>
					<li>Use an external cron service (e.g. cron-job.org, Render Cron).</li>
					<li>Set it to call <code>POST /api/cron/pre-arrival</code> daily at a fixed time (e.g. 10:00 AM).</li>
					<li>Include the header: <code>x-cron-secret: [your-CRON_SECRET env variable]</code>.</li>
				</ol>
				<p>The endpoint finds all bookings checking in tomorrow (or within your configured window) and sends pre-arrival emails to guests who haven't received one yet.</p>
			</div>

		{:else if activeId === 'housekeeping'}
			<div class="prose-help">
				<p class="lead">Rezzzo tracks the housekeeping status of each room to manage cleaning workflows.</p>
				<h2>Status values</h2>
				<ul>
					<li><strong>Clean</strong> — room is ready for guests.</li>
					<li><strong>Dirty</strong> — room needs cleaning (set automatically on check-out).</li>
					<li><strong>In Progress</strong> — currently being cleaned.</li>
					<li><strong>Out of Order</strong> — room is unavailable (maintenance).</li>
				</ul>
				<h2>Updating status</h2>
				<p>Housekeeping status can be updated from the Booking Grid's housekeeping view, or from the room detail panel. A dedicated housekeeping view shows all rooms and their current status for the day.</p>
			</div>

		{:else if activeId === 'multi-property'}
			<div class="prose-help">
				<p class="lead">Rezzzo supports managing multiple properties from a single account.</p>
				<h2>Dashboard property tabs</h2>
				<p>The dashboard has a property tab switcher that filters arrivals, departures, and in-house guests by property. Properties named <code>[Test]</code> are automatically hidden from the dashboard.</p>
				<h2>Property-specific settings</h2>
				<p>Each property has its own: room types, rooms, rate seasons, tax presets, add-on presets, Elavon credentials, and booking page URL. Settings pages are filtered by the currently selected property.</p>
				<h2>Cross-property access</h2>
				<p>All properties in your account are accessible from the same login. Switch between them using the property selector in the navigation or dashboard.</p>
			</div>

		{:else if activeId === 'vs-onres'}
			<div class="prose-help">
				<p class="lead">A feature-by-feature comparison between Rezzzo and OnRes Systems. Updated as new features are added.</p>

				<div class="overflow-x-auto mt-4">
					<table class="comparison-table">
						<thead>
							<tr>
								<th class="w-1/2">Feature</th>
								<th>Rezzzo</th>
								<th>OnRes</th>
							</tr>
						</thead>
						<tbody>
							<!-- Rates -->
							<tr class="section-row"><td colspan="3">Rates & Pricing</td></tr>
							<tr><td>Rate seasons with date ranges</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Per-room-type rates within a season</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Per-date rate overrides</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>LOS (length-of-stay) discounts</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Occupancy-based / extra guest pricing</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Staff-only (manual) rates</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Promo / coupon codes</td><td class="yes">✅</td><td class="no">—</td></tr>
						<tr><td>Min stay (season level)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Min stay (per-date override)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Max stay restriction</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Weekday-based rate variations</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Copy rates from prior year</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<!-- Inventory -->
							<tr class="section-row"><td colspan="3">Inventory & Availability</td></tr>
							<tr><td>Stop-sell per date</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Availability cap (allotment)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Closed to arrival (CTA)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Closed to departure (CTD)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Blackout date range UI</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Parent/child inventory pools</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Gap restrictions (B&B mode)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<!-- Online Booking -->
							<tr class="section-row"><td colspan="3">Online Booking</td></tr>
							<tr><td>Branded public booking page</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Rate calendar widget (prices on calendar)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Room photos & descriptions</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Deep-link to specific room type</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Booking confirmation email</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Group booking (public-facing)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<!-- Reservations -->
							<tr class="section-row"><td colspan="3">Reservations</td></tr>
							<tr><td>Visual booking grid</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Drag-to-create bookings</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Drag-to-move bookings</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Group bookings (staff)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Folio / line items</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Add-ons & extras</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Public receipt link</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<!-- Guests -->
							<tr class="section-row"><td colspan="3">Guest Management</td></tr>
							<tr><td>Guest profiles with stay history</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Self check-in with digital waiver</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Pre-arrival email with door code</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Post-checkout receipt email</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Guest deduplication / merge</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<!-- Payments -->
						<tr class="section-row"><td colspan="3">Payments</td></tr>
						<tr><td>Credit card deposit capture</td><td class="yes">✅ Elavon</td><td class="yes">✅</td></tr>
						<tr><td>Refunds & voids</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Tax calculation</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						<tr><td>Night audit</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<!-- Channels -->
							<tr class="section-row"><td colspan="3">Channels & OTA</td></tr>
						<tr><td>Two-way OTA/GDS sync</td><td class="yes">✅ Channex</td><td class="yes">✅</td></tr>
						<tr><td>ARI push (rates, availability)</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<!-- Reports -->
							<tr class="section-row"><td colspan="3">Reports</td></tr>
							<tr><td>Occupancy report</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>ADR & RevPAR metrics</td><td class="yes">✅</td><td class="yes">✅</td></tr>
							<tr><td>Custom date range</td><td class="yes">✅</td><td class="yes">✅</td></tr>
						</tbody>
					</table>
				</div>
			</div>

		{:else}
			<p class="text-stone-500 text-sm">Select an article from the sidebar.</p>
		{/if}

		</div><!-- /px-6 inner wrapper -->
	</main>
</div>

<style>
	:global(.prose-help) {
		color: #292524;
		line-height: 1.7;
		font-size: 0.9375rem;
	}
	:global(.prose-help .lead) {
		font-size: 1.05rem;
		color: #57534e;
		margin-bottom: 1.25rem;
	}
	:global(.prose-help h2) {
		font-size: 1.1rem;
		font-weight: 700;
		margin-top: 1.75rem;
		margin-bottom: 0.5rem;
		color: #1c1917;
	}
	:global(.prose-help h3) {
		font-size: 0.95rem;
		font-weight: 600;
		margin-top: 1.25rem;
		margin-bottom: 0.25rem;
		color: #1c1917;
	}
	:global(.prose-help p) { margin-bottom: 0.875rem; }
	:global(.prose-help ul, .prose-help ol) {
		margin: 0.5rem 0 1rem 1.25rem;
	}
	:global(.prose-help ul) { list-style-type: disc; }
	:global(.prose-help ol) { list-style-type: decimal; }
	:global(.prose-help li) { margin-bottom: 0.3rem; }
	:global(.prose-help code) {
		background: #f5f5f4;
		border: 1px solid #e7e5e4;
		border-radius: 4px;
		padding: 0.1em 0.4em;
		font-size: 0.85em;
		font-family: ui-monospace, monospace;
	}
	:global(.prose-help pre) {
		background: #1c1917;
		color: #d6d3d1;
		border-radius: 8px;
		padding: 0.875rem 1rem;
		font-size: 0.82rem;
		font-family: ui-monospace, monospace;
		overflow-x: auto;
		margin: 0.75rem 0 1rem;
	}
	:global(.callout) {
		border-left: 3px solid;
		border-radius: 0 8px 8px 0;
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		margin: 1rem 0 1.25rem;
		line-height: 1.6;
	}
	:global(.callout-tip) {
		background: #f0fdf4;
		border-color: #22c55e;
		color: #166534;
	}
	:global(.callout-warning) {
		background: #fffbeb;
		border-color: #f59e0b;
		color: #92400e;
	}
	:global(.callout-planned) {
		background: #f5f5f4;
		border-color: #a8a29e;
		color: #57534e;
	}

	/* Comparison table */
	:global(.comparison-table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	:global(.comparison-table th) {
		background: #f5f5f4;
		font-weight: 600;
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-bottom: 2px solid #e7e5e4;
	}
	:global(.comparison-table td) {
		padding: 0.45rem 0.75rem;
		border-bottom: 1px solid #f5f5f4;
		vertical-align: middle;
	}
	:global(.comparison-table tr:hover td) { background: #fafaf9; }
	:global(.comparison-table .section-row td) {
		background: #1c1917;
		color: #d6d3d1;
		font-weight: 700;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.4rem 0.75rem;
	}
	:global(.comparison-table .yes) { color: #16a34a; text-align: center; }
	:global(.comparison-table .partial) { color: #d97706; text-align: center; white-space: nowrap; }
	:global(.comparison-table .no) { color: #d1d5db; text-align: center; }
</style>
