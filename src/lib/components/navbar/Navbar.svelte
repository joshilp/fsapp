<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import Logout from '$lib/components/logout/Logout.svelte';
	import type { User } from 'better-auth/minimal';

	type Props = {
		user?: User | null;
		pendingUserCount?: number;
		isMockMode?: boolean;
	};

	let { user, pendingUserCount = 0, isMockMode = false }: Props = $props();
</script>

<header class="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur print:hidden">
	<div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
		<a href={user ? '/dashboard' : '/'} class="font-semibold tracking-tight">fsapp</a>

		<nav class="flex items-center gap-2">
		{#if user}
			<Button href="/dashboard" variant="ghost" size="sm">Dashboard</Button>
			<Button href="/booking" variant="ghost" size="sm">Grid</Button>
			<Button href="/inventory" variant="ghost" size="sm">Inventory</Button>
			<Button href="/housekeeping" variant="ghost" size="sm">HK</Button>
			<Button href="/night-audit" variant="ghost" size="sm">Audit</Button>
			<Button href="/rates" variant="ghost" size="sm">Rates</Button>
			<Button href="/guests" variant="ghost" size="sm">Guests</Button>
			<Button href="/reports" variant="ghost" size="sm">Reports</Button>
			<Button href="/settings" variant="ghost" size="sm">Settings</Button>
			{#if isMockMode}
				<Button href="/dev/channex" variant="ghost" size="sm" class="text-amber-600 hover:text-amber-800">Dev</Button>
			{/if}
				<Button href="/admin/users" variant="ghost" size="sm" class="relative">
				Users
				{#if pendingUserCount > 0}
					<span class="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center px-1 leading-none">
						{pendingUserCount}
					</span>
				{/if}
			</Button>
				<span class="text-muted-foreground hidden text-sm sm:inline">{user.name}</span>
				<Logout size="sm" />
			{:else}
				<Button href="/auth/login" size="sm" variant="ghost">Sign In</Button>
				<Button href="/auth/login" size="sm">Get Started</Button>
			{/if}
		</nav>
	</div>
</header>
