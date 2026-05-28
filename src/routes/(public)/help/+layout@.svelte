<script lang="ts">
	import '../../layout.css';
	let { children }: { children: import('svelte').Snippet } = $props();
	let mobileMenuOpen = $state(false);
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<!-- Fixed top nav -->
<header class="fixed inset-x-0 top-0 z-50 h-14 border-b border-white/10 bg-stone-900/95 backdrop-blur">
	<div class="mx-auto flex h-full max-w-full items-center justify-between px-4">
		<a href="/" class="flex items-center gap-2">
			<span class="text-lg font-bold tracking-tight text-white">Rezzzo</span>
			<span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">PMS</span>
		</a>

		<nav class="hidden items-center gap-5 text-sm font-medium text-stone-300 md:flex">
			<a href="/" class="hover:text-white transition-colors">Home</a>
			<a href="/help" class="text-amber-400 font-semibold">Help</a>
			<a href="/auth/login"
				class="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-stone-900 hover:bg-amber-400 transition-colors">
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
			<a href="/" class="block text-stone-300 hover:text-white" onclick={() => { mobileMenuOpen = false; }}>Home</a>
			<a href="/help" class="block text-amber-400 font-semibold" onclick={() => { mobileMenuOpen = false; }}>Help</a>
			<a href="/auth/login" class="block rounded-full bg-amber-500 px-5 py-2 text-center text-sm font-semibold text-stone-900">
				Sign in
			</a>
		</div>
	{/if}
</header>

<!-- Page body: fills viewport below the fixed header -->
<div class="flex pt-14" style="height: 100dvh;">
	{@render children()}
</div>
