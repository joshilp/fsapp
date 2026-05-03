<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let q = $state(data.q);
	let savingRating = $state(false);
	let savingGuest = $state(false);
	let editingGuest = $state(false);

	function ratingLabel(r: number | null) {
		if (!r) return null;
		return ['', '★ Excellent', '★★ Good', '★★★ Average', '⚠ Caution', '⛔ Do Not Host'][r];
	}
	function ratingColour(r: number | null) {
		if (!r) return '';
		return ['', 'text-green-700 bg-green-50', 'text-blue-700 bg-blue-50', 'text-gray-700 bg-gray-50', 'text-amber-700 bg-amber-50', 'text-red-700 bg-red-50'][r];
	}

	function formatDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function searchUrl(newQ: string) {
		const p = new URLSearchParams();
		if (newQ) p.set('q', newQ);
		if (data.selectedId) p.set('id', data.selectedId);
		return `/guests?${p}`;
	}

	function selectGuest(id: string) {
		const p = new URLSearchParams();
		if (q) p.set('q', q);
		p.set('id', id);
		goto(`/guests?${p}`);
	}
</script>

<svelte:head>
	<title>Guest Directory</title>
</svelte:head>

<div class="flex min-h-screen">

	<!-- ── Left: search + list ──────────────────────────────────────────────── -->
	<div class="w-72 shrink-0 border-r flex flex-col">
		<div class="p-3 border-b">
			<h1 class="font-bold text-sm mb-2">Guests</h1>
			<form method="GET" action="/guests" class="flex gap-1">
				{#if data.selectedId}
					<input type="hidden" name="id" value={data.selectedId} />
				{/if}
				<input
					name="q"
					bind:value={q}
					placeholder="Name, phone, or email…"
					class="flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				<button type="submit" class="rounded border px-2 py-1.5 text-sm hover:bg-muted">🔍</button>
			</form>
			{#if data.q && data.guestList.length === 0}
				<p class="text-xs text-muted-foreground mt-1.5">No results for "{data.q}"</p>
			{:else if !data.q}
				<p class="text-xs text-muted-foreground mt-1.5">Enter at least 2 characters to search.</p>
			{/if}
		</div>

		<div class="flex-1 overflow-y-auto">
			{#each data.guestList as g}
				<button
					onclick={() => selectGuest(g.id)}
					class="w-full text-left px-3 py-2.5 border-b text-sm hover:bg-muted/50 transition-colors {data.selectedId === g.id ? 'bg-muted' : ''}"
				>
					<div class="flex items-center gap-1.5">
						<span class="font-medium truncate flex-1">{g.name}</span>
						{#if g.rating}
							<span class="text-[10px] rounded px-1 py-0.5 shrink-0 {ratingColour(g.rating)}">
								{[,'★','★★','★★★','⚠','⛔'][g.rating]}
							</span>
						{/if}
					</div>
					{#if g.phone}
						<p class="text-xs text-muted-foreground">{g.phone}</p>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- ── Right: guest detail ───────────────────────────────────────────── -->
	<div class="flex-1 min-w-0 overflow-y-auto p-5">
		{#if data.selectedGuest}
			{@const guest = data.selectedGuest}

			<div class="max-w-2xl">
				<!-- Header -->
				<div class="mb-5 flex items-start gap-3">
					<div class="flex-1 min-w-0">
						<h2 class="text-xl font-bold">{guest.name}</h2>
						<div class="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
							{#if guest.phone}<span>📞 {guest.phone}</span>{/if}
							{#if guest.email}<span>✉ {guest.email}</span>{/if}
							{#if guest.city}<span>📍 {guest.city}{guest.provinceState ? `, ${guest.provinceState}` : ''}</span>{/if}
						</div>
					</div>
					<button onclick={() => { editingGuest = !editingGuest; }}
						class="rounded border px-2 py-1 text-xs hover:bg-muted shrink-0">
						{editingGuest ? 'Cancel' : 'Edit'}
					</button>
					<a href="/booking" class="text-xs text-muted-foreground hover:text-foreground">← Grid</a>
				</div>

				<!-- Rating card -->
				<div class="mb-5 rounded-lg border p-4 {guest.rating ? ratingColour(guest.rating).replace('text-', 'border-').split(' ')[0] : ''}">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Guest Rating</p>
					{#if guest.rating}
						<p class="text-base font-bold {ratingColour(guest.rating).split(' ')[0]}">{ratingLabel(guest.rating)}</p>
						{#if guest.ratingNotes}
							<p class="text-sm mt-1 text-muted-foreground">{guest.ratingNotes}</p>
						{/if}
					{:else}
						<p class="text-sm text-muted-foreground">Not yet rated.</p>
					{/if}

					<form method="POST" action="?/rateGuest" class="mt-3 space-y-2"
						use:enhance={() => {
							savingRating = true;
							return async ({ update }) => { savingRating = false; await update({ reset: false }); };
						}}
					>
						<input type="hidden" name="guestId" value={guest.id} />
						<div class="flex gap-1">
							{#each [1, 2, 3, 4, 5] as n}
								<label class="cursor-pointer">
									<input type="radio" name="rating" value={n} checked={guest.rating === n} class="sr-only" />
									<span class="block rounded border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors
										{guest.rating === n ? [,'bg-green-100 border-green-400 text-green-800','bg-blue-100 border-blue-400 text-blue-800','bg-gray-100 border-gray-400','bg-amber-100 border-amber-400 text-amber-800','bg-red-100 border-red-500 text-red-800'][n] : ''}">
										{['','★ Great','★★ OK','★★★ Avg','⚠ Watch','⛔ Block'][n]}
									</span>
								</label>
							{/each}
						</div>
						<textarea name="ratingNotes" rows="2" placeholder="Notes (visible to operator only)…"
							class="w-full rounded border border-input bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
						>{guest.ratingNotes ?? ''}</textarea>
						<button type="submit" disabled={savingRating}
							class="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
							{savingRating ? 'Saving…' : 'Save Rating'}
						</button>
					</form>
				</div>

				<!-- Edit contact info -->
				{#if editingGuest}
					<div class="mb-5 rounded-lg border p-4">
						<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Edit Contact Info</p>
						<form method="POST" action="?/updateGuest" class="grid grid-cols-2 gap-3"
							use:enhance={() => {
								savingGuest = true;
								return async ({ update }) => { savingGuest = false; editingGuest = false; await update({ reset: false }); };
							}}
						>
							<input type="hidden" name="guestId" value={guest.id} />
							{#each [['name','Name',guest.name],['phone','Phone',guest.phone],['email','Email',guest.email],['street','Street',guest.street],['city','City',guest.city],['province','Province',guest.provinceState],['country','Country',guest.country]] as [field, label, val]}
								<div class="flex flex-col gap-1">
									<label class="text-xs text-muted-foreground">{label}</label>
									<input name={field} value={val ?? ''} class="rounded border border-input bg-background px-2 py-1.5 text-sm" />
								</div>
							{/each}
							<div class="col-span-2 flex flex-col gap-1">
								<label class="text-xs text-muted-foreground">Internal notes</label>
								<textarea name="notes" rows="2"
									class="rounded border border-input bg-background px-2 py-1.5 text-sm">{guest.notes ?? ''}</textarea>
							</div>
							<div class="col-span-2">
								<button type="submit" disabled={savingGuest}
									class="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50">
									{savingGuest ? 'Saving…' : 'Save'}
								</button>
							</div>
						</form>
					</div>
				{/if}

				<!-- Booking history -->
				<div>
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
						Booking History ({data.guestBookings.length})
					</p>
					{#if data.guestBookings.length === 0}
						<p class="text-sm text-muted-foreground">No bookings found.</p>
					{:else}
						<div class="space-y-1">
							{#each data.guestBookings as b}
								<a href="/booking/{b.id}/print" target="_blank"
									class="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors">
									<div class="flex-1 min-w-0">
										<span class="font-medium">{formatDate(b.checkInDate)}</span>
										<span class="text-muted-foreground"> → {formatDate(b.checkOutDate)}</span>
										<span class="text-muted-foreground ml-1">({b.nights}n)</span>
									</div>
									<div class="text-xs text-muted-foreground shrink-0">
										{b.propertyName ?? ''}{b.roomNumber ? ` · Rm ${b.roomNumber}` : ''}
									</div>
									<div class="text-xs shrink-0">
										{b.totalCents > 0 ? `$${(b.totalCents / 100).toFixed(0)}` : '—'}
									</div>
									<span class="text-[10px] rounded px-1.5 py-0.5 font-medium shrink-0
										{b.status === 'checked_out' ? 'bg-gray-100 text-gray-600' :
										 b.status === 'checked_in' ? 'bg-green-100 text-green-700' :
										 b.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}">
										{b.status.replace('_', ' ')}
									</span>
								</a>
							{/each}
						</div>
					{/if}
				</div>
			</div>

		{:else}
			<div class="flex flex-col items-center justify-center h-full text-center py-20">
				<div class="text-4xl mb-3">👤</div>
				<h2 class="font-semibold mb-1">Guest Directory</h2>
				<p class="text-sm text-muted-foreground">Search by name, phone, or email to find a guest.</p>
				<p class="text-xs text-muted-foreground mt-1">Click a guest to view their history and rating.</p>
			</div>
		{/if}
	</div>
</div>
