<script lang="ts">
	import type { LayoutData } from './$types';
	import Navbar from '$lib/components/navbar/Navbar.svelte';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();
</script>

<div class="flex min-h-screen flex-col">
	<Navbar user={data.user} pendingUserCount={data.pendingUserCount} />
	<main class="flex flex-1 flex-col">
		{@render children()}
	</main>
</div>
