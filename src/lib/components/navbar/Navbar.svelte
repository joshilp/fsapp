<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import Logout from '$lib/components/logout/Logout.svelte';
	import type { User } from 'better-auth/minimal';

	type Props = {
		user?: User | null;
	};

	let { user }: Props = $props();
</script>

<header class="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
	<div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
		<a href="/" class="font-semibold tracking-tight">fsapp</a>

		<nav class="flex items-center gap-2">
			{#if user}
				<Button href="/booking" variant="ghost" size="sm">Grid</Button>
				<span class="text-muted-foreground hidden text-sm sm:inline">{user.name}</span>
				<Logout size="sm" />
			{:else}
				<Button href="/auth/login" size="sm" variant="ghost">Sign In</Button>
				<Button href="/auth/login" size="sm">Get Started</Button>
			{/if}
		</nav>
	</div>
</header>
