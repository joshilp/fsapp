<script lang="ts">
	import '../layout.css';

	let { children }: { children: import('svelte').Snippet } = $props();

	let mobileMenuOpen = $state(false);
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<header class="sticky top-0 z-50 border-b border-white/10 bg-stone-900/95 backdrop-blur">
	<div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
		<a href="/" class="flex items-center gap-2">
			<span class="text-xl font-bold tracking-tight text-white">Rezzzo</span>
			<span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">PMS</span>
		</a>

		<nav class="hidden items-center gap-6 text-sm font-medium text-stone-300 md:flex">
			<a href="/#features" class="hover:text-white transition-colors">Features</a>
			<a href="/#pricing" class="hover:text-white transition-colors">Pricing</a>
			<a href="/help" class="hover:text-white transition-colors">Help</a>
			<a href="/auth/login"
				class="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 transition-colors">
				Sign in
			</a>
		</nav>

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

	{#if mobileMenuOpen}
		<div class="border-t border-white/10 bg-stone-900 px-4 py-4 space-y-3 md:hidden">
			<a href="/#features" class="block text-stone-300 hover:text-white" onclick={() => { mobileMenuOpen = false; }}>Features</a>
			<a href="/#pricing" class="block text-stone-300 hover:text-white" onclick={() => { mobileMenuOpen = false; }}>Pricing</a>
			<a href="/help" class="block text-stone-300 hover:text-white" onclick={() => { mobileMenuOpen = false; }}>Help</a>
			<a href="/auth/login" class="block rounded-full bg-amber-500 px-5 py-2 text-center text-sm font-semibold text-stone-900">
				Sign in
			</a>
		</div>
	{/if}
</header>

<main>
	{@render children()}
</main>

<footer class="bg-stone-900 text-stone-400 py-12 mt-16">
	<div class="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
		<div>
			<p class="font-bold text-white text-lg">Rezzzo</p>
			<p class="text-sm mt-1">Property management for independent motels.</p>
		</div>
		<div class="flex gap-6 text-sm">
			<a href="/#features" class="hover:text-stone-300 transition-colors">Features</a>
			<a href="/#pricing" class="hover:text-stone-300 transition-colors">Pricing</a>
			<a href="/auth/login" class="hover:text-stone-300 transition-colors">Sign in</a>
		</div>
	</div>
	<div class="mx-auto max-w-6xl px-4 mt-8 border-t border-white/10 pt-6 text-xs text-stone-500 flex justify-between">
		<span>© {new Date().getFullYear()} Rezzzo. All rights reserved.</span>
	</div>
</footer>
