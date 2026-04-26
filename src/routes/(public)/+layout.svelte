<script lang="ts">
	import '../layout.css';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	let mobileMenuOpen = $state(false);
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<!-- Public Navbar -->
<header class="sticky top-0 z-50 border-b border-white/10 bg-stone-900/95 backdrop-blur">
	<div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
		<!-- Logo -->
		<a href="/" class="flex items-center gap-2">
			<span class="text-xl font-bold tracking-tight text-white">Falcon &amp; Spanish Fiesta</span>
			<span class="hidden text-xs text-stone-400 sm:inline">Motels</span>
		</a>

		<!-- Desktop nav -->
		<nav class="hidden items-center gap-6 text-sm font-medium text-stone-300 md:flex">
			<a href="/#about" class="hover:text-white transition-colors">About</a>
			<a href="/#rooms" class="hover:text-white transition-colors">Rooms</a>
			<a href="/#location" class="hover:text-white transition-colors">Location</a>
			<a href="/#contact" class="hover:text-white transition-colors">Contact</a>
			<a href="/book"
				class="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 transition-colors">
				Book Now
			</a>
		</nav>

		<!-- Mobile hamburger -->
		<button
			class="flex h-9 w-9 items-center justify-center rounded text-stone-300 hover:text-white md:hidden"
			onclick={() => { mobileMenuOpen = !mobileMenuOpen; }}
			aria-label="Toggle menu"
		>
			{#if mobileMenuOpen}
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
			{:else}
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
			{/if}
		</button>
	</div>

	<!-- Mobile menu dropdown -->
	{#if mobileMenuOpen}
		<div class="border-t border-white/10 bg-stone-900 px-4 py-4 space-y-3 md:hidden">
			<a href="/#about" class="block text-stone-300 hover:text-white" onclick={() => { mobileMenuOpen = false; }}>About</a>
			<a href="/#rooms" class="block text-stone-300 hover:text-white" onclick={() => { mobileMenuOpen = false; }}>Rooms</a>
			<a href="/#location" class="block text-stone-300 hover:text-white" onclick={() => { mobileMenuOpen = false; }}>Location</a>
			<a href="/#contact" class="block text-stone-300 hover:text-white" onclick={() => { mobileMenuOpen = false; }}>Contact</a>
			<a href="/book" class="block rounded-full bg-amber-500 px-5 py-2 text-center text-sm font-semibold text-stone-900">
				Book Now
			</a>
		</div>
	{/if}
</header>

<main>
	{@render children()}
</main>

<!-- Footer -->
<footer class="bg-stone-900 text-stone-400 py-12 mt-16">
	<div class="mx-auto max-w-6xl px-4 grid gap-8 sm:grid-cols-2">
		{#each data.properties as prop}
			<div>
				<h3 class="font-semibold text-white mb-2">{prop.name}</h3>
				<p class="text-sm">{prop.address}</p>
				<p class="text-sm">{prop.city}, {prop.province}</p>
				{#if prop.phone}<p class="text-sm mt-1">{prop.phone}</p>{/if}
			</div>
		{/each}
	</div>
	<div class="mx-auto max-w-6xl px-4 mt-8 border-t border-white/10 pt-6 text-xs text-stone-500 flex justify-between">
		<span>© {new Date().getFullYear()} Falcon &amp; Spanish Fiesta Motels. All rights reserved.</span>
		<a href="/auth/login" class="hover:text-stone-300 transition-colors">Staff Login</a>
	</div>
</footer>
